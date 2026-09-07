import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileInput, ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace, type ManualObservationInput } from '../app/workspaceContext';
import { calculateRunMetrics, formatPercent } from '../domain/metrics';
import {
  providerLabels,
  type AttributionAssessment,
  type ClaimAssessment,
  type EvidenceAssessment,
  type FactualityAssessment,
  type ProviderId,
  type VisibilityAssessment,
} from '../domain/model';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { isSafeHttpUrl } from '../domain/urls';

interface ManualObservationDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = 1 | 2 | 3;
type DraftAssessment = {
  claimId: string;
  visibility: VisibilityAssessment | '';
  factuality: FactualityAssessment | '';
  attribution: AttributionAssessment | '';
  evidence: EvidenceAssessment | '';
  confidence: number;
  rationale: string;
  observedExcerpt: string;
  citationUrl: string;
};

const visibilityLabels: Record<VisibilityAssessment, string> = {
  mentioned: '言及あり',
  omitted: '欠落',
  'not-applicable': '評価対象外',
};

const factualityLabels: Record<FactualityAssessment, string> = {
  accurate: '正確',
  partial: '一部のみ正確',
  contradicted: '矛盾',
  unsupported: '裏付けなし',
  'not-assessed': '未評価',
};

const attributionLabels: Record<AttributionAssessment, string> = {
  correct: '帰属は正しい',
  misattributed: '誤った帰属',
  ambiguous: '曖昧',
  'not-applicable': '該当なし',
};

const evidenceLabels: Record<EvidenceAssessment, string> = {
  'reported-url': 'URLのみ提示',
  fetched: '本文取得済み',
  'passage-match': '根拠箇所と一致',
  'human-verified': '人が根拠を確認',
  none: '引用なし',
};

