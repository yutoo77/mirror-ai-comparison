import { ArrowRight, FlaskConical, Plus } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { EmptyState, PageIntro } from '../../components/ui';
import { formatPercent, formatShortDate } from '../../domain/metrics';
import { actionComparison } from '../../domain/experiments';
import { ExperimentRoom } from './ExperimentRoom';

export function ActionsPage() {
  const { active } = useWorkspace();
  const { actionId } = useParams();
  const [search] = useSearchParams();
  if (actionId) {
    const action = active.actions.find((item) => item.id === actionId);
    return action ? (
      <ExperimentRoom
        key={`${active.workspace.id}:${action.id}`}
        action={action}
      />
    ) : (
      <EmptyState
        title="改善案が見つかりません"
        description="別のWorkspaceの記録か、存在しないURLです。"
        action={
          <Link className="button button--primary" to="/actions">
            改善一覧へ
          </Link>
        }
      />
    );
  }
  const selectedId = search.get('selected');
  const actions = [...active.actions].sort((a, b) =>
    a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0,
  );
  return (
    <div className="page-stack">
      <PageIntro
        title="改善"
        actions={
          <Link className="button button--secondary" to="/findings">
            <Plus size={17} aria-hidden="true" />
            改善案を作成
          </Link>
        }
      />
      {actions.length ? (
        <section className="experiment-grid">
          {actions.map((action) => {
            const comparison = actionComparison(action);
            return (
              <article
                className={`experiment-card ${selectedId === action.id ? 'is-highlighted' : ''}`}
                key={action.id}
              >
                <header>
                  <span>
                    {action.evaluations?.length
                      ? '検証記録あり'
                      : action.measurementPlan
                        ? '観測・比較中'
                        : '下書き'}
                  </span>
                  <span>{action.owner}</span>
                </header>
                <h2>
                  <Link to={`/actions/${action.id}`}>{action.title}</Link>
                </h2>
                {action.measurementPlan ? (
                  <div className="experiment-card__scores">
                    <span>
                      変更前 <strong>{formatPercent(comparison.before)}</strong>
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                    <span>
                      変更後{' '}
                      <strong>{formatPercent(comparison.after)}</strong>
                    </span>
                  </div>
                ) : null}
                <footer>
                  <span>
                    {action.channel} · 期限 {formatShortDate(action.dueDate)}
                  </span>
                  <Link className="text-link" to={`/actions/${action.id}`}>
                    開く{' '}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          icon={<FlaskConical size={26} aria-hidden="true" />}
          title="改善案はまだありません"
          description="証拠を確認したFindingから、改善仮説を作成します。"
          action={
            <Link className="button button--primary" to="/findings">
              Findingを確認
            </Link>
          }
        />
      )}
      <details className="experiment-help">
        <summary>比較結果の見方</summary>
        <p>
          前後差は、改善の因果効果ではありません。保存された条件が一致する回答を比較し、件数と判定不能・除外の内訳も残します。下書きの参考値は、条件を固定した検証結果ではありません。
        </p>
      </details>
    </div>
  );
}
