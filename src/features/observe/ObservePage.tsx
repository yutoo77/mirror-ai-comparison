import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CircleHelp,
  Database,
  Plus,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { CampaignDetailDialog } from '../../components/CampaignDetailDialog';
import { RunDetailDialog } from '../../components/RunDetailDialog';
import { Badge, EmptyState, PageIntro, ProviderBadge } from '../../components/ui';
import { aggregateCampaignMetrics, calculateRunMetrics, formatDate, formatPercent } from '../../domain/metrics';
import { providerLabels, type CampaignStatus, type RunOrigin } from '../../domain/model';
import { ProbeBuilderDialog } from './ProbeBuilderDialog';
import { useState } from 'react';

type ObserveTab = 'probes' | 'campaigns' | 'runs';

const campaignLabels: Record<CampaignStatus, string> = {
  planned: '計画済み',
  running: '実行中',
  completed: '完了',
  'completed-with-errors': '一部失敗',
  cancelled: '中止',
};

const originLabels: Record<RunOrigin, string> = {
  demo: 'デモ',
  manual: '手動',
  provider: 'API',
};

function campaignTone(status: CampaignStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'completed-with-errors') return 'warning';
  if (status === 'cancelled') return 'danger';
  if (status === 'running') return 'info';
  return 'neutral';
}

