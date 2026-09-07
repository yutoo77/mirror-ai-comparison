import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Database,
  Plus,
  SearchCheck,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { CampaignDetailDialog } from '../../components/CampaignDetailDialog';
import { RunDetailDialog } from '../../components/RunDetailDialog';
import { Badge, EmptyState, PageIntro, ProgressBar, ProviderBadge } from '../../components/ui';
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
  demo: 'Demo',
  manual: 'Manual',
  provider: 'Provider',
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

  const totalPlannedAnswers = active.probes
    .filter((probe) => probe.status === 'active')
    .reduce((total, probe) => total + probe.providers.length * probe.repetitions, 0);

  const selectTab = (nextTab: ObserveTab) => {
    setSearchParams(nextTab === 'probes' ? {} : { tab: nextTab });
  };

  const openRun = (runId: string) => {
    setSearchParams({ tab: 'runs', run: runId });
  };

  const openCampaign = (campaignId: string) => {
    setSearchParams({ tab: 'campaigns', campaign: campaignId });
  };

  const closeRun = () => {
    setSearchParams({ tab: 'runs' });
  };

  const closeCampaign = () => {
    setSearchParams({ tab: 'campaigns' });
  };

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="OBSERVE"
        title="誰が、何を知りたいかから質問を設計"
        description="質問、対象Claim、AI、言語、繰り返し回数を固定し、比較できる観測条件を作ります。"
        actions={
          <button className="button button--primary" type="button" onClick={() => setBuilderOpen(true)} disabled={verifiedClaimCount === 0}>
            <Plus aria-hidden="true" size={17} />新しい質問
          </button>
        }
      />

      <section className="observe-summary">
        <div><span>有効な質問</span><strong>{active.probes.filter((probe) => probe.status === 'active').length}</strong></div>
        <div><span>次回の予定回答</span><strong>{totalPlannedAnswers}</strong></div>
        <div><span>保存済み回答</span><strong>{active.runs.length}</strong></div>
        <div><span>最終観測</span><strong className="small-value">{formatDate(active.workspace.lastMeasuredAt)}</strong></div>
      </section>

      <div className="tabs" role="tablist" aria-label="観測ビュー">
        <button role="tab" aria-selected={tab === 'probes'} className={tab === 'probes' ? 'is-active' : ''} onClick={() => selectTab('probes')}>
          質問セット <span>{active.probes.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'campaigns'} className={tab === 'campaigns' ? 'is-active' : ''} onClick={() => selectTab('campaigns')}>
          Campaign <span>{campaigns.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'is-active' : ''} onClick={() => selectTab('runs')}>
          Run artifacts <span>{active.runs.length}</span>
        </button>
      </div>

      {tab === 'probes' ? (
        active.probes.length > 0 ? (
          <section className="probe-grid" role="tabpanel">
            {active.probes.map((probe) => {
              const runs = active.runs.filter((run) => run.probeId === probe.id);
              const metrics = aggregateCampaignMetrics(runs, [probe]);
              return (
                <article key={probe.id} className="probe-card">
                  <header>
                    <span className={`status-dot status-dot--${probe.status}`} />
                    <span>{probe.status === 'active' ? '観測中' : probe.status === 'draft' ? '下書き' : '停止中'}</span>
                    <span className="probe-card__id">{probe.id.split('-').at(-1)}</span>
                  </header>
                  <h2>{probe.question}</h2>
                  <div className="probe-context"><span>{probe.audience}</span><i /> <span>{probe.intent}</span></div>
                  <dl>
                    <div><dt>対象Claim</dt><dd>{probe.targetClaimIds.length}</dd></div>
                    <div><dt>繰り返し</dt><dd>{probe.repetitions}回</dd></div>
                    <div><dt>回答</dt><dd>{runs.length}</dd></div>
                  </dl>
                  <div className="probe-metric">
                    <div><span>対象Claimの言及率</span><strong>{formatPercent(metrics.claimRecall.ratio)}</strong></div>
                    <ProgressBar label="対象Claimの言及率" value={metrics.claimRecall.ratio ?? 0} />
                  </div>
                  <footer>
                    <div className="provider-row">{probe.providers.map((provider) => <ProviderBadge key={provider} provider={provider} />)}</div>
                    <time dateTime={probe.lastRunAt ?? undefined}>{formatDate(probe.lastRunAt)}</time>
                  </footer>
                </article>
              );
            })}
          </section>
        ) : (
          <EmptyState
            icon={<CircleHelp aria-hidden="true" size={26} />}
            title="観測する質問がありません"
            description="承認済みClaimを対象に、利用者がAIへ尋ねそうな質問を作成します。"
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
              const metrics = aggregateCampaignMetrics(succeeded.map((artifact) => artifact.run), active.probes);
              return (
                <article className="campaign-card" key={campaign.id}>
                  <header>
                    <div><Badge tone={campaignTone(campaign.status)}>{campaignLabels[campaign.status]}</Badge><span>{campaign.mode === 'demo' ? 'DETERMINISTIC DEMO' : 'PROVIDER RUN'}</span></div>
                    <time dateTime={campaign.completedAt ?? campaign.plannedAt}>{formatDate(campaign.completedAt ?? campaign.plannedAt)}</time>
                  </header>
                  <div className="campaign-card__content">
                    <div className="campaign-card__identity"><Database aria-hidden="true" size={20} /><div><h2>{campaign.id}</h2><p>入力Snapshotと各Jobの結果を追記専用Artifactとして保存</p></div></div>
                    <dl>
                      <div><dt>保存</dt><dd><CheckCircle2 aria-hidden="true" size={14} />{succeeded.length}/{campaign.plannedRunCount}</dd></div>
                      <div><dt>失敗</dt><dd className={failed > 0 ? 'has-warning' : ''}><AlertTriangle aria-hidden="true" size={14} />{failed}</dd></div>
                      <div><dt>中止</dt><dd className={cancelled > 0 ? 'has-warning' : ''}><Ban aria-hidden="true" size={14} />{cancelled}</dd></div>
                      <div><dt>Provider</dt><dd>{providers.length}</dd></div>
                    </dl>
                    <div className="campaign-card__metrics" aria-label="Campaign指標">
                      <span><small>言及率</small><strong>{formatPercent(metrics.claimRecall.ratio)}</strong></span>
                      <span><small>正確性</small><strong>{formatPercent(metrics.factualAccuracy.ratio)}</strong></span>
                      <span><small>裏付け</small><strong>{formatPercent(metrics.evidenceSupport.ratio)}</strong></span>
                    </div>
                    <div className="campaign-card__providers"><span>{campaign.assessorId}</span>{providers.map((provider) => <ProviderBadge key={provider} provider={provider} />)}</div>
                    <button className="button button--secondary button--compact" type="button" onClick={() => openCampaign(campaign.id)} aria-label={`${campaign.id}のCampaign詳細を開く`}>Campaign詳細<ChevronRight aria-hidden="true" size={16} /></button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <EmptyState icon={<Database size={26} />} title="Campaign履歴はまだありません" description="上部の「観測を開始」から、固定した実行計画を一度動かしてみてください。" />
        )
      ) : null}

      {tab === 'runs' ? (
        <section className="panel run-history" role="tabpanel">
          {active.runs.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>実行日時</th><th>Origin</th><th>Provider</th><th>質問</th><th>対象Claim</th><th>言及率</th><th>検索</th><th><span className="sr-only">詳細</span></th></tr></thead>
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
                        <td>{metrics.claimRecall.denominator}</td>
                        <td><strong>{formatPercent(metrics.claimRecall.ratio)}</strong></td>
                        <td>{run.searchEnabled ? <span className="search-on"><SearchCheck size={15} /> ON</span> : 'OFF'}</td>
                        <td><button className="table-detail-button" type="button" onClick={() => openRun(run.id)} aria-label={`${providerLabels[run.provider]}のRun詳細を開く`}><ChevronRight aria-hidden="true" size={17} /></button></td>
                      </tr>
                    );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Activity size={26} />} title="まだRun artifactがありません" description="Campaignを実行するか、既存のAI回答を取り込んでください。" />
          )}
          {active.runs.length > 0 ? (
            <footer className="table-footer">Demo / Manual / Providerを区別し、回答・判定・fingerprintへ遡れます。</footer>
          ) : null}
        </section>
      ) : null}

      <ProbeBuilderDialog open={builderOpen} onClose={() => setBuilderOpen(false)} />
      <CampaignDetailDialog campaign={selectedCampaign} probes={active.probes} onClose={closeCampaign} onOpenRun={openRun} />
      <RunDetailDialog run={selectedRun} probe={selectedProbe} claims={active.claims} onClose={closeRun} />
    </div>
  );
}
