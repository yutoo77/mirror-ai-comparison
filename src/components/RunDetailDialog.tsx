import {
  ExternalLink,
  Fingerprint,
  Link2,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import {
  type AttributionAssessment,
  type Claim,
  type EvidenceAssessment,
  type FactualityAssessment,
  type Probe,
  type ProbeRun,
  type RunOrigin,
  type VisibilityAssessment,
} from '../domain/model';
import { Badge, ProviderBadge } from './ui';

interface RunDetailDialogProps {
  run: ProbeRun | null;
  probe: Probe | undefined;
  claims: Claim[];
  onClose: () => void;
}

const originLabels: Record<RunOrigin, string> = {
  demo: 'デモ観測',
  manual: '手動観測',
  provider: 'Provider実行',
};

const visibilityLabels: Record<VisibilityAssessment, string> = {
  mentioned: '言及',
  omitted: '欠落',
  'not-applicable': '対象外',
};

const factualityLabels: Record<FactualityAssessment, string> = {
  accurate: '正確',
  partial: '一部正確',
  contradicted: '矛盾',
  unsupported: '裏付けなし',
  'not-assessed': '未評価',
};

const attributionLabels: Record<AttributionAssessment, string> = {
  correct: '正しい帰属',
  misattributed: '誤った帰属',
  ambiguous: '曖昧',
  'not-applicable': '対象外',
};

const evidenceLabels: Record<EvidenceAssessment, string> = {
  'reported-url': 'URLのみ',
  fetched: '本文取得済み',
  'passage-match': '原文と対応',
  'human-verified': '人が確認',
  none: '根拠なし',
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function citationType(value: string): 'example' | 'external' | 'text' {
  try {
    const url = new URL(value);
    if (url.hostname === 'example' || url.hostname.endsWith('.example'))
      return 'example';
    return ['http:', 'https:'].includes(url.protocol) ? 'external' : 'text';
  } catch {
    return 'text';
  }
}

function dimensionTone(
  value: string,
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (
    [
      'mentioned',
      'accurate',
      'correct',
      'passage-match',
      'human-verified',
    ].includes(value)
  ) {
    return 'success';
  }
  if (
    [
      'omitted',
      'contradicted',
      'misattributed',
      'unsupported',
      'none',
    ].includes(value)
  ) {
    return 'danger';
  }
  if (['partial', 'ambiguous', 'reported-url', 'fetched'].includes(value))
    return 'warning';
  return 'neutral';
}

export function RunDetailDialog({
  run,
  probe,
  claims,
  onClose,
}: RunDetailDialogProps) {
  const open = run !== null;
  const dialogRef = useModalAccessibility<HTMLElement>(open, onClose);

  if (!run) return null;

  // Persisted v1 data may predate RunProvenance even though the current domain
  // contract requires it. Keep the inspector usable while storage is migrated.
  const provenance = (run as ProbeRun & { provenance?: ProbeRun['provenance'] })
    .provenance;
  const capturedTargets = new Map(
    run.inputSnapshot?.evaluationTargets.map((target) => [
      target.claimId,
      target,
    ]) ?? [],
  );
  const targetClaimIds =
    run.inputSnapshot?.evaluationTargets.map((target) => target.claimId) ??
    probe?.targetClaimIds ??
    run.assessments.map(({ claimId }) => claimId);
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const assessmentByClaim = new Map(
    run.assessments.map((assessment) => [assessment.claimId, assessment]),
  );
  const origin = provenance?.origin;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal run-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-detail-title"
        aria-describedby="run-detail-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header run-detail-dialog__header">
          <div>
            <div className="run-detail-dialog__origin">
              <span className="eyebrow">RUN ARTIFACT</span>
              <Badge
                tone={
                  origin === 'demo'
                    ? 'info'
                    : origin === 'provider'
                      ? 'success'
                      : 'accent'
                }
              >
                {origin ? originLabels[origin] : 'Legacy run'}
              </Badge>
            </div>
            <h2 id="run-detail-title">観測結果の証拠</h2>
            <p id="run-detail-description">
              質問、回答、判定、実行条件を一つの記録として確認します。
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="閉じる"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="modal__body run-detail-dialog__body">
          <section
            className="run-detail-section"
            aria-labelledby="run-conditions-title"
          >
            <div className="run-detail-section__title">
              <span className="eyebrow">CONDITIONS</span>
              <h3 id="run-conditions-title">実行条件</h3>
            </div>
            <dl className="run-detail-meta">
              <div>
                <dt>Provider</dt>
                <dd>
                  <ProviderBadge provider={run.provider} />
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{run.model}</dd>
              </div>
              <div>
                <dt>実行日時</dt>
                <dd>
                  <time dateTime={run.executedAt}>
                    {formatDateTime(run.executedAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt>検索</dt>
                <dd>
                  {run.searchEnabled ? (
                    <>
                      <Search aria-hidden="true" size={15} /> ON
                    </>
                  ) : (
                    <>
                      <SearchX aria-hidden="true" size={15} /> OFF
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Locale</dt>
                <dd>{run.locale}</dd>
              </div>
              <div>
                <dt>繰り返し</dt>
                <dd>{run.repeatIndex + 1}回目</dd>
              </div>
            </dl>
          </section>

          <section
            className="run-detail-section"
            aria-labelledby="run-question-title"
          >
            <div className="run-detail-section__title">
              <span className="eyebrow">QUESTION</span>
              <h3 id="run-question-title">観測した質問</h3>
            </div>
            <p className="run-detail-question">
              {run.inputSnapshot?.observation.question ??
                probe?.question ??
                'このRunに対応する質問情報を取得できません。'}
            </p>
          </section>

          <section
            className="run-detail-section"
            aria-labelledby="run-answer-title"
          >
            <div className="run-detail-section__title">
              <span className="eyebrow">ANSWER</span>
              <h3 id="run-answer-title">AI回答全文</h3>
            </div>
            <pre className="run-detail-answer">{run.answer}</pre>
          </section>

          <section
            className="run-detail-section"
            aria-labelledby="run-citations-title"
          >
            <div className="run-detail-section__title">
              <span className="eyebrow">CITATIONS</span>
              <h3 id="run-citations-title">回答が示したURL</h3>
            </div>
            {run.citationUrls.length > 0 ? (
              <ul className="run-detail-citations">
                {run.citationUrls.map((citation, index) => {
                  const type = citationType(citation);
                  return (
                    <li key={`${citation}-${index}`}>
                      <Link2 aria-hidden="true" size={15} />
                      {type === 'external' ? (
                        <a
                          href={citation}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {citation}
                          <ExternalLink aria-hidden="true" size={14} />
                        </a>
                      ) : (
                        <span
                          title={
                            type === 'example'
                              ? '架空データのため外部ページはありません'
                              : undefined
                          }
                        >
                          {citation}
                          {type === 'example' ? '（デモURL）' : ''}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="run-detail-empty">Citationは記録されていません。</p>
            )}
          </section>

          <section
            className="run-detail-section"
            aria-labelledby="run-assessments-title"
          >
            <div className="run-detail-section__title">
              <span className="eyebrow">CLAIM ASSESSMENTS</span>
              <h3 id="run-assessments-title">対象Claimの判定</h3>
            </div>
            <div className="run-detail-assessments">
              {targetClaimIds.map((claimId) => {
                const claim = claimById.get(claimId);
                const assessment = assessmentByClaim.get(claimId);
                return (
                  <article className="run-detail-assessment" key={claimId}>
                    <header>
                      <div>
                        <span>{claim?.category ?? 'Claim'}</span>
                        <h4>
                          {capturedTargets.get(claimId)?.statement ??
                            claim?.statement ??
                            `不明なClaim（${claimId}）`}
                        </h4>
                      </div>
                      {assessment ? (
                        <strong>
                          {Math.round(assessment.confidence * 100)}% confidence
                        </strong>
                      ) : (
                        <Badge tone="warning">未評価</Badge>
                      )}
                    </header>
                    {assessment ? (
                      <>
                        <dl className="run-detail-dimensions">
                          <div>
                            <dt>言及</dt>
                            <dd>
                              <Badge
                                tone={dimensionTone(assessment.visibility)}
                              >
                                {visibilityLabels[assessment.visibility]}
                              </Badge>
                            </dd>
                          </div>
                          <div>
                            <dt>正確性</dt>
                            <dd>
                              <Badge
                                tone={dimensionTone(assessment.factuality)}
                              >
                                {factualityLabels[assessment.factuality]}
                              </Badge>
                            </dd>
                          </div>
                          <div>
                            <dt>帰属</dt>
                            <dd>
                              <Badge
                                tone={dimensionTone(assessment.attribution)}
                              >
                                {attributionLabels[assessment.attribution]}
                              </Badge>
                            </dd>
                          </div>
                          <div>
                            <dt>根拠</dt>
                            <dd>
                              <Badge tone={dimensionTone(assessment.evidence)}>
                                {evidenceLabels[assessment.evidence]}
                              </Badge>
                            </dd>
                          </div>
                        </dl>
                        <div className="run-detail-assessment__explanation">
                          <div>
                            <span>回答中の該当箇所</span>
                            <p>
                              {assessment.observedExcerpt?.trim() ||
                                '個別の回答抜粋は記録されていません。'}
                            </p>
                          </div>
                          <div>
                            <span>判定理由</span>
                            <p>
                              {assessment.rationale ||
                                '判定理由は記録されていません。'}
                            </p>
                          </div>
                        </div>
                        <footer>
                          <span>
                            判定者:{' '}
                            {assessment.assessedBy ?? 'legacy / unknown'}
                          </span>
                          {assessment.assessedAt ? (
                            <time dateTime={assessment.assessedAt}>
                              {formatDateTime(assessment.assessedAt)}
                            </time>
                          ) : null}
                        </footer>
                      </>
                    ) : (
                      <p className="run-detail-empty">
                        この対象Claimに対応するAssessmentがありません。
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section
            className="run-detail-section run-detail-artifact"
            aria-labelledby="run-artifact-title"
          >
            <div className="run-detail-section__title">
              <Fingerprint aria-hidden="true" size={18} />
              <div>
                <span className="eyebrow">PROVENANCE</span>
                <h3 id="run-artifact-title">Artifact識別情報</h3>
              </div>
            </div>
            <dl>
              <div>
                <dt>Fingerprint</dt>
                <dd>
                  <code>
                    {provenance?.artifactHash || '記録なし（legacy run）'}
                  </code>
                </dd>
              </div>
              <div>
                <dt>Campaign ID</dt>
                <dd>
                  <code>{provenance?.campaignId || '未所属'}</code>
                </dd>
              </div>
              <div>
                <dt>Run ID</dt>
                <dd>
                  <code>{run.id}</code>
                </dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>{provenance?.schemaVersion ?? 'legacy'}</dd>
              </div>
              <div>
                <dt>Evaluator</dt>
                <dd>
                  <code>{provenance?.assessorId ?? 'legacy / unknown'}</code>
                </dd>
              </div>
              <div>
                <dt>Recorded by</dt>
                <dd>{provenance?.recordedBy ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Recorded at</dt>
                <dd>
                  {provenance?.recordedAt ? (
                    <time dateTime={provenance.recordedAt}>
                      {formatDateTime(provenance.recordedAt)}
                    </time>
                  ) : (
                    '記録なし'
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <footer className="modal__footer modal__footer--end">
          <button
            className="button button--primary"
            type="button"
            onClick={onClose}
          >
            閉じる
          </button>
        </footer>
      </section>
    </div>
  );
}
