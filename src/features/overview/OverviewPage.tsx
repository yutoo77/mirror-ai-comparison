import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CircleDot,
  FlaskConical,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { TrendChart } from '../../components/TrendChart';
import {
  EmptyState,
  MetricCard,
  PageIntro,
  ProgressBar,
} from '../../components/ui';
import {
  aggregateCampaignMetrics,
  formatDate,
  formatPercent,
  formatShortDate,
} from '../../domain/metrics';
import { actionComparison } from '../../domain/experiments';
import type { ActionStatus, RiskLevel } from '../../domain/model';
import { FindingCard } from '../findings/FindingCard';

const severityOrder: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const actionStatusLabels: Record<ActionStatus, string> = {
  draft: '下書き',
  planned: '予定',
  'in-progress': '対応中',
  measuring: '計測中',
  completed: '完了',
};

export function OverviewPage() {
  const { active } = useWorkspace();
  const metrics = aggregateCampaignMetrics(active.runs, active.probes);
  const priorityFindings = active.findings
    .filter((finding) => finding.status === 'open')
    .sort(
      (left, right) =>
        severityOrder[left.severity] - severityOrder[right.severity],
    )
    .slice(0, 3);
  const providers = new Set(active.runs.map((run) => run.provider));
  const targetedClaims = new Set(
    active.probes
      .filter((probe) => probe.status === 'active')
      .flatMap((probe) => probe.targetClaimIds),
  ).size;
  const topExperiment =
    [...active.actions].reverse().find((action) => action.measurementPlan) ??
    active.actions[0];
  const comparison = topExperiment ? actionComparison(topExperiment) : null;
  const experimentValue = comparison?.after ?? comparison?.before ?? null;

  if (active.sources.length === 0) {
    return (
      <div className="page-stack overview-page">
        <PageIntro
          title="全体の指標"
        />
        <EmptyState
          icon={<BookOpenCheck aria-hidden="true" size={26} />}
          title="まだ公式情報がありません"
          description="比較の基準になる情報を追加してください。"
          action={
            <Link className="button button--primary" to="/sources">
              公式情報を追加
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-stack overview-page">
      <PageIntro
        title="全体の指標"
      />

      <section className="metric-grid" aria-label="主要指標">
        <MetricCard
          label="言及率"
          value={formatPercent(metrics.claimRecall.ratio)}
          tone="accent"
        />
        <MetricCard
          label="事実の正確性"
          value={formatPercent(metrics.factualAccuracy.ratio)}
        />
        <MetricCard
          label="文章による裏付け"
          value={formatPercent(metrics.evidenceSupport.ratio)}
        />
        <MetricCard
          label="回答の安定性"
          value={formatPercent(metrics.stability)}
        />
      </section>

      <details className="overview-definitions">
        <summary>指標の定義と集計範囲</summary>
        <dl>
          <div><dt>言及率</dt><dd>質問ごとに指定した確認項目のうち、回答が言及した割合（{metrics.claimRecall.numerator}/{metrics.claimRecall.denominator}）。</dd></div>
          <div><dt>事実の正確性</dt><dd>言及され、正確さを判定済みの確認項目のうち、正確だった割合。</dd></div>
          <div><dt>文章による裏付け</dt><dd>言及された確認項目のうち、本文との対応または人による確認がある割合。</dd></div>
          <div><dt>回答の安定性</dt><dd>同じ質問での言及率のばらつきから算出します。回答が2件以上ある質問が対象です。</dd></div>
          <div><dt>集計範囲</dt><dd>{active.runs.length} 回答・{active.probes.filter((probe) => probe.status === 'active').length} 質問・{targetedClaims} 確認項目・{providers.size} AI</dd></div>
        </dl>
        <p>最終観測 {formatDate(active.workspace.lastMeasuredAt)}</p>
      </details>

      <div className="overview-priority">
        <section className="panel priority-panel">
          <header className="panel__header">
            <div>
              <h2>要確認 <span className="panel-count">{priorityFindings.length}</span></h2>
            </div>
            <Link className="text-link" to="/findings">すべて見る <ArrowRight aria-hidden="true" size={16} /></Link>
          </header>
          <div className="finding-list">
            {priorityFindings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} compact />
            ))}
          </div>
        </section>

      </div>

      <div className="overview-grid">
        <section className="panel trend-panel">
          <header className="panel__header">
            <div>
              <h2>参考推移</h2>
            </div>
          </header>
          <TrendChart data={active.trend} />
          <p className="section-note">
            条件が異なる履歴を含むため、改善効果の比較には使えません。
          </p>
        </section>

        <aside className="panel experiment-highlight">
          <header className="panel__header">
            <div>
              <h2>最近の改善</h2>
            </div>
            <FlaskConical aria-hidden="true" size={20} />
          </header>
          {topExperiment ? (
            <>
              <span
                className={`status-pill status-pill--${topExperiment.status}`}
              >
                {actionStatusLabels[topExperiment.status]}
              </span>
              <h3>{topExperiment.title}</h3>
              <div className="experiment-score">
                <div>
                  <span>
                    {comparison?.recorded
                      ? '変更前'
                      : `${topExperiment.before.label}（参考値）`}
                  </span>
                  <strong>{formatPercent(comparison?.before ?? null)}</strong>
                </div>
                <ArrowRight aria-hidden="true" size={18} />
                <div>
                  <span>
                    {comparison?.recorded
                      ? '変更後'
                      : '比較条件は未固定'}
                  </span>
                  <strong>{formatPercent(comparison?.after ?? null)}</strong>
                </div>
              </div>
              {experimentValue !== null ? (
                <ProgressBar
                  label={topExperiment.targetMetric}
                  value={experimentValue}
                  tone={comparison?.after != null ? 'success' : 'accent'}
                />
              ) : null}
              <Link className="text-link" to={`/actions/${topExperiment.id}`}>
                詳細を見る <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </>
          ) : null}
        </aside>
      </div>

      <details className="panel activity-panel overview-activity">
        <summary>直近の変更</summary>
        <div className="activity-list">
          {active.activity.slice(0, 4).map((item) => (
            <article key={item.id}>
              <span className={`activity-icon activity-icon--${item.type}`}>
                {item.type === 'action' ? (
                  <FlaskConical size={15} />
                ) : item.type === 'run' ? (
                  <CircleDot size={15} />
                ) : (
                  <CalendarClock size={15} />
                )}
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <time dateTime={item.at}>{formatShortDate(item.at)}</time>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}
