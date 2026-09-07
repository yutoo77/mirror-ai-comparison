import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  FileArchive,
  FileCheck2,
  FlaskConical,
  History,
  ScanText,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import {
  Badge,
  ProgressBar,
  ProviderBadge,
  SeverityBadge,
} from '../../components/ui';
import { RunDetailDialog } from '../../components/RunDetailDialog';
import { EvidencePackDialog } from '../../components/EvidencePackDialog';
import { buildIncident, verdictLabels } from '../../domain/incident';
import { formatShortDate } from '../../domain/metrics';
import {
  findingKindLabels,
  providerLabels,
  type Finding,
  type ReviewStatus,
} from '../../domain/model';

const reviewLabels: Record<ReviewStatus, string> = {
  unreviewed: '未確認',
  confirmed: '改善対象と確認',
  dismissed: '対象外',
  'needs-evidence': '根拠待ち',
};
const originLabels = {
  demo: '架空デモ',
  manual: '手動観測',
  provider: 'Provider実行',
};

export function IncidentRoom({ finding }: { finding: Finding }) {
  const { active, reviewFinding, createActionFromFinding } = useWorkspace();
  const navigate = useNavigate();
  const incident = useMemo(
    () => buildIncident(active, finding),
    [active, finding],
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [note, setNote] = useState('');
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(
    finding.reviewStatus === 'unreviewed' ? 'confirmed' : finding.reviewStatus,
  );
  const [feedback, setFeedback] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [showAllRuns, setShowAllRuns] = useState(false);
  const selected =
    incident.observations.find((row) => row.run.id === selectedRunId) ??
    incident.observations.find((row) => row.verdict === 'affected') ??
    incident.observations[0];
  const recentRows = incident.observations.slice(0, 6);
  const visibleRows = showAllRuns
    ? incident.observations
    : selected && !recentRows.includes(selected)
      ? [...recentRows, selected]
      : recentRows;
  const linkedAction = active.actions.find(
    (action) => action.findingId === finding.id,
  );
  const canCreate =
    finding.reviewStatus === 'confirmed' && incident.rate !== null;
  const official = finding.evidence.official;
  const currentClaim = active.claims.find((claim) => claim.id === finding.claimId);
  const currentSource = active.sources.find((source) => source.id === currentClaim?.sourceId);
  const saveReview = () => {
    try {
      reviewFinding(
        finding.id,
        reviewStatus,
        note,
        selected ? [selected.run.id] : [],
      );
      setNote('');
      setReviewError('');
      setFeedback('判断と理由を更新しました。');
    } catch (cause) {
      setReviewError(
        cause instanceof Error
          ? cause.message
          : 'レビューを保存できませんでした。',
      );
    }
  };

  return (
    <article className="finding-detail incident-room">
      <header className="finding-detail__header">
        <Link className="mobile-back-link" to="/findings">
          <ArrowLeft aria-hidden="true" size={16} />
          一覧へ
        </Link>
        <div className="incident-heading-row">
          <div className="finding-detail__meta">
            <SeverityBadge severity={finding.severity} />
            <Badge>{findingKindLabels[finding.kind]}</Badge>
          </div>
          <button
            type="button"
            className="button button--secondary button--compact"
            onClick={() => setPackOpen(true)}
          >
            <FileArchive size={16} aria-hidden="true" />
            監査パック
          </button>
        </div>
        <h2>{finding.title}</h2>
        <p>{finding.summary}</p>
        <ol className="incident-steps" aria-label="調査の流れ">
          <li className="is-complete">
            <span>01</span>検出
          </li>
          <li className="is-current">
            <span>02</span>証拠を確認
          </li>
          <li
            className={
              finding.reviewStatus !== 'unreviewed' ? 'is-complete' : ''
            }
          >
            <span>03</span>判断を記録
          </li>
          <li className={linkedAction?.after ? 'is-complete' : ''}>
            <span>04</span>改善を検証
          </li>
        </ol>
        <dl className="finding-detail__stats">
          <div>
            <dt>この問題の検出率</dt>
            <dd>
              {incident.rate === null
                ? '—'
                : `${Math.round(incident.rate * 100)}%`}
            </dd>
          </div>
          <div>
            <dt>検出 / 判定可能</dt>
            <dd>
              {incident.affected} / {incident.evaluable}
            </dd>
          </div>
          <div>
            <dt>判定不能 / 除外</dt>
            <dd>
              {incident.unassessed} / {incident.excluded}
            </dd>
          </div>
          <div>
            <dt>人間の判断</dt>
            <dd className="incident-review-label">
              {reviewLabels[finding.reviewStatus]}
            </dd>
          </div>
        </dl>
        <p className="incident-method">
          対象Claimの保存Runを、この問題の種類だけで再集計。保存済みの判定を使い、新しいAI評価は行いません。期間・質問・観測方法が異なる回答も含む記述的な集計です。
        </p>
      </header>
      <section className="detail-section">
        <div className="detail-section__title">
          <div>
            <span className="eyebrow">01 / EVIDENCE</span>
            <h3>公式情報と、選んだ回答を比べる</h3>
          </div>
          {selected ? (
            <Badge
              tone={selected.verdict === 'affected' ? 'warning' : 'neutral'}
            >
              {verdictLabels[selected.verdict]}
            </Badge>
          ) : null}
        </div>
        <div className="evidence-compare">
          <article className="evidence-card evidence-card--official">
            <header>
              <FileCheck2 aria-hidden="true" size={18} />
              <span>Findingに保存された公式情報</span>
            </header>
            <blockquote>{official.statement}</blockquote>
            <div className="evidence-excerpt">
              <span>保存された原文</span>
              <p>{official.excerpt || '当時の原文は未収録です。現在の本文で補完していません。'}</p>
              {currentSource && currentSource.snapshot.excerpt !== official.excerpt ? <p className="form-error">現在の保存原文とは異なります。ここではFindingに保存された原文を保持しています。</p> : null}
              {currentClaim?.status === 'review-due' ? <p className="section-note">確認項目は資料更新後の再確認待ちです。以前のレビューを自動で取り消したものではありません。</p> : null}
            </div>
            <footer>
              <div>
                <strong>{official.sourceTitle}</strong>
                <small>{official.capturedAt ? `${formatShortDate(official.capturedAt)} snapshot` : '原文・保存日時は未収録'}</small>
              </div>
              <Link
                to={currentSource ? `/sources?source=${encodeURIComponent(currentSource.id)}` : '/sources'}
                className="text-link"
                aria-label="登録されている公式情報を確認"
              >
                確認
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </article>
          <article className="evidence-card evidence-card--observed">
            <header>
              <Bot aria-hidden="true" size={18} />
              <span>
                {selected ? '選択した回答の記録' : 'Findingに保存された抜粋'}
              </span>
            </header>
            <p className="section-note">
              {formatShortDate(
                selected?.run.executedAt ??
                  finding.evidence.observed.executedAt,
              )}{' '}
              ·{' '}
              {selected
                ? originLabels[selected.run.provenance.origin]
                : '保存抜粋'}
            </p>
            <blockquote>
              {selected
                ? selected.assessment?.observedExcerpt || selected.run.answer
                : finding.evidence.observed.excerpt}
            </blockquote>
            <div className="evidence-excerpt">
              <span>記録時の判定理由</span>
              <p>
                {selected
                  ? (selected.assessment?.rationale ??
                    '対象Claimの判定がないため集計から除外しています。')
                  : finding.evidence.rationale}
              </p>
            </div>
            <footer>
              <div>
                <ProviderBadge
                  provider={
                    selected?.run.provider ?? finding.evidence.observed.provider
                  }
                />
                <small>
                  {selected?.run.model ?? finding.evidence.observed.model}
                </small>
              </div>
              {selected ? (
                <button
                  type="button"
                  className="button button--secondary button--compact"
                  onClick={() => setRunOpen(true)}
                >
                  <ScanText size={15} aria-hidden="true" />
                  回答全文
                </button>
              ) : null}
            </footer>
          </article>
        </div>
        <p className="section-note">
          左右はそれぞれ保存された記録です。公式情報の取得時点と回答時点が異なる場合があります。非検出は回答全体の正しさを意味しません。
        </p>
        {finding.kind === 'outdated' ? (
          <p className="incident-caution">
            「古い情報」は現在の評価項目だけでは再判定できません。保存された証拠と日時を、人間が確認してください。
          </p>
        ) : null}
      </section>
      <section className="detail-section incident-history">
        <div className="detail-section__title">
          <div>
            <span className="eyebrow">02 / OBSERVATIONS</span>
            <h3>回答を切り替えて、広がりを確かめる</h3>
          </div>
          <History size={20} aria-hidden="true" />
        </div>
        <div className="incident-observations" aria-label="関連する回答">
          {visibleRows.map((row) => (
            <button
              key={row.run.id}
              type="button"
              className={`observation-row ${selected?.run.id === row.run.id ? 'is-selected' : ''}`}
              aria-pressed={selected?.run.id === row.run.id}
              onClick={() => setSelectedRunId(row.run.id)}
            >
              <span
                className={`verdict-dot verdict-dot--${row.verdict}`}
                aria-hidden="true"
              />
              <span className="observation-row__main">
                <strong>
                  {row.probe?.question ?? '参照する質問がありません'}
                </strong>
                <small>
                  {providerLabels[row.run.provider]} ·{' '}
                  {originLabels[row.run.provenance.origin]} ·{' '}
                  {new Date(row.run.executedAt).toLocaleString('ja-JP')} · #
                  {row.run.repeatIndex + 1} · {row.run.model}
                </small>
              </span>
              <span className="observation-row__verdict">
                {verdictLabels[row.verdict]}
                <small>{row.run.provenance.assessorId}</small>
              </span>
            </button>
          ))}
          {!incident.observations.length ? (
            <p className="section-note">
              関連する元回答が保存されていません。上のFinding抜粋だけでは再集計できません。
            </p>
          ) : null}
        </div>
        {incident.observations.length > 6 ? (
          <button
            type="button"
            className="text-link incident-more"
            onClick={() => setShowAllRuns(!showAllRuns)}
          >
            {showAllRuns
              ? '直近6件と選択中の回答だけ表示'
              : `全${incident.observations.length}件を表示`}
          </button>
        ) : null}
        <div className="incident-providers">
          {incident.providers.map((row) => (
            <div key={row.provider}>
              <div className="provider-distribution__label">
                <ProviderBadge provider={row.provider} />
                <span>
                  {row.affected} / {row.evaluable} 判定可能
                </span>
              </div>
              {row.rate !== null ? (
                <ProgressBar
                  label={`${providerLabels[row.provider]}の${findingKindLabels[finding.kind]}検出率`}
                  value={row.rate}
                  tone="warning"
                />
              ) : (
                <span className="section-note">判定可能な回答なし</span>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="detail-section incident-review">
        <div className="detail-section__title">
          <div>
            <span className="eyebrow">03 / HUMAN REVIEW</span>
            <h3>判断と、その理由を残す</h3>
          </div>
          <Badge>{reviewLabels[finding.reviewStatus]}</Badge>
        </div>
        <div className="incident-review-form">
          <label>
            <span>今回の判断</span>
            <select
              aria-label="今回の判断"
              value={reviewStatus}
              onChange={(event) =>
                setReviewStatus(event.target.value as ReviewStatus)
              }
            >
              <option value="confirmed">改善対象と確認</option>
              <option value="needs-evidence">根拠待ち・判断を保留</option>
              <option value="dismissed">対象外として閉じる</option>
              <option value="unreviewed">未確認に戻す</option>
            </select>
          </label>
          <label>
            <span>
              判断の理由 <small>必須 · 2,000文字まで</small>
            </span>
            <textarea
              aria-label="判断の理由"
              value={note}
              maxLength={2000}
              rows={3}
              placeholder="どの原文・回答を見て、なぜそう判断したか。次に確かめたいことも残せます。"
              onChange={(event) => {
                setNote(event.target.value);
                setFeedback('');
              }}
            />
          </label>
          <p className="section-note">
            {selected
              ? `参照中の回答：${providerLabels[selected.run.provider]} · ${selected.run.executedAt} · ${selected.run.id}`
              : '元回答への参照なし。Findingの保存抜粋に基づくレビューとして記録します。'}
          </p>
          <div className="incident-review-save">
            <span>保存済みのAI・人手評価は書き換えません。</span>
            <button
              type="button"
              className="button button--primary"
              onClick={saveReview}
              disabled={!note.trim()}
            >
              <Check size={17} aria-hidden="true" />
              判断を保存
            </button>
          </div>
          {reviewError ? (
            <p className="form-error" role="alert">
              {reviewError}
            </p>
          ) : null}
          <p className="review-feedback" role="status">
            {feedback}
          </p>
        </div>
        {finding.reviewHistory?.length ? (
          <ol className="review-history" aria-label="レビュー履歴">
            {[...finding.reviewHistory].reverse().map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{reviewLabels[item.status]}</strong>
                  <time dateTime={item.at}>
                    {new Date(item.at).toLocaleString('ja-JP')}
                  </time>
                </div>
                <p>{item.note}</p>
                {item.runIds?.map((id) => (
                  <button
                    type="button"
                    className="text-link review-run-link"
                    key={id}
                    disabled={
                      !incident.observations.some((row) => row.run.id === id)
                    }
                    onClick={() => {
                      setSelectedRunId(id);
                      setRunOpen(true);
                    }}
                  >
                    参照した回答を開く · {id}
                  </button>
                ))}
              </li>
            ))}
          </ol>
        ) : (
          <p className="section-note">
            理由付きの履歴はまだありません。既存のデモの確認状態には、後付けの理由を生成しません。
          </p>
        )}
      </section>
      <footer className="finding-detail__footer">
        <div>
          <span className="eyebrow">04 / NEXT STEP</span>
          <strong>
            {linkedAction
              ? '改善仮説を確認して、次の検証へ'
              : canCreate
                ? 'この判断を、改善の仮説へ'
                : '改善対象と確認し、判定可能な回答を揃える'}
          </strong>
          <p className="section-note">
            改善案は下書きです。自動で公開・配信することはありません。
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={!linkedAction && !canCreate}
          onClick={() => {
            const id = createActionFromFinding(finding.id);
            if (id) navigate(`/actions?selected=${id}`);
          }}
        >
          <FlaskConical size={17} aria-hidden="true" />
          {linkedAction ? '改善施策を見る' : '改善案を下書き'}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
      <RunDetailDialog
        run={runOpen && selected ? selected.run : null}
        probe={selected?.probe}
        claims={active.claims}
        onClose={() => setRunOpen(false)}
      />
      {packOpen ? (
        <EvidencePackDialog
          finding={finding}
          onClose={() => setPackOpen(false)}
        />
      ) : null}
    </article>
  );
}