function localDateTimeNow(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function makeDrafts(claimIds: string[]): DraftAssessment[] {
  return claimIds.map((claimId) => ({
    claimId,
    visibility: '',
    factuality: '',
    attribution: '',
    evidence: '',
    confidence: 0.9,
    rationale: '',
    observedExcerpt: '',
    citationUrl: '',
  }));
}

function isAssessmentComplete(assessment: DraftAssessment): boolean {
  if (!assessment.visibility || !assessment.factuality || !assessment.attribution || !assessment.evidence) return false;
  if (assessment.rationale.trim().length < 4) return false;
  return assessment.visibility !== 'mentioned' || assessment.observedExcerpt.trim().length >= 4;
}

function toAssessment(assessment: DraftAssessment): ClaimAssessment {
  if (!isAssessmentComplete(assessment)) throw new Error('対象Claimの評価が完了していません。');
  const observedExcerpt = assessment.observedExcerpt.trim();
  const citationUrl = assessment.citationUrl.trim();
  return {
    claimId: assessment.claimId,
    visibility: assessment.visibility as VisibilityAssessment,
    factuality: assessment.factuality as FactualityAssessment,
    attribution: assessment.attribution as AttributionAssessment,
    evidence: assessment.evidence as EvidenceAssessment,
    confidence: assessment.confidence,
    rationale: assessment.rationale.trim(),
    ...(observedExcerpt ? { observedExcerpt } : {}),
    ...(citationUrl ? { citationUrl } : {}),
  };
}

export function ManualObservationDialog({ open, onClose }: ManualObservationDialogProps) {
  const { active, addManualObservation } = useWorkspace();
  const navigate = useNavigate();
  const activeProbes = active.probes.filter((probe) => probe.status === 'active');
  const [step, setStep] = useState<Step>(1);
  const [probeId, setProbeId] = useState(activeProbes[0]?.id ?? '');
  const [provider, setProvider] = useState<ProviderId>('chatgpt');
  const [model, setModel] = useState('manual-capture');
  const [executedAt, setExecutedAt] = useState(localDateTimeNow);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [answer, setAnswer] = useState('');
  const [citationText, setCitationText] = useState('');
  const [assessments, setAssessments] = useState<DraftAssessment[]>(
    makeDrafts(activeProbes[0]?.targetClaimIds ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const probe = active.probes.find((candidate) => candidate.id === probeId);
  const citations = useMemo(
    () => [...new Set(citationText.split(/\r?\n/).map((url) => url.trim()).filter(Boolean))],
    [citationText],
  );
  const invalidCitationCount = citations.filter((url) => !isSafeHttpUrl(url)).length;
  const stepOneValid = Boolean(
    probe
      && model.trim().length >= 2
      && answer.trim().length >= 20
      && !Number.isNaN(new Date(executedAt).getTime())
      && invalidCitationCount === 0,
  );
  const stepTwoValid = assessments.length > 0 && assessments.every(isAssessmentComplete);

  const previewMetrics = useMemo(() => {
    if (!probe || !stepTwoValid) return null;
    return calculateRunMetrics(
      {
        id: 'preview',
        probeId: probe.id,
        provider,
        model,
        repeatIndex: 0,
        executedAt: new Date(executedAt).toISOString(),
        locale: probe.locale,
        searchEnabled,
        answer,
        citationUrls: citations,
        assessments: assessments.map(toAssessment),
        provenance: {
          origin: 'manual',
          schemaVersion: 'mirror.run.v1',
          assessorId: 'human-manual-v1',
          recordedAt: new Date().toISOString(),
          recordedBy: 'human',
          artifactHash: 'preview',
          campaignId: null,
        },
      },
      probe,
    );
  }, [answer, assessments, citations, executedAt, model, probe, provider, searchEnabled, stepTwoValid]);

  const reset = () => {
    const firstProbe = active.probes.find((candidate) => candidate.status === 'active');
    setStep(1);
    setProbeId(firstProbe?.id ?? '');
    setProvider('chatgpt');
    setModel('manual-capture');
    setExecutedAt(localDateTimeNow());
    setSearchEnabled(true);
    setAnswer('');
    setCitationText('');
    setAssessments(makeDrafts(firstProbe?.targetClaimIds ?? []));
    setSaving(false);
    setError('');
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };
  const dialogRef = useModalAccessibility<HTMLElement>(open, close, !saving);

  if (!open) return null;

  const selectProbe = (nextProbeId: string) => {
    const nextProbe = active.probes.find((candidate) => candidate.id === nextProbeId);
    setProbeId(nextProbeId);
    setAssessments(makeDrafts(nextProbe?.targetClaimIds ?? []));
  };

  const updateAssessment = (claimId: string, patch: Partial<DraftAssessment>) => {
    setAssessments((current) => current.map((assessment) => (
      assessment.claimId === claimId ? { ...assessment, ...patch } : assessment
    )));
  };

  const updateVisibility = (claimId: string, visibility: VisibilityAssessment) => {
    updateAssessment(
      claimId,
      visibility === 'mentioned'
        ? {
            visibility,
            factuality: '',
            attribution: '',
            evidence: '',
            observedExcerpt: '',
            citationUrl: '',
          }
        : {
            visibility,
            factuality: 'not-assessed',
            attribution: 'not-applicable',
            evidence: 'none',
            observedExcerpt: '',
            citationUrl: '',
          },
    );
  };

  const save = async () => {
    if (!probe || !stepTwoValid) return;
    setSaving(true);
    setError('');
    try {
      const input: ManualObservationInput = {
        probeId: probe.id,
        provider,
        model,
        executedAt,
        searchEnabled,
        answer,
        citationUrls: citations,
        assessments: assessments.map(toAssessment),
      };
      const runId = await addManualObservation(input);
      reset();
      onClose();
      navigate(`/observe?tab=runs&run=${encodeURIComponent(runId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '観測結果を保存できませんでした。');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="modal modal--wide observation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="observation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <span className="eyebrow">BRING YOUR OWN ANSWER</span>
            <h2 id="observation-title">AI回答を証拠として取り込む</h2>
          </div>
          <button className="icon-button" type="button" aria-label="閉じる" onClick={close} disabled={saving}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="stepper" aria-label={`3ステップ中${step}ステップ目`}>
          {[1, 2, 3].map((item) => <span key={item} className={item <= step ? 'is-active' : ''} />)}
        </div>

        <div className="modal__body form-stack">
          {step === 1 ? (
            <>
              <div className="observation-intro">
                <FileInput aria-hidden="true" size={22} />
                <div><strong>回答取得とClaim評価を分離</strong><p>別画面で得た回答をそのまま貼り付けます。Mirrorから正解となるClaimをAIへ送信しません。</p></div>
              </div>
              {activeProbes.length > 0 ? (
                <>
                  <label className="field">
                    <span>対応する質問</span>
                    <select value={probeId} onChange={(event) => selectProbe(event.target.value)}>
                      {activeProbes.map((item) => <option key={item.id} value={item.id}>{item.question}</option>)}
                    </select>
                  </label>
                  <div className="field-grid field-grid--three">
                    <label className="field">
                      <span>Provider</span>
                      <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
                        {(Object.keys(providerLabels) as ProviderId[]).map((id) => <option key={id} value={id}>{providerLabels[id]}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Model / surface</span>
                      <input required value={model} onChange={(event) => setModel(event.target.value)} placeholder="例: web-search" />
                    </label>
                    <label className="field">
                      <span>回答日時</span>
                      <input type="datetime-local" required value={executedAt} onChange={(event) => setExecutedAt(event.target.value)} />
                    </label>
                  </div>
                  <label className="field">
                    <span>AI回答全文</span>
                    <textarea rows={8} required minLength={20} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="AIが返した文章を編集せず貼り付けます" />
                    <small>{answer.trim().length}文字 · 保存後はRun artifactとして追記されます</small>
                  </label>
                  <div className="field-grid">
                    <label className="field">
                      <span>Citation URL（1行1件・任意）</span>
                      <textarea rows={3} value={citationText} onChange={(event) => setCitationText(event.target.value)} placeholder="https://..." aria-invalid={invalidCitationCount > 0} />
                      {invalidCitationCount > 0 ? <small className="field-error">認証情報を含まないhttp(s) URLとして解釈できない行が{invalidCitationCount}件あります。</small> : null}
                    </label>
                    <label className="check-field">
                      <input type="checkbox" checked={searchEnabled} onChange={(event) => setSearchEnabled(event.target.checked)} />
                      <span><strong>検索機能を使用した回答</strong><small>取得時の条件として固定します</small></span>
                    </label>
                  </div>
                  <div className="notice notice--neutral">
                    <ShieldCheck aria-hidden="true" size={18} />
                    <p>この公開版では入力を外部送信せず、ブラウザ内だけに保存します。端末に残したくない機密情報は貼り付けないでください。</p>
                  </div>
                </>
              ) : (
                <div className="notice notice--warning"><p>先に有効な質問を1件作成してください。</p></div>
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="assessment-heading">
                <div><span className="eyebrow">HUMAN ASSESSMENT</span><h3>{assessments.length}件の対象Claimを評価</h3></div>
                <span>{assessments.filter(isAssessmentComplete).length}/{assessments.length} 完了</span>
              </div>
              <div className="assessment-editor-list">
                {assessments.map((assessment, index) => {
                  const claim = active.claims.find((candidate) => candidate.id === assessment.claimId);
                  const source = active.sources.find((candidate) => candidate.id === claim?.sourceId);
                  return (
                    <article key={assessment.claimId} className={`assessment-editor ${isAssessmentComplete(assessment) ? 'is-complete' : ''}`}>
                      <header>
                        <span>{index + 1}</span>
                        <div><small>{claim?.category ?? 'Claim'}</small><h4>{claim?.statement}</h4></div>
                        {isAssessmentComplete(assessment) ? <Check aria-label="評価完了" size={18} /> : null}
                      </header>
                      <details>
                        <summary>公式原文を確認</summary>
                        <blockquote>{source?.snapshot.excerpt ?? '原文がありません'}</blockquote>
                      </details>
                      <div className="assessment-grid">
                        <label className="field"><span>言及</span><select value={assessment.visibility} onChange={(event) => updateVisibility(assessment.claimId, event.target.value as VisibilityAssessment)}><option value="">選択</option>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label className="field"><span>事実性</span><select value={assessment.factuality} onChange={(event) => updateAssessment(assessment.claimId, { factuality: event.target.value as FactualityAssessment })}><option value="">選択</option>{Object.entries(factualityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label className="field"><span>帰属</span><select value={assessment.attribution} onChange={(event) => updateAssessment(assessment.claimId, { attribution: event.target.value as AttributionAssessment })}><option value="">選択</option>{Object.entries(attributionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label className="field"><span>証拠状態</span><select value={assessment.evidence} onChange={(event) => updateAssessment(assessment.claimId, { evidence: event.target.value as EvidenceAssessment })}><option value="">選択</option>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      </div>
                      {assessment.visibility === 'mentioned' ? (
                        <label className="field"><span>回答中の該当箇所</span><textarea rows={2} value={assessment.observedExcerpt} onChange={(event) => updateAssessment(assessment.claimId, { observedExcerpt: event.target.value })} placeholder="このClaimに対応する回答部分" /></label>
                      ) : null}
                      <div className="field-grid">
                        <label className="field"><span>判定理由</span><textarea rows={2} value={assessment.rationale} onChange={(event) => updateAssessment(assessment.claimId, { rationale: event.target.value })} placeholder="なぜこの判定なのか" /></label>
                        <div className="field form-stack form-stack--compact">
                          <label><span>対応Citation</span><select value={assessment.citationUrl} onChange={(event) => updateAssessment(assessment.claimId, { citationUrl: event.target.value })}><option value="">なし</option>{citations.map((url) => <option key={url} value={url}>{url}</option>)}</select></label>
                          <label className="confidence-field"><span>確信度 {Math.round(assessment.confidence * 100)}%</span><input type="range" min="0.5" max="1" step="0.01" value={assessment.confidence} onChange={(event) => updateAssessment(assessment.claimId, { confidence: Number(event.target.value) })} /></label>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}

          {step === 3 && previewMetrics ? (
            <>
              <div className="review-panel observation-review">
                <div><span className="eyebrow">SAVE PREVIEW</span><h3>監査可能なRunとして保存</h3><p>{probe?.question}</p></div>
                <dl>
                  <div><dt>Provider</dt><dd>{providerLabels[provider]}</dd></div>
                  <div><dt>Model</dt><dd>{model}</dd></div>
                  <div><dt>対象Claim</dt><dd>{assessments.length}</dd></div>
                  <div><dt>Citation</dt><dd>{citations.length}</dd></div>
                </dl>
              </div>
              <section className="preview-metrics" aria-label="保存前の測定指標">
                <div><span>対象Claimの言及率</span><strong>{formatPercent(previewMetrics.claimRecall.ratio)}</strong><small>{previewMetrics.claimRecall.numerator}/{previewMetrics.claimRecall.denominator}</small></div>
                <div><span>事実の正確性</span><strong>{formatPercent(previewMetrics.factualAccuracy.ratio)}</strong><small>{previewMetrics.factualAccuracy.numerator}/{previewMetrics.factualAccuracy.denominator}</small></div>
                <div><span>帰属の正確性</span><strong>{formatPercent(previewMetrics.attributionAccuracy.ratio)}</strong><small>{previewMetrics.attributionAccuracy.numerator}/{previewMetrics.attributionAccuracy.denominator}</small></div>
                <div><span>文章による裏付け</span><strong>{formatPercent(previewMetrics.evidenceSupport.ratio)}</strong><small>{previewMetrics.evidenceSupport.numerator}/{previewMetrics.evidenceSupport.denominator}</small></div>
              </section>
              <div className="notice notice--info"><ShieldCheck aria-hidden="true" size={18} /><p>回答全文、実行条件、人間によるClaim判定、SHA-256 fingerprintを一つのRun artifactとして保存します。</p></div>
              {error ? <div className="notice notice--danger" role="alert"><p>{error}</p></div> : null}
            </>
          ) : null}
        </div>

        <footer className="modal__footer observation-dialog__footer">
          <button className="button button--ghost" type="button" onClick={() => step === 1 ? close() : setStep((step - 1) as Step)} disabled={saving}>
            {step > 1 ? <ArrowLeft aria-hidden="true" size={17} /> : null}{step === 1 ? 'キャンセル' : '戻る'}
          </button>
          {step < 3 ? (
            <button className="button button--primary" type="button" onClick={() => setStep((step + 1) as Step)} disabled={step === 1 ? !stepOneValid : !stepTwoValid}>
              次へ<ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : (
            <button className="button button--primary" type="button" onClick={() => void save()} disabled={saving || !stepTwoValid}>
              <Check aria-hidden="true" size={17} />{saving ? '保存中…' : 'Runを保存'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
