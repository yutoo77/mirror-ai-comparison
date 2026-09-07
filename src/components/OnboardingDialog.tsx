import { useCallback, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Globe2, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../app/workspaceContext';
import type { NewWorkspaceInput } from '../data/demoWorkspaces';
import type { Objective, SubjectType } from '../domain/model';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface OnboardingDialogProps {
  open: boolean;
  onClose: () => void;
}

const objectives: Array<{ value: Objective; label: string; detail: string }> = [
  { value: 'product', label: '製品・サービス', detail: '導入検討時の正確性を監視' },
  { value: 'brand', label: 'ブランド', detail: '認知・差別化・帰属を監視' },
  { value: 'recruiting', label: '採用', detail: '候補者に届く情報を監視' },
  { value: 'ir', label: 'IR', detail: '企業情報と事業理解を監視' },
];

const initialForm: NewWorkspaceInput = {
  displayName: '',
  canonicalDomain: '',
  industry: '',
  subjectType: 'organization',
  objective: 'product',
  locale: 'ja-JP',
};

export function OnboardingDialog({ open, onClose }: OnboardingDialogProps) {
  const navigate = useNavigate();
  const { createWorkspace } = useWorkspace();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<NewWorkspaceInput>(initialForm);
  const close = useCallback(() => {
    setStep(1);
    setForm(initialForm);
    onClose();
  }, [onClose]);
  const dialogRef = useModalAccessibility<HTMLElement>(open, close);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }
    createWorkspace({
      ...form,
      canonicalDomain: form.canonicalDomain.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    });
    close();
    navigate('/sources');
  };

  const canContinue =
    step !== 1 ||
    (form.displayName.trim().length >= 2 &&
      form.canonicalDomain.trim().length >= 3 &&
      form.industry.trim().length >= 2);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="modal onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <span className="eyebrow">NEW WORKSPACE · {step}/3</span>
            <h2 id="onboarding-title">
              {step === 1 ? '分析する対象を登録' : step === 2 ? '観測の目的を選択' : '設定を確認'}
            </h2>
          </div>
          <button className="icon-button" type="button" aria-label="閉じる" onClick={close}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="stepper" aria-label={`ステップ${step}/3`}>
          {[1, 2, 3].map((item) => (
            <span key={item} className={item <= step ? 'is-active' : ''} />
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="modal__body">
            {step === 1 ? (
              <div className="form-stack">
                <p className="form-lead">
                  企業・ブランド・製品のどれでも登録できます。入力値はこのブラウザにだけ保存されます。
                </p>
                <label className="field">
                  <span>対象の種類</span>
                  <select
                    value={form.subjectType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        subjectType: event.target.value as SubjectType,
                      }))
                    }
                  >
                    <option value="organization">企業・組織</option>
                    <option value="brand">ブランド</option>
                    <option value="product">製品</option>
                    <option value="service">サービス</option>
                  </select>
                </label>
                <div className="field-grid">
                  <label className="field">
                    <span>表示名</span>
                    <input
                      autoFocus
                      required
                      minLength={2}
                      placeholder="例：Aster Labs"
                      value={form.displayName}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>業種・カテゴリ</span>
                    <input
                      required
                      minLength={2}
                      placeholder="例：業務自動化SaaS"
                      value={form.industry}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, industry: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>公式ドメイン</span>
                  <div className="input-with-icon">
                    <Globe2 aria-hidden="true" size={17} />
                    <input
                      required
                      placeholder="example.com"
                      inputMode="url"
                      value={form.canonicalDomain}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, canonicalDomain: event.target.value }))
                      }
                    />
                  </div>
                </label>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="form-stack">
                <p className="form-lead">最初に解く仕事を一つ選びます。あとから変更できます。</p>
                <div className="choice-grid">
                  {objectives.map((objective) => (
                    <label
                      key={objective.value}
                      className={`choice-card ${form.objective === objective.value ? 'is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="objective"
                        value={objective.value}
                        checked={form.objective === objective.value}
                        onChange={() =>
                          setForm((current) => ({ ...current, objective: objective.value }))
                        }
                      />
                      <span className="choice-card__check">
                        <Check aria-hidden="true" size={14} />
                      </span>
                      <strong>{objective.label}</strong>
                      <small>{objective.detail}</small>
                    </label>
                  ))}
                </div>
                <label className="field field--short">
                  <span>観測する言語</span>
                  <select
                    value={form.locale}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, locale: event.target.value }))
                    }
                  >
                    <option value="ja-JP">日本語（日本）</option>
                    <option value="en-US">English (US)</option>
                  </select>
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="review-panel">
                <div className="review-panel__icon">
                  <Sparkles aria-hidden="true" size={24} />
                </div>
                <div>
                  <span className="eyebrow">READY TO START</span>
                  <h3>{form.displayName}</h3>
                  <p>{form.industry}</p>
                </div>
                <dl>
                  <div>
                    <dt>公式ドメイン</dt>
                    <dd>{form.canonicalDomain}</dd>
                  </div>
                  <div>
                    <dt>目的</dt>
                    <dd>{objectives.find((item) => item.value === form.objective)?.label}</dd>
                  </div>
                  <div>
                    <dt>言語</dt>
                    <dd>{form.locale}</dd>
                  </div>
                </dl>
                <div className="notice notice--info">
                  <Building2 aria-hidden="true" size={18} />
                  <p>
                    Workspace作成後、まず公式情報を追加してClaimを承認します。自動取得は次の実装段階で接続します。
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="modal__footer">
            {step > 1 ? (
              <button className="button button--ghost" type="button" onClick={() => setStep(step - 1)}>
                <ArrowLeft aria-hidden="true" size={17} />
                戻る
              </button>
            ) : (
              <span />
            )}
            <button className="button button--primary" type="submit" disabled={!canContinue}>
              {step === 3 ? 'Workspaceを作成' : '次へ'}
              {step < 3 ? <ArrowRight aria-hidden="true" size={17} /> : null}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
