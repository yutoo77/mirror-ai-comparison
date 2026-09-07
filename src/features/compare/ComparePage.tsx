import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Check,
  Columns3,
  FileSearch,
  Filter,
  History,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { buildComparison, type ComparisonCell } from '../../domain/comparison';
import {
  providerLabels,
  type ClaimAssessment,
  type ProbeRun,
} from '../../domain/model';
import { Badge, EmptyState } from '../../components/ui';
import { RunDetailDialog } from '../../components/RunDetailDialog';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

const originLabels = {
  demo: '架空デモ',
  manual: '持ち込み',
  provider: 'API取得',
};
const factualityLabels = {
  accurate: '正確',
  partial: '一部正確',
  contradicted: '矛盾',
  unsupported: '裏付けなし',
  'not-assessed': '未評価',
};
const visibilityLabels = {
  mentioned: '言及あり',
  omitted: '言及なし',
  'not-applicable': '対象外',
};
const attributionLabels = {
  correct: '正しい帰属',
  misattributed: '誤った帰属',
  ambiguous: '曖昧',
  'not-applicable': '対象外',
};
const evidenceLabels = {
  'reported-url': 'URLのみ',
  fetched: '本文取得済み',
  'passage-match': '原文と対応',
  'human-verified': '人が確認',
  none: '根拠なし',
};
const stateLabels = {
  assessed: '保存された判定',
  'missing-assessment': '判定の記録なし',
  'duplicate-assessment': '判定が重複',
  'not-targeted': 'この回答の対象外',
  'invalid-target': '対象情報に不整合',
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function defaultAnswers(runs: ProbeRun[]) {
  const ordered = [...runs].sort(
    (a, b) =>
      Date.parse(b.executedAt) - Date.parse(a.executedAt) ||
      a.id.localeCompare(b.id),
  );
  const providers = new Set<string>();
  const distinct = ordered.filter((run) => {
    if (providers.has(run.provider)) return false;
    providers.add(run.provider);
    return true;
  });
  return distinct.slice(0, 3).map((run) => run.id);
}

function needsAttention(cell: ComparisonCell) {
  if (cell.state === 'not-targeted') return false;
  const saved = cell.assessment;
  return (
    cell.state !== 'assessed' ||
    cell.issues.length > 0 ||
    !saved ||
    saved.visibility === 'omitted' ||
    saved.factuality !== 'accurate' ||
    saved.attribution === 'misattributed' ||
    saved.attribution === 'ambiguous' ||
    ['reported-url', 'none'].includes(saved.evidence)
  );
}

function assessmentTone(
  assessment: ClaimAssessment,
): 'danger' | 'warning' | 'success' | 'neutral' {
  if (
    assessment.factuality === 'contradicted' ||
    assessment.attribution === 'misattributed'
  )
    return 'danger';
  if (
    assessment.visibility === 'omitted' ||
    ['partial', 'unsupported'].includes(assessment.factuality)
  )
    return 'warning';
  return assessment.factuality === 'accurate' ? 'success' : 'neutral';
}

export function ComparePage() {
  const { active } = useWorkspace();
  return <ComparisonWorkspace key={active.workspace.id} />;
}

function ComparisonWorkspace() {
  const { active } = useWorkspace();
  const [search, setSearch] = useSearchParams();
  const helpState = {
    returnTo: search.toString() ? `/?${search.toString()}` : '/',
  };
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [inspected, setInspected] = useState<{
    claimId: string;
    runId: string;
  } | null>(null);
  const [fullRunId, setFullRunId] = useState<string | null>(null);
  const defaultProbe =
    active.probes.find((probe) =>
      active.runs.some((run) => run.probeId === probe.id),
    ) ?? active.probes[0];
  const probeId = search.get('probe') ?? defaultProbe?.id ?? '';
  const available = useMemo(
    () =>
      active.runs
        .filter((run) => run.probeId === probeId)
        .sort(
          (a, b) =>
            Date.parse(b.executedAt) - Date.parse(a.executedAt) ||
            a.id.localeCompare(b.id),
        ),
    [active.runs, probeId],
  );
  const requestedIds =
    search.get('selection') === 'custom' || search.has('run')
      ? search.getAll('run')
      : defaultAnswers(available);
  const comparison = buildComparison(active, { probeId, runIds: requestedIds });
  const selectedIds = comparison.runs.map(({ run }) => run.id);
  const conditionsDiffer =
    new Set(
      comparison.runs.map(({ run, question }) =>
        JSON.stringify([question, run.locale, run.searchEnabled]),
      ),
    ).size > 1;
  const rows = comparison.rows.filter(
    (row) =>
      !attentionOnly || row.definitionsDiffer || row.cells.some(needsAttention),
  );
  const inspectedRow = comparison.rows.find(
    (row) => row.claimId === inspected?.claimId,
  );
  const inspectedCell = inspectedRow?.cells.find(
    (cell) => cell.runId === inspected?.runId,
  );
  const inspectedRun = comparison.runs.find(
    (row) => row.run.id === inspectedCell?.runId,
  );
  const fullRun = active.runs.find((run) => run.id === fullRunId) ?? null;
  const changeSelection = (id: string) => {
    setInspected(null);
    const next = new URLSearchParams({ probe: probeId, selection: 'custom' });
    const ids = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
    ids.slice(0, 3).forEach((value) => next.append('run', value));
    setSearch(next);
  };

  return (
    <div className="page-stack compare-page">
      <header className="compare-title">
        <h1>{active.workspace.subject.displayName}のAI認識を比べる</h1>
        <div className="compare-title__links">
          <Link className="text-link" to="/overview">
            <History size={16} aria-hidden="true" />
            全体の指標
          </Link>
          <Link className="text-link" to="/help#comparison" state={helpState}>
            比較の使い方
          </Link>
        </div>
      </header>
      {!active.probes.length ? (
        <EmptyState
          icon={<Columns3 size={26} aria-hidden="true" />}
          title="最初の比較を始めましょう"
          description="公式情報と確認したい事実を登録し、質問を作ると回答を比較できます。"
          action={
            <Link
              className="button button--primary"
              to={
                active.claims.some((claim) => claim.status === 'verified')
                  ? '/observe'
                  : '/sources'
              }
            >
              調査の準備へ
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          }
        />
      ) : (
        <>
          <section className="compare-scope" aria-label="比較の範囲">
            <label className="field compare-scope__select">
              比較する質問
              <select
                value={comparison.probe?.id ?? ''}
                onChange={(event) => {
                  setSearch({ probe: event.target.value });
                  setInspected(null);
                  setAttentionOnly(false);
                }}
              >
                <option value="" disabled>
                  質問を選択
                </option>
                {active.probes.map((probe) => (
                  <option key={probe.id} value={probe.id}>
                    {probe.question}
                  </option>
                ))}
              </select>
            </label>
            {comparison.probe ? (
              <p className="compare-scope__question">
                {comparison.probe.question}
              </p>
            ) : null}
            {comparison.probe ? (
              <div className="compare-scope__context">
                <span>{available.length}件の保存回答</span>
                <Link className="text-link" to="/observe?tab=runs">
                  回答を追加
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <p className="form-error" role="alert">
                このWorkspaceに対応する質問がありません。質問を選び直してください。
              </p>
            )}
          </section>

          {available.length > 0 ? (
            <>
              <details className="compare-picker">
                <summary>
                  <span>比較する回答を選ぶ</span>
                  <span>{comparison.runs.length} / 3件</span>
                </summary>
                <fieldset>
                  <legend>比較する回答（最大3件）</legend>
                  <p className="section-note">
                    最大3件。入れ替えるときは、選択中の回答を1件外してください。
                  </p>
                  <div className="compare-picker__options">
                    {available.map((run) => (
                      <label
                        key={run.id}
                        className={`compare-picker__option ${selectedIds.includes(run.id) ? 'is-selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(run.id)}
                          disabled={
                            !selectedIds.includes(run.id) &&
                            selectedIds.length >= 3
                          }
                          onChange={() => changeSelection(run.id)}
                        />
                        <span>
                          <strong>{providerLabels[run.provider]}</strong>
                          <small>
                            {run.model} · {dateLabel(run.executedAt)} ·{' '}
                            {originLabels[run.provenance.origin]}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </details>

              {comparison.runs.length ? (
                <>
                  {rows.length ? (
                    <a
                      className="compare-jump text-link"
                      href="#comparison-items"
                    >
                      項目の比較へ
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                  <div className="compare-boundary">
                    <p>
                      保存された判定を表示しています。新しい自動検証は行っていません。
                    </p>
                    <Link
                      className="text-link"
                      to="/help#judgments"
                      state={helpState}
                    >
                      判定について
                    </Link>
                  </div>
                  {conditionsDiffer ? (
                    <p className="compare-caution">
                      質問・言語・検索条件に違いがあります。各回答の「質問・取得条件」で確認できます。
                    </p>
                  ) : null}
                  <section
                    className="compare-answers"
                    style={
                      {
                        '--compare-columns': comparison.runs.length,
                      } as CSSProperties
                    }
                    aria-label="選択した回答"
                  >
                    {comparison.runs.map(
                      ({
                        run,
                        question,
                        definitionOrigin,
                        conditionLabels,
                        issues,
                      }) => (
                        <article className="compare-answer" key={run.id}>
                          <header>
                            <div>
                              <h3>{providerLabels[run.provider]}</h3>
                              <span>{run.model}</span>
                            </div>
                            <Badge
                              tone={
                                run.provenance.origin === 'demo'
                                  ? 'info'
                                  : 'neutral'
                              }
                            >
                              {originLabels[run.provenance.origin]}
                            </Badge>
                          </header>
                          <footer>
                            <time dateTime={run.executedAt}>
                              {dateLabel(run.executedAt)}
                            </time>
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => setFullRunId(run.id)}
                              aria-label={`${providerLabels[run.provider]}の回答全文・実行条件`}
                            >
                              回答全文
                              <ArrowRight size={14} aria-hidden="true" />
                            </button>
                          </footer>
                          {issues.length ? (
                            <p className="compare-caution compare-answer__warning">
                              この回答の記録に確認事項あり
                            </p>
                          ) : null}
                          <div className="compare-answer__metadata">
                            <span className="compare-answer__conditions">
                              {run.locale} · 検索
                              {run.searchEnabled ? 'あり' : 'なし'}
                            </span>
                            <details className="compare-condition-details">
                              <summary>質問・取得条件</summary>
                              <p>{question}</p>
                              <small>
                                {definitionOrigin === 'captured'
                                  ? '回答と一緒に保存した質問'
                                  : '当時の質問は未保存。現在の質問を参照しています。'}
                              </small>
                              {conditionLabels.map((label, i) => (
                                <small key={`${label}-${i}`}>{label}</small>
                              ))}
                              <small>
                                {comparison.probe?.audience} ·{' '}
                                {comparison.probe?.intent}
                              </small>
                              {issues.map((issue, i) => (
                                <small key={`issue-${i}`}>{issue}</small>
                              ))}
                            </details>
                          </div>
                        </article>
                      ),
                    )}
                  </section>
                  <section
                    className="compare-findings"
                    id="comparison-items"
                    tabIndex={-1}
                    aria-label="確認項目ごとの比較"
                  >
                    <div className="compare-section-heading">
                      <div>
                        <h2>項目ごとの比較</h2>
                        <span role="status">
                          {rows.length} / {comparison.rows.length}項目
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`button button--secondary button--compact ${attentionOnly ? 'is-filtered' : ''}`}
                        aria-pressed={attentionOnly}
                        onClick={() => setAttentionOnly(!attentionOnly)}
                      >
                        <Filter size={14} aria-hidden="true" />
                        要確認の項目だけ
                      </button>
                    </div>
                    {rows.length ? (
                      rows.map((row, index) => (
                        <article className="compare-fact" key={row.claimId}>
                          <header>
                            <span className="compare-fact__number">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div>
                              <h3>{row.statement}</h3>
                              {row.definitionsDiffer ? (
                                <p className="compare-caution">
                                  保存された確認項目の文が異なります。各回答の対象文を表示しています。
                                </p>
                              ) : null}
                            </div>
                          </header>
                          <div
                            className="compare-fact__cells"
                            style={
                              {
                                '--compare-columns': comparison.runs.length,
                              } as CSSProperties
                            }
                          >
                            {row.cells.map((cell) => {
                              const run = comparison.runs.find(
                                (column) => column.run.id === cell.runId,
                              )!.run;
                              const saved = cell.assessment;
                              return (
                                <section
                                  className="compare-cell"
                                  key={cell.runId}
                                  aria-label={`${providerLabels[run.provider]}の保存判定`}
                                >
                                  <span className="compare-cell__provider">
                                    {providerLabels[run.provider]} ·{' '}
                                    {dateLabel(run.executedAt)}
                                  </span>
                                  {saved ? (
                                    <>
                                      {cell.state !== 'assessed' ? (
                                        <p className="compare-caution">
                                          {stateLabels[cell.state]}
                                          。保存判定の解釈には確認が必要です。
                                        </p>
                                      ) : null}
                                      <div className="compare-cell__badges">
                                        <Badge
                                          tone={
                                            cell.state === 'assessed'
                                              ? assessmentTone(saved)
                                              : 'warning'
                                          }
                                        >
                                          保存判定：
                                          {factualityLabels[saved.factuality]}
                                        </Badge>
                                        <span>
                                          {visibilityLabels[saved.visibility]}
                                        </span>
                                      </div>
                                      {row.definitionsDiffer &&
                                      cell.statement ? (
                                        <p className="compare-cell__definition">
                                          {cell.definitionOrigin === 'captured'
                                            ? '当時の確認項目：'
                                            : '現在の確認項目（当時の定義は未保存）：'}
                                          {cell.statement}
                                        </p>
                                      ) : null}
                                      <blockquote>
                                        {saved.observedExcerpt?.trim() ||
                                          '回答中の抜粋は保存されていません。'}
                                      </blockquote>
                                      <div className="compare-cell__meta">
                                        {[
                                          'misattributed',
                                          'ambiguous',
                                        ].includes(saved.attribution) ? (
                                          <span className="compare-cell__attribution">
                                            帰属：
                                            {
                                              attributionLabels[
                                                saved.attribution
                                              ]
                                            }
                                          </span>
                                        ) : null}
                                        <span>
                                          根拠：{evidenceLabels[saved.evidence]}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="compare-cell__unavailable">
                                      {stateLabels[cell.state]}
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    className="compare-evidence-button"
                                    onClick={() =>
                                      setInspected({
                                        claimId: row.claimId,
                                        runId: cell.runId,
                                      })
                                    }
                                    aria-label={`${providerLabels[run.provider]}の根拠を確認：${row.statement}`}
                                  >
                                    <FileSearch size={16} aria-hidden="true" />
                                    <span>
                                      根拠を確認
                                      <small>{cell.source.label}</small>
                                    </span>
                                    <ArrowRight size={15} aria-hidden="true" />
                                  </button>
                                </section>
                              );
                            })}
                          </div>
                        </article>
                      ))
                    ) : (
                      <EmptyState
                        title={
                          attentionOnly
                            ? '要確認の項目はありません'
                            : '確認項目がありません'
                        }
                        description={
                          attentionOnly
                            ? '選択した回答の保存判定に、このフィルターの対象はありません。新しい検証結果ではありません。'
                            : '質問に確認項目を設定して、回答を取り込んでください。'
                        }
                      />
                    )}
                  </section>
                  {comparison.notices.length > 0 ? (
                    <details className="compare-notices">
                      <summary>
                        比較データの詳細（{comparison.notices.length}件）
                      </summary>
                      {comparison.notices.map((notice, i) => (
                        <p key={i}>{notice}</p>
                      ))}
                    </details>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="比較する回答を選んでください"
                  description="上の「比較する回答を選ぶ」から、最大3件を選択できます。"
                />
              )}
            </>
          ) : comparison.probe ? (
            <EmptyState
              icon={<FileSearch size={26} aria-hidden="true" />}
              title="この質問への回答を集めましょう"
              description="観測を開始するか、既存のAI回答を取り込むと、ここで根拠と一緒に比較できます。"
              action={
                <Link className="button button--primary" to="/observe">
                  観測へ
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              }
            />
          ) : null}
        </>
      )}
      {inspectedCell && inspectedRow && inspectedRun ? (
        <div
          className="compare-inspector-backdrop"
          onMouseDown={() => setInspected(null)}
        >
          <EvidenceInspector
            cell={inspectedCell}
            statement={inspectedCell.statement}
            run={inspectedRun.run}
            onClose={() => setInspected(null)}
            findingId={
              active.findings.find(
                (finding) => finding.claimId === inspectedRow.claimId,
              )?.id
            }
          />
        </div>
      ) : null}
      <RunDetailDialog
        run={fullRun}
        probe={active.probes.find((probe) => probe.id === fullRun?.probeId)}
        claims={active.claims}
        onClose={() => setFullRunId(null)}
      />
    </div>
  );
}

function EvidenceInspector({
  cell,
  statement,
  run,
  onClose,
  findingId,
}: {
  cell: ComparisonCell;
  statement: string | null;
  run: ProbeRun;
  onClose: () => void;
  findingId: string | undefined;
}) {
  const dialogRef = useModalAccessibility<HTMLElement>(true, onClose);
  return (
    <aside
      className="compare-inspector"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-evidence-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          <h2 id="compare-evidence-title">説明と根拠を確かめる</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="根拠を閉じる"
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="compare-inspector__body">
        <section>
          <span className="eyebrow">確認項目</span>
          <h3>{statement ?? 'この回答の対象文は未収録です。'}</h3>
          <small>
            {statement === null
              ? '現在の確認項目を当時の対象文として補完していません。'
              : cell.definitionOrigin === 'captured'
                ? '当時の保存内容'
                : '現在の定義を参照（旧形式の回答）'}
          </small>
        </section>
        <section>
          <span className="eyebrow">
            {providerLabels[run.provider]} · 回答の該当箇所
          </span>
          <blockquote>
            {cell.assessment?.observedExcerpt?.trim() ||
              '個別の抜粋は保存されていません。'}
          </blockquote>
          <details>
            <summary>回答全文を読む</summary>
            <p className="compare-inspector__answer">{run.answer}</p>
          </details>
        </section>
        <section>
          <span className="eyebrow">公式の根拠</span>
          <strong>{cell.source.label}</strong>
          {cell.source.status === 'captured-history' ? <p className="compare-caution">更新後の資料に対する判定ではありません。</p> : null}
          {cell.source.source ? (
            <>
              <h3>{cell.source.source.title}</h3>
              <small className="compare-inspector__url">
                {cell.source.source.url}
              </small>
            </>
          ) : null}
          {cell.source.excerpt ? (
            <blockquote>{cell.source.excerpt}</blockquote>
          ) : (
            <p className="compare-caution">
              この回答に対応する当時の本文は確認できません。現在の資料を当時の根拠として表示していません。
            </p>
          )}
          {cell.source.expectedHash ? (
            <details>
              <summary>保存された資料の識別情報</summary>
              <code>{cell.source.expectedHash}</code>
            </details>
          ) : null}
          {cell.source.version ? <small>原文の保存日時：{dateLabel(cell.source.version.capturedAt)}</small> : null}
          {cell.source.source ? <Link className="text-link" to={`/sources?source=${encodeURIComponent(cell.source.source.id)}`} onClick={onClose}>現在の原文と版履歴を確認<ArrowRight size={14} aria-hidden="true" /></Link> : null}
        </section>
        {cell.assessment ? (
          <section>
            <span className="eyebrow">保存された判断</span>
            <Badge
              tone={
                cell.state === 'assessed'
                  ? assessmentTone(cell.assessment)
                  : 'warning'
              }
            >
              保存判定：{factualityLabels[cell.assessment.factuality]}
            </Badge>
            <p>
              {cell.assessment.rationale || '判定理由は保存されていません。'}
            </p>
            <dl className="compare-inspector__assessment">
              <div>
                <dt>言及</dt>
                <dd>{visibilityLabels[cell.assessment.visibility]}</dd>
              </div>
              <div>
                <dt>帰属</dt>
                <dd>{attributionLabels[cell.assessment.attribution]}</dd>
              </div>
              <div>
                <dt>根拠の状態</dt>
                <dd>{evidenceLabels[cell.assessment.evidence]}</dd>
              </div>
            </dl>
            <small>
              判定者：{cell.assessment.assessedBy ?? '未記録'} ·{' '}
              {cell.assessment.assessedAt
                ? dateLabel(cell.assessment.assessedAt)
                : '日時未記録'}
            </small>
          </section>
        ) : null}
        {cell.issues.length ? (
          <div className="compare-caution">
            {cell.issues.map((issue, i) => (
              <p key={i}>{issue}</p>
            ))}
          </div>
        ) : null}
      </div>
      <footer>
        {findingId ? (
          <Link
            className="button button--primary"
            to={`/findings/${findingId}`}
            onClick={onClose}
          >
            <Check size={16} aria-hidden="true" />
            この項目の調査・判断へ
          </Link>
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={onClose}
          >
            比較へ戻る
          </button>
        )}
      </footer>
    </aside>
  );
}
