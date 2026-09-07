import { useCallback, useState, type FormEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useWorkspace } from '../../app/workspaceContext';
import { providerLabels, type ProviderId } from '../../domain/model';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

export function ProbeBuilderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { active, addProbe } = useWorkspace();
  const [question, setQuestion] = useState('');
  const [audience, setAudience] = useState('');
  const [intent, setIntent] = useState('比較・検討');
  const [providers, setProviders] = useState<ProviderId[]>(['chatgpt', 'gemini']);
  const [targetClaimIds, setTargetClaimIds] = useState<string[]>([]);
  const [repetitions, setRepetitions] = useState(3);
  const verifiedClaims = active.claims.filter((claim) => claim.status === 'verified');
  const unavailableClaimCount = active.claims.length - verifiedClaims.length;

  const close = useCallback(() => {
    setQuestion('');
    setAudience('');
    setIntent('比較・検討');
    setProviders(['chatgpt', 'gemini']);
    setTargetClaimIds([]);
    setRepetitions(3);
    onClose();
  }, [onClose]);
  const dialogRef = useModalAccessibility<HTMLElement>(open, close);

  if (!open) return null;

  const toggleProvider = (provider: ProviderId) => {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider],
    );
  };

  const toggleClaim = (claimId: string) => {
    setTargetClaimIds((current) =>
      current.includes(claimId)
        ? current.filter((item) => item !== claimId)
        : [...current, claimId],
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addProbe({ question, audience, intent, providers, repetitions, targetClaimIds });
    close();
  };

  const plannedAnswers = providers.length * repetitions;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="modal probe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="probe-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div><span className="eyebrow">NEW PROBE</span><h2 id="probe-dialog-title">観測する質問を設計</h2></div>
          <button className="icon-button" type="button" aria-label="閉じる" onClick={close}><X size={20} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="modal__body form-stack">
            <label className="field">
              <span>AIへ尋ねる質問</span>
              <textarea
                autoFocus
                required
                minLength={10}
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={`${active.workspace.subject.displayName}について、利用者が実際に尋ねそうな質問`}
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>想定する人</span>
                <input required value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="例：情報システム責任者" />
              </label>
              <label className="field">
                <span>質問の意図</span>
                <select value={intent} onChange={(event) => setIntent(event.target.value)}>
                  <option>比較・検討</option>
                  <option>候補探索</option>
                  <option>事実確認</option>
                  <option>リスク確認</option>
                </select>
              </label>
            </div>
            <fieldset className="field-group">
              <legend>対象Claim</legend>
              <p>この質問で測る事実だけを分母にします。</p>
              <div className="claim-picker">
                {verifiedClaims.map((claim) => (
                  <label key={claim.id} className={targetClaimIds.includes(claim.id) ? 'is-selected' : ''}>
                    <input type="checkbox" checked={targetClaimIds.includes(claim.id)} onChange={() => toggleClaim(claim.id)} />
                    <span className="checkbox-mark"><Check aria-hidden="true" size={13} /></span>
                    <span><strong>{claim.category}</strong><small>{claim.statement}</small></span>
                  </label>
                ))}
              </div>
              {unavailableClaimCount > 0 ? (
                <p className="field-hint">未承認・要レビューのClaim {unavailableClaimCount}件は、承認後に選択できます。</p>
              ) : null}
            </fieldset>
            <fieldset className="field-group">
              <legend>実行条件</legend>
              <div className="run-config-grid">
                <div>
                  <span className="field-label">プロバイダー</span>
                  <div className="toggle-row">
                    {(Object.keys(providerLabels) as ProviderId[]).map((provider) => (
                      <button
                        key={provider}
                        className={providers.includes(provider) ? 'is-selected' : ''}
                        type="button"
                        onClick={() => toggleProvider(provider)}
                      >
                        {providers.includes(provider) ? <Check aria-hidden="true" size={14} /> : null}
                        {providerLabels[provider]}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field field--short">
                  <span>繰り返し回数</span>
                  <select value={repetitions} onChange={(event) => setRepetitions(Number(event.target.value))}>
                    <option value={1}>1回（試行）</option>
                    <option value={3}>3回（推奨）</option>
                    <option value={5}>5回</option>
                  </select>
                </label>
              </div>
            </fieldset>
            <div className="run-estimate">
              <span>予定回答数</span><strong>{plannedAnswers}</strong><small>{providers.length} providers × {repetitions} repeats</small>
            </div>
          </div>
          <footer className="modal__footer modal__footer--end">
            <button className="button button--ghost" type="button" onClick={close}>キャンセル</button>
            <button
              className="button button--primary"
              type="submit"
              disabled={question.trim().length < 10 || audience.trim().length < 2 || providers.length === 0 || targetClaimIds.length === 0}
            >
              <Plus aria-hidden="true" size={17} />質問を追加
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
