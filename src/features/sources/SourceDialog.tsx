import { useCallback, useState, type FormEvent } from 'react';
import { FilePlus2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { useWorkspace } from '../../app/workspaceContext';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { isSafeHttpUrl } from '../../domain/urls';

export function SourceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addSourceWithClaim } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [claimStatement, setClaimStatement] = useState('');
  const [category, setCategory] = useState('製品情報');
  const [owner, setOwner] = useState('Content Owner');

  const close = useCallback(() => {
    if (saving) return;
    setTitle('');
    setUrl('');
    setExcerpt('');
    setClaimStatement('');
    setCategory('製品情報');
    setOwner('Content Owner');
    setError('');
    onClose();
  }, [onClose, saving]);
  const dialogRef = useModalAccessibility<HTMLElement>(open, close, !saving);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!isSafeHttpUrl(url)) {
      setError('認証情報を含まないHTTP(S) URLを入力してください。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addSourceWithClaim({ title, url, excerpt, claimStatement, category, owner });
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sourceを保存できませんでした。入力を保持しています。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="modal source-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div><span className="eyebrow">調査の根拠を追加</span><h2 id="source-dialog-title">公式資料と確認項目を追加</h2></div>
          <button className="icon-button" type="button" aria-label="閉じる" onClick={close} disabled={saving}><X size={20} /></button>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="modal__body form-stack">
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="notice notice--info">
              <ShieldCheck aria-hidden="true" size={18} />
              <p>原文は手動で保存します。URLからの自動取得や、内容の正しさの自動判定は行いません。</p>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>資料名</span>
                <input autoFocus required minLength={2} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例：製品・料金ガイド" />
              </label>
              <label className="field">
                <span>記録者</span>
                <input required value={owner} onChange={(event) => setOwner(event.target.value)} />
              </label>
            </div>
            <label className="field">
              <span id="source-url-label">公式URL</span>
              <input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/product" aria-labelledby="source-url-label" aria-describedby="source-url-help" />
              <small id="source-url-help">認証情報を含まないHTTP(S) URLを使用します。</small>
            </label>
            <label className="field">
              <span>根拠となる原文</span>
              <textarea required minLength={10} maxLength={100000} rows={4} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="公式ページに書かれている文章を貼り付けます" />
            </label>
            <div className="field-divider"><span>この原文で確かめたい項目</span></div>
            <label className="field">
              <span>確認可能な事実</span>
              <textarea required minLength={10} maxLength={2000} rows={3} value={claimStatement} onChange={(event) => setClaimStatement(event.target.value)} placeholder="一文で、時点と対象が分かる事実にします" />
            </label>
            <label className="field field--short">
              <span>カテゴリ</span>
              <input required value={category} onChange={(event) => setCategory(event.target.value)} />
            </label>
          </div>
          <footer className="modal__footer modal__footer--end">
            <button className="button button--ghost" type="button" onClick={close}>キャンセル</button>
            <button className="button button--primary" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <FilePlus2 aria-hidden="true" size={17} />}
              {saving ? '保存中' : '資料を保存'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
