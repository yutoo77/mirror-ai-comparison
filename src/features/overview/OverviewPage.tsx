import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
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
import type { RiskLevel } from '../../domain/model';
import { FindingCard } from '../findings/FindingCard';

const severityOrder: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
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
      <div className="page-stack">
        <PageIntro
          eyebrow="OVERVIEW"
          title={`${active.workspace.subject.displayName}の基準を作りましょう`}
          description="最初に公式情報と重要な事実を登録すると、AI回答との比較を始められます。"
        />
        <EmptyState
          icon={<BookOpenCheck aria-hidden="true" size={26} />}
          title="まだ公式情報がありません"
          description="公式ページの抜粋と、そのページが裏付けるClaimを1件追加してください。"
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
    <div className="page-stack">
      <PageIntro
        eyebrow="OVERVIEW"
        title={`${active.workspace.subject.displayName}のAI上の認識`}
        description="総合点ではなく、いま確認すべき変化と、その根拠を優先して表示します。"
        actions={
          <Link className="button button--secondary" to="/findings">
            すべてのFinding
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        }
      />

      <section className="metric-grid" aria-label="主要指標">
        <MetricCard
          label="対象Claimの言及率"
          value={formatPercent(metrics.claimRecall.ratio)}
          detail={`${metrics.claimRecall.numerator}/${metrics.claimRecall.denominator} target assessments`}
          tone="accent"
        />
        <MetricCard
          label="事実の正確性"
          value={formatPercent(metrics.factualAccuracy.ratio)}
          detail="言及されたClaimのうち正確な回答"
        />
        <MetricCard
          label="文章による裏付け"
          value={formatPercent(metrics.evidenceSupport.ratio)}
          detail="取得済み本文と対応する引用"
        />
        <MetricCard
          label="回答の安定性"
          value={formatPercent(metrics.stability)}
          detail={`${metrics.runCount} runs · ${providers.size} providers`}
        />
      </section>

      <div className="overview-grid overview-grid--priority">
        <section className="panel priority-panel">
          <header className="panel__header">
            <div>
              <span className="eyebrow">NEEDS ATTENTION</span>
              <h2>いま確認すべき{priorityFindings.length}件</h2>
            </div>
            <span className="panel-count">重大度順</span>
          </header>
          <div className="finding-list">
            {priorityFindings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} compact />
            ))}
          </div>
        </section>

        <aside className="panel measurement-card">
          <header className="panel__header">
            <div>
              <span className="eyebrow">MEASUREMENT SCOPE</span>
              <h2>この数値の範囲</h2>
            </div>
            <CircleDot aria-hidden="true" size={20} />
          </header>
          <dl className="measurement-list">
            <div>
              <dt>観測回答</dt>
              <dd>{active.runs.length}</dd>
            </div>
            <div>
              <dt>有効な質問</dt>
              <dd>
                {
                  active.probes.filter((probe) => probe.status === 'active')
                    .length
                }
              </dd>
            </div>
            <div>
              <dt>対象Claim</dt>
              <dd>{targetedClaims}</dd>
            </div>
            <div>
              <dt>プロバイダー</dt>
              <dd>{providers.size}</dd>
            </div>
          </dl>
          <div className="measurement-card__note">
            <CheckCircle2 aria-hidden="true" size={17} />
            <p>質問ごとに明示したClaimだけを分母にしています。</p>
          </div>
          <span className="measurement-card__time">
            最終観測 {formatDate(active.workspace.lastMeasuredAt)}
          </span>
        </aside>
      </div>

      <div className="overview-grid">
        <section className="panel trend-panel">
          <header className="panel__header">
            <div>
              <span className="eyebrow">PERCEPTION TREND</span>
              <h2>認識指標の推移</h2>
            </div>
            <span className="panel-count">保存履歴 · 0–100%</span>
          </header>
          <TrendChart data={active.trend} />
          <p className="section-note">
            保存された参考系列です。サンプルや異なる条件の観測を含むため、期間比較や改善効果を表すものではありません。
          </p>
        </section>

        <aside className="panel experiment-highlight">
          <header className="panel__header">
            <div>
              <span className="eyebrow">LATEST EXPERIMENT</span>
              <h2>改善ループ</h2>
            </div>
            <FlaskConical aria-hidden="true" size={20} />
          </header>
          {topExperiment ? (
            <>
              <span
                className={`status-pill status-pill--${topExperiment.status}`}
              >
                {topExperiment.status}
              </span>
              <h3>{topExperiment.title}</h3>
              <p>{topExperiment.hypothesis}</p>
              <div className="experiment-score">
                <div>
                  <span>
                    {comparison?.recorded
                      ? '固定した変更前'
                      : `${topExperiment.before.label}（参考値）`}
                  </span>
                  <strong>{formatPercent(comparison?.before ?? null)}</strong>
                </div>
                <ArrowRight aria-hidden="true" size={18} />
                <div>
                  <span>
                    {comparison?.recorded
                      ? '記録済み変更後'
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
                検証ワークスペースへ <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </>
          ) : null}
        </aside>
      </div>

      <section className="panel activity-panel">
        <header className="panel__header">
          <div>
            <span className="eyebrow">RECENT ACTIVITY</span>
            <h2>直近の変更</h2>
          </div>
        </header>
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
      </section>
    </div>
  );
}