export function ObservePage() {
  const { active } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [builderOpen, setBuilderOpen] = useState(false);
  const requestedTab = searchParams.get('tab');
  const tab: ObserveTab = requestedTab === 'runs' || requestedTab === 'campaigns' ? requestedTab : 'probes';
  const selectedRun = active.runs.find((run) => run.id === searchParams.get('run')) ?? null;
  const selectedProbe = active.probes.find((probe) => probe.id === selectedRun?.probeId);
  const campaigns = active.campaigns ?? [];
  const selectedCampaign = campaigns.find((campaign) => campaign.id === searchParams.get('campaign')) ?? null;
  const verifiedClaimCount = active.claims.filter((claim) => claim.status === 'verified').length;

  const selectTab = (nextTab: ObserveTab) => {
    setSearchParams(nextTab === 'probes' ? {} : { tab: nextTab });
  };

  const openRun = (runId: string) => {
    setSearchParams({ tab: 'runs', run: runId });
  };

  const previewRun = (runId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('run', runId);
      return next;
    });
  };

  const openCampaign = (campaignId: string) => {
    setSearchParams({ tab: 'campaigns', campaign: campaignId });
  };

  const closeRun = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('run');
      return next;
    });
  };

  const closeCampaign = () => {
    setSearchParams({ tab: 'campaigns' });
  };

  return (
    <div className="page-stack observe-page">
      <PageIntro
        title="質問と回答"
        actions={
          <button className="button button--primary" type="button" onClick={() => setBuilderOpen(true)} disabled={verifiedClaimCount === 0}>
            <Plus aria-hidden="true" size={17} />新しい質問
          </button>
        }
      />

      <div className="tabs" role="tablist" aria-label="観測ビュー">
        <button role="tab" aria-selected={tab === 'probes'} className={tab === 'probes' ? 'is-active' : ''} onClick={() => selectTab('probes')}>
          質問 <span>{active.probes.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'campaigns'} className={tab === 'campaigns' ? 'is-active' : ''} onClick={() => selectTab('campaigns')}>
          実行履歴 <span>{campaigns.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'is-active' : ''} onClick={() => selectTab('runs')}>
          回答 <span>{active.runs.length}</span>
        </button>
      </div>

      {tab === 'probes' ? (
        active.probes.length > 0 ? (
          <section className="probe-grid" role="tabpanel">
            {active.probes.map((probe) => {
              const runs = active.runs.filter((run) => run.probeId === probe.id);
              const metrics = aggregateCampaignMetrics(runs, [probe]);
              const latestRun = [...runs].sort((left, right) => right.executedAt.localeCompare(left.executedAt) || right.id.localeCompare(left.id))[0];
              return (
                <article key={probe.id} className="probe-card">
                  <header>
                    <span className={`status-dot status-dot--${probe.status}`} />
                    <span>{probe.status === 'active' ? '観測中' : probe.status === 'draft' ? '下書き' : '停止中'}</span>
                  </header>
                  <h2>{probe.question}</h2>
                  <footer>
                    <div className="provider-row">{probe.providers.map((provider) => <ProviderBadge key={provider} provider={provider} />)}</div>
                    {latestRun ? (
                      <button className="text-link" type="button" onClick={() => previewRun(latestRun.id)}>最新の回答<ChevronRight aria-hidden="true" size={16} /></button>
                    ) : <span className="probe-empty">回答なし</span>}
                  </footer>
                  <details className="probe-settings">
                    <summary>条件</summary>
                    <div className="probe-context"><span>{probe.audience}</span><i /> <span>{probe.intent}</span></div>
                    <dl>
                      <div><dt>確認項目</dt><dd>{probe.targetClaimIds.length}</dd></div>
                      <div><dt>繰り返し</dt><dd>{probe.repetitions}回</dd></div>
                      <div><dt>回答</dt><dd>{runs.length}</dd></div>
                    </dl>
                    <div className="probe-settings__result"><span>言及率 {formatPercent(metrics.claimRecall.ratio)}</span><time dateTime={probe.lastRunAt ?? undefined}>最終実行 {formatDate(probe.lastRunAt)}</time></div>
                  </details>
                </article>
              );
            })}
          </section>
        ) : (
          <EmptyState
            icon={<CircleHelp aria-hidden="true" size={26} />}
            title="まだ質問がありません"
            description={verifiedClaimCount > 0 ? 'AIに聞きたい質問を追加してください。' : '先に公式情報を承認してください。'}
            action={
              verifiedClaimCount > 0 ? (
                <button className="button button--primary" type="button" onClick={() => setBuilderOpen(true)}>質問を作成</button>
              ) : (
                <Link className="button button--primary" to="/sources">先に公式情報を承認</Link>
              )
            }
          />
        )
      ) : null}

      {tab === 'campaigns' ? (
        campaigns.length > 0 ? (
          <section className="campaign-list" role="tabpanel">
            {[...campaigns].reverse().map((campaign) => {
              const succeeded = campaign.artifacts.filter((artifact) => artifact.status === 'succeeded');
              const failed = campaign.artifacts.filter((artifact) => artifact.status === 'failed').length;
              const cancelled = campaign.artifacts.filter((artifact) => artifact.status === 'cancelled').length;
              const providers = [...new Set(campaign.artifacts.map((artifact) => artifact.job.provider))];
              return (
                <article className="campaign-card" key={campaign.id}>
                  <header>
                    <div><Badge tone={campaignTone(campaign.status)}>{campaignLabels[campaign.status]}</Badge><span>{campaign.mode === 'demo' ? 'デモ' : 'API'}</span></div>
                    <time dateTime={campaign.completedAt ?? campaign.plannedAt}>{formatDate(campaign.completedAt ?? campaign.plannedAt)}</time>
                  </header>
                  <div className="campaign-card__content">
                    <div className="campaign-result">
                      <strong>{succeeded.length}/{campaign.plannedRunCount} 件の回答</strong>
                      {failed > 0 ? <span className="has-warning"><AlertTriangle aria-hidden="true" size={14} />失敗 {failed}件</span> : null}
                      {cancelled > 0 ? <span>中止 {cancelled}件</span> : null}
                    </div>
                    <div className="provider-row">{providers.map((provider) => <ProviderBadge key={provider} provider={provider} />)}</div>
                    <button className="button button--secondary button--compact" type="button" onClick={() => openCampaign(campaign.id)} aria-label={`${formatDate(campaign.completedAt ?? campaign.plannedAt)}の実行結果を開く`}>結果を見る<ChevronRight aria-hidden="true" size={16} /></button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <EmptyState icon={<Database size={26} />} title="まだ実行履歴がありません" description="「観測を開始」から回答を集められます。" />
        )
      ) : null}

      {tab === 'runs' ? (
        <section className="panel run-history" role="tabpanel">
          {active.runs.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>日時</th><th>取得方法</th><th>AI</th><th>質問</th><th>言及率</th><th><span className="sr-only">回答を開く</span></th></tr></thead>
                <tbody>
                  {[...active.runs]
                    .sort((left, right) => right.executedAt.localeCompare(left.executedAt) || right.id.localeCompare(left.id))
                    .map((run) => {
                    const probe = active.probes.find((item) => item.id === run.probeId);
                    if (!probe) return null;
                    const metrics = calculateRunMetrics(run, probe);
                    const origin = run.provenance?.origin ?? 'demo';
                    return (
                      <tr key={run.id}>
                        <td>{formatDate(run.executedAt)}</td>
                        <td><Badge tone={origin === 'manual' ? 'accent' : origin === 'provider' ? 'success' : 'info'}>{originLabels[origin]}</Badge></td>
                        <td><ProviderBadge provider={run.provider} /></td>
                        <td className="table-question">{probe.question}</td>
                        <td><strong>{formatPercent(metrics.claimRecall.ratio)}</strong></td>
                        <td><button className="table-detail-button" type="button" onClick={() => openRun(run.id)} aria-label={`${providerLabels[run.provider]}の回答を開く`}><ChevronRight aria-hidden="true" size={17} /></button></td>
                      </tr>
                    );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Activity size={26} />} title="まだ回答がありません" description="観測を開始するか、AI回答を取り込んでください。" />
          )}
        </section>
      ) : null}

      <ProbeBuilderDialog open={builderOpen} onClose={() => setBuilderOpen(false)} />
      <CampaignDetailDialog campaign={selectedCampaign} probes={active.probes} onClose={closeCampaign} onOpenRun={openRun} />
      <RunDetailDialog run={selectedRun} probe={selectedProbe} claims={active.claims} onClose={closeRun} />
    </div>
  );
}
