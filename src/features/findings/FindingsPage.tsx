import { useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { PageIntro } from '../../components/ui';
import type { ReviewStatus, RiskLevel } from '../../domain/model';
import { FindingCard } from './FindingCard';
import { IncidentRoom } from './IncidentRoom';

const severityOrder: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function FindingsPage() {
  const { findingId } = useParams();
  const { active } = useWorkspace();
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<'all' | RiskLevel>('all');
  const [review, setReview] = useState<'all' | ReviewStatus>('all');
  const filtered = useMemo(
    () =>
      active.findings
        .filter(
          (finding) =>
            `${finding.title} ${finding.summary}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()) &&
            (severity === 'all' || finding.severity === severity) &&
            (review === 'all' || finding.reviewStatus === review),
        )
        .sort(
          (left, right) =>
            severityOrder[left.severity] - severityOrder[right.severity],
        ),
    [active.findings, query, review, severity],
  );
  const selected = findingId
    ? active.findings.find((finding) => finding.id === findingId)
    : filtered[0];
  const hiddenSelection =
    selected && !filtered.some((finding) => finding.id === selected.id);
  const resetFilters = () => {
    setQuery('');
    setSeverity('all');
    setReview('all');
  };

  return (
    <div
      className={`page-stack findings-page ${findingId ? 'findings-page--detail' : ''}`}
    >
      <PageIntro
        eyebrow="INCIDENT ROOM"
        title="誤解を、証拠から解きほぐす"
        description="気になるズレを選び、元回答をたどり、判断を残す。調査から改善までを、この場所で。"
      />
      <div className="incident-queue-summary" aria-label="調査状況">
        <div>
          <span>未確認</span>
          <strong>
            {
              active.findings.filter(
                (item) => item.reviewStatus === 'unreviewed',
              ).length
            }
          </strong>
        </div>
        <div>
          <span>根拠待ち</span>
          <strong>
            {
              active.findings.filter(
                (item) => item.reviewStatus === 'needs-evidence',
              ).length
            }
          </strong>
        </div>
        <div>
          <span>改善対象</span>
          <strong>
            {
              active.findings.filter(
                (item) => item.reviewStatus === 'confirmed',
              ).length
            }
          </strong>
        </div>
        <p>結論だけでなく、そこへ至った証拠も残す。</p>
      </div>
      <div
        className={`findings-workspace ${findingId ? 'has-route-selection' : ''}`}
      >
        <aside className="findings-list-panel" aria-label="調査するFinding">
          <div className="filter-stack">
            <label className="search-field">
              <Search aria-hidden="true" size={17} />
              <input
                aria-label="Findingを検索"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Findingを検索"
              />
            </label>
            <div className="filter-row">
              <label>
                <span className="sr-only">重大度</span>
                <select
                  value={severity}
                  onChange={(event) =>
                    setSeverity(event.target.value as 'all' | RiskLevel)
                  }
                >
                  <option value="all">すべての重大度</option>
                  <option value="critical">最優先</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </label>
              <label>
                <span className="sr-only">レビュー状態</span>
                <select
                  value={review}
                  onChange={(event) =>
                    setReview(event.target.value as 'all' | ReviewStatus)
                  }
                >
                  <option value="all">すべてのレビュー</option>
                  <option value="unreviewed">未確認</option>
                  <option value="confirmed">確認済み</option>
                  <option value="needs-evidence">根拠待ち</option>
                  <option value="dismissed">対象外</option>
                </select>
              </label>
            </div>
          </div>
          <div className="findings-list-panel__count" aria-live="polite">
            {filtered.length} findings · 重大度順
          </div>
          <div className="finding-list finding-list--full">
            {filtered.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                compact
                selected={finding.id === selected?.id}
              />
            ))}
            {!filtered.length ? (
              <div className="queue-empty">
                <Search size={22} aria-hidden="true" />
                <p>条件に一致するFindingはありません。</p>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={resetFilters}
                >
                  絞り込みを解除
                </button>
              </div>
            ) : null}
          </div>
        </aside>
        <section className="finding-detail-panel" aria-label="選択中の調査">
          {hiddenSelection ? (
            <div className="selection-notice">
              選択中のFindingは絞り込み条件の対象外です。
              <button type="button" onClick={resetFilters}>
                絞り込みを解除
              </button>
            </div>
          ) : null}
          {selected ? (
            <IncidentRoom
              key={`${active.workspace.id}:${selected.id}`}
              finding={selected}
            />
          ) : (
            <div className="empty-detail">
              <Search aria-hidden="true" size={26} />
              <p>
                {findingId
                  ? 'このWorkspaceには、指定されたFindingがありません。'
                  : '一覧から調査するFindingを選んでください。'}
              </p>
              {findingId ? (
                <Link className="text-link" to="/findings">
                  <ArrowLeft size={16} aria-hidden="true" />
                  一覧へ戻る
                </Link>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
