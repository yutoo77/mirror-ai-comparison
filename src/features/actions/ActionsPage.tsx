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
        eyebrow="IMPROVE"
        title="改善を、確かめられる形に。"
        description="仮説を整え、比較条件を固定し、回答と判断メモをひとつの検証記録に。"
        actions={
          <Link className="button button--secondary" to="/findings">
            <Plus size={17} aria-hidden="true" />
            Findingから作成
          </Link>
        }
      />
      <section className="action-summary" aria-label="検証の進み具合">
        <div>
          <span>条件を固定済み</span>
          <strong>
            {actions.filter((item) => item.measurementPlan).length}
          </strong>
        </div>
        <div>
          <span>検証記録あり</span>
          <strong>
            {actions.filter((item) => item.evaluations?.length).length}
          </strong>
        </div>
        <div>
          <span>改善案</span>
          <strong>{actions.length}</strong>
        </div>
      </section>
      <div className="notice notice--neutral">
        <p>
          前後差は、改善の因果効果ではありません。保存された条件が一致する回答を比較し、件数と判定不能・除外の内訳も残します。
        </p>
      </div>
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
                  <span className="eyebrow">
                    {action.evaluations?.length
                      ? '検証記録あり'
                      : action.measurementPlan
                        ? '観測・比較中'
                        : '比較を設計する'}
                  </span>
                  <span>{action.owner}</span>
                </header>
                <h2>
                  <Link to={`/actions/${action.id}`}>{action.title}</Link>
                </h2>
                <p>{action.hypothesis}</p>
                {action.measurementPlan ? (
                  <div className="experiment-card__scores">
                    <span>
                      変更前 <strong>{formatPercent(comparison.before)}</strong>
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                    <span>
                      記録済み変更後{' '}
                      <strong>{formatPercent(comparison.after)}</strong>
                    </span>
                  </div>
                ) : (
                  <p className="experiment-reference">
                    過去の参考値は保持しています。まだ条件を固定した検証結果ではありません。
                  </p>
                )}
                <footer>
                  <span>
                    {action.channel} · 期限 {formatShortDate(action.dueDate)}
                  </span>
                  <Link className="text-link" to={`/actions/${action.id}`}>
                    検証ワークスペースへ{' '}
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
    </div>
  );
}
