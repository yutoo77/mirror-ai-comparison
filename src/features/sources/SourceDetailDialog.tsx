import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, History, LoaderCircle, PencilLine, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../app/workspaceContext';
import { Badge } from '../../components/ui';
import type { Claim, Source } from '../../domain/model';
import { compareSourceText, MAX_SOURCE_HISTORY, MAX_SOURCE_TEXT, sourceImpact } from '../../domain/sourceHistory';
import { isSafeHttpUrl } from '../../domain/urls';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

const dateLabel = (value: string) => new Date(value).toLocaleString('ja-JP');

export function SourceDetailDialog({ source, initialClaimId, onClose }: {
  source: Source;
  initialClaimId?: string | undefined;
  onClose: () => void;
}) {
  const { active, updateSource } = useWorkspace();
  const [selectedVersion, setSelectedVersion] = useState('current');
  const [editing, setEditing] = useState(false);
  const [excerpt, setExcerpt] = useState(source.snapshot.excerpt);
  const [expectedHash, setExpectedHash] = useState(source.snapshot.sha256);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const closeConfirmRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [reviewingId, setReviewingId] = useState(initialClaimId ?? '');
  const impact = sourceImpact(active, source.id);
  const history = source.history ?? [];
  const version = selectedVersion === 'current'
    ? source.snapshot
    : history[Number(selectedVersion)] ?? source.snapshot;
  const isCurrent = version === source.snapshot;
  const changes = useMemo(() => compareSourceText(source.snapshot.excerpt, excerpt), [source.snapshot.excerpt, excerpt]);
  const unchanged = excerpt.trim() === source.snapshot.excerpt.trim();
  const close = useCallback(() => {
    if (saving) return;
    if (editing && (!unchanged || note.trim())) { setConfirmClose(true); return; }
    onClose();
  }, [editing, note, onClose, saving, unchanged]);
  const dialogRef = useModalAccessibility<HTMLElement>(true, close, !saving);
  useEffect(() => {
    if (confirmClose) {
      closeConfirmRef.current?.focus();
      closeConfirmRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [confirmClose]);

  const startEditing = () => {
    setExpectedHash(source.snapshot.sha256);
    setExcerpt(source.snapshot.excerpt);
    setNote('');
    setError('');
    setFeedback('');
    setSelectedVersion('current');
    setEditing(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await updateSource(source.id, { expectedHash, excerpt, note });
      setEditing(false);
      setNote('');
      setFeedback('新しい原文を保存しました。過去の版と回答はそのまま残っています。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。入力は保持しています。');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section ref={dialogRef} className="modal source-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="source-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <span className="eyebrow">{editing ? '原文の更新' : '資料と確認項目'}</span>
            <h2 id="source-detail-title">{source.title}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="資料を閉じる" disabled={saving} onClick={close}><X size={20} /></button>
        </header>
        <div className="modal__body source-detail-body">
          {confirmClose ? (
            <div ref={closeConfirmRef} tabIndex={-1} className="source-close-confirm" role="alert">
              <p>保存していない原文とメモを破棄しますか？</p>
              <button type="button" className="button button--secondary button--compact" onClick={() => { setConfirmClose(false); editorRef.current?.focus(); }}>編集に戻る</button>
              <button type="button" className="button button--ghost button--compact" onClick={onClose}>編集を破棄して閉じる</button>
            </div>
          ) : null}
          {feedback ? <p className="source-feedback" role="status">{feedback}</p> : null}
          {isSafeHttpUrl(source.url) ? <a className="source-detail-url" href={source.url} target="_blank" rel="noreferrer">{source.url}<ArrowUpRight size={15} aria-hidden="true" /></a> : <p className="source-detail-url">{source.url}</p>}
          <p className="section-note">手動で保存した原文です。公開ページの現在の内容は自動取得していません。</p>

          {editing ? (
            <form id="source-update-form" className="form-stack" onSubmit={(event) => void save(event)}>
              <p className="source-impact-note">関連する確認項目 {impact.claims.length}件を再確認の対象にします。保存回答 {impact.runs.length}件の判定は変更しません。</p>
              <div className="source-diff-grid">
                <section><h3>保存済みの原文</h3><p className="source-version-text">{source.snapshot.excerpt}</p></section>
                <label className="field"><span>更新後の原文</span><textarea ref={editorRef} autoFocus required minLength={10} maxLength={MAX_SOURCE_TEXT} rows={8} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} aria-describedby="source-change-help" disabled={saving} /></label>
              </div>
              <p id="source-change-help" className="section-note">{unchanged ? '原文を変更すると、新しい版として保存できます。' : '本文に変更があります。変更理由も記録してください。'} 10〜100,000文字。</p>
              {!unchanged ? (
                <details className="source-literal-diff">
                  <summary>文字の差分を確認</summary>
                  <p className="section-note">共通する先頭・末尾を除いた変更範囲です。意味の違いや矛盾の自動判定ではありません。</p>
                  <div className="source-diff-grid">
                    <section><h4>変更前</h4><p className="source-version-text">{changes.prefix}<mark className="source-diff-before">{changes.before || '（追加位置）'}</mark>{changes.suffix}</p></section>
                    <section><h4>変更後</h4><p className="source-version-text">{changes.prefix}<mark className="source-diff-after">{changes.after || '（削除）'}</mark>{changes.suffix}</p></section>
                  </div>
                </details>
              ) : null}
              <label className="field"><span>更新メモ</span><textarea required maxLength={1000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例：支援対象のプラン条件が追記されていたため" disabled={saving} /></label>
              {error ? <p role="alert" className="form-error">{error}</p> : null}
            </form>
          ) : (
            <>
              <div className="source-version-toolbar">
                <label className="field"><span><History size={15} aria-hidden="true" />表示する版</span>
                  <select value={selectedVersion} onChange={(event) => setSelectedVersion(event.target.value)}>
                    <option value="current">現在の保存版 · {dateLabel(source.snapshot.capturedAt)}</option>
                    {history.map((item, index) => <option key={index} value={String(index)}>過去版 {index + 1} · {dateLabel(item.capturedAt)}</option>).reverse()}
                  </select>
                </label>
                <button type="button" className="button button--secondary" onClick={startEditing} disabled={history.length >= MAX_SOURCE_HISTORY}><PencilLine size={16} aria-hidden="true" />原文を更新</button>
              </div>
              {history.length >= MAX_SOURCE_HISTORY ? <p className="form-error">過去版の保存上限（{MAX_SOURCE_HISTORY}件）です。履歴は保持しています。</p> : null}
              {!isCurrent ? <p className="source-impact-note">過去の保存版を表示中です。確認項目の見直しは、現在の保存版で行ってください。</p> : null}
              <section className="source-reading" aria-label="保存した原文">
                <div className="source-reading__heading"><h3>{isCurrent ? '現在の保存原文' : '過去の保存原文'}</h3><time dateTime={version.capturedAt}>{dateLabel(version.capturedAt)}</time></div>
                <blockquote className="source-version-text">{version.excerpt}</blockquote>
                {version.revisionNote ? <p className="source-revision-note">更新メモ：{version.revisionNote}</p> : null}
                <details><summary>保存情報</summary><p>記録方法：{version.parserVersion}</p><p className="source-hash">SHA-256：{version.sha256}</p><p>本文の識別用です。内容の真偽・作成者・公開ページとの一致を証明しません。</p></details>
              </section>
              {isCurrent ? (
                <section className="source-review-list" aria-labelledby="source-review-heading">
                  <h3 id="source-review-heading">この原文で確認する項目 <span>{impact.claims.length}件</span></h3>
                  {source.status === 'changed' ? <p className="source-impact-note">原文が更新されています。対象プラン・条件・時点を見直してください。関連する回答を誤りと判定したわけではありません。</p> : null}
                  {impact.claims.map((claim) => (
                    <article key={claim.id}>
                      {reviewingId === claim.id ? <SourceClaimReview key={claim.id} claim={claim} source={source} onDone={(message) => { setReviewingId(''); setFeedback(message); }} /> : <>
                        <div className="source-review-item"><Badge tone={claim.status === 'verified' ? 'success' : 'warning'}>{claim.status === 'verified' ? '人が確認済み' : claim.status === 'draft' ? '未確認' : '要再確認'}</Badge><p>{claim.statement}</p></div>
                        <button type="button" className="text-link" onClick={() => setReviewingId(claim.id)}>{claim.status === 'verified' ? '確認内容を見直す' : '原文と照らして確認'}</button>
                      </>}
                    </article>
                  ))}
                  {!impact.claims.length ? <p className="section-note">この資料の確認項目はまだありません。</p> : null}
                </section>
              ) : null}
              <details className="source-related-questions">
                <summary>関連する質問 {impact.probes.length}件・保存回答 {impact.runs.length}件</summary>
                <p className="section-note">参照関係から数えています。誤りの数ではありません。旧形式の回答は現在の質問設定を参考にしています。</p>
                {impact.probes.map((probe) => <Link key={probe.id} to={`/?probe=${encodeURIComponent(probe.id)}`}>{probe.question}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}
              </details>
            </>
          )}
        </div>
        <footer className="modal__footer modal__footer--end">
          {editing ? <>
            <button type="button" className="button button--ghost" disabled={saving} onClick={() => { setEditing(false); setConfirmClose(false); }}>変更を破棄して戻る</button>
            <button type="submit" form="source-update-form" className="button button--primary" disabled={saving || unchanged || !note.trim()}>{saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <History size={16} aria-hidden="true" />}{saving ? '保存中' : '新しい版を保存'}</button>
          </> : <button type="button" className="button button--secondary" onClick={close}>閉じる</button>}
        </footer>
      </section>
    </div>
  );
}

function SourceClaimReview({ claim, source, onDone }: { claim: Claim; source: Source; onDone: (message: string) => void }) {
  const { reviewSourceClaim } = useWorkspace();
  const [statement, setStatement] = useState(claim.statement);
  const [expectedHash] = useState(source.snapshot.sha256);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  return (
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault();
      if (!checked) return;
      try { reviewSourceClaim(claim.id, { statement, expectedHash }); onDone('確認項目と、この版で確認した記録を保存しました。過去の回答・判定は変更していません。'); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '確認内容を保存できませんでした。'); }
    }}>
      <label className="field"><span>確認項目の文章</span><textarea required minLength={10} maxLength={2000} rows={3} value={statement} onChange={(event) => { setStatement(event.target.value); setChecked(false); }} /></label>
      <label className="source-review-confirm"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />対象・条件・時点を含め、上の原文と照合しました</label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="source-review-actions"><button type="button" className="button button--ghost button--compact" onClick={() => onDone('')}>キャンセル</button><button type="submit" className="button button--primary button--compact" disabled={!checked}><Check size={15} aria-hidden="true" />この版で確認済みにする</button></div>
    </form>
  );
}
