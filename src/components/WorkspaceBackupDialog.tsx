import { useRef, useState } from 'react';
import { Archive, Check, Download, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../app/workspaceContext';
import { useStorageError } from '../app/storageStatus';
import {
  createWorkspaceBackup,
  MAX_BACKUP_BYTES,
  verifyWorkspaceBackup,
  type WorkspaceBackup,
} from '../domain/workspaceBackup';
import { downloadJson, downloadText } from '../lib/download';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

export function WorkspaceBackupDialog({ onClose }: { onClose: () => void }) {
  const { active, recoveryText, restoreWorkspace } = useWorkspace();
  const storageError = useStorageError();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'export' | 'restore'>('export');
  const [backup, setBackup] = useState<WorkspaceBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(0);
  const restoringRef = useRef(false);
  const close = () => {
    if (!restoringRef.current) {
      operation.current += 1;
      onClose();
    }
  };
  const dialogRef = useModalAccessibility<HTMLElement>(true, close, !restoring);
  const clear = () => {
    operation.current += 1;
    setBackup(null);
    setError('');
    setAcknowledged(false);
    setRestored(false);
    setBusy(false);
  };
  const process = async (work: () => Promise<WorkspaceBackup>) => {
    clear();
    const current = operation.current;
    setBusy(true);
    try {
      const result = await work();
      if (current === operation.current) setBackup(result);
    } catch (cause) {
      if (current === operation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'バックアップを処理できませんでした。',
        );
    } finally {
      if (current === operation.current) setBusy(false);
    }
  };
  const restore = async () => {
    if (!backup || !acknowledged || restoringRef.current || restored) return;
    restoringRef.current = true;
    setRestoring(true);
    setError('');
    try {
      await restoreWorkspace(backup);
      setRestored(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '復元できませんでした。',
      );
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="modal evidence-pack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <span className="eyebrow">LOCAL DATA · SAFE COPY</span>
            <h2 id="backup-title">バックアップと復元</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="バックアップを閉じる"
            disabled={restoring}
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="pack-content">
          <p className="pack-boundary">
            選択中のWorkspaceを丸ごと保存。復元しても既存データは上書きしません。ファイルはブラウザ内だけで処理します。
          </p>
          {storageError ? (
            <p className="backup-warning" role="status">
              {storageError}
            </p>
          ) : null}
          {recoveryText !== null ? (
            <div className="backup-warning">
              <strong>読み取れなかった元データを保護しています</strong>
              <p>
                まず元の保存文字列をそのまま退避できます。このファイルは通常のバックアップ形式とは異なり、自動復元できません。
              </p>
              <button
                type="button"
                className="button button--secondary"
                onClick={() =>
                  downloadText('mirror-storage-recovery.json', recoveryText)
                }
              >
                <Download size={16} aria-hidden="true" />
                元の保存データを退避
              </button>
            </div>
          ) : null}
          <div className="tabs" aria-label="バックアップの操作">
            <button
              type="button"
              aria-pressed={mode === 'export'}
              className={mode === 'export' ? 'is-active' : ''}
              disabled={restoring}
              onClick={() => {
                clear();
                setMode('export');
              }}
            >
              保存する
            </button>
            <button
              type="button"
              aria-pressed={mode === 'restore'}
              className={mode === 'restore' ? 'is-active' : ''}
              disabled={restoring}
              onClick={() => {
                clear();
                setMode('restore');
              }}
            >
              復元する
            </button>
          </div>
          {mode === 'export' ? (
            <div className="pack-input">
              <Archive size={24} aria-hidden="true" />
              <strong>{active.workspace.name}</strong>
              <span>
                {active.workspace.subject.displayName} ·{' '}
                {active.workspace.subject.canonicalDomain}
              </span>
              <p>
                公式情報、Claim、質問、回答全文、判定、レビュー、改善案、Campaign台帳、トレンド、活動履歴を含みます。他のWorkspaceは含みません。
              </p>
              <p>
                暗号化・自動伏せ字は行いません。機密情報や個人情報を含むファイルは、安全な場所に保管してください。
              </p>
              <button
                type="button"
                className="button button--primary"
                disabled={busy}
                onClick={() =>
                  void process(() => createWorkspaceBackup(active))
                }
              >
                バックアップを作成
              </button>
            </div>
          ) : (
            <label className="pack-input pack-file">
              <Upload size={24} aria-hidden="true" />
              <strong>Workspaceバックアップを選択</strong>
              <span>
                Workspaceバックアップ v1/v2/v3 · 最大20 MB · 監査パックとは別形式
              </span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="WorkspaceバックアップのJSON"
                disabled={restoring}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void process(async () => {
                    if (file.size > MAX_BACKUP_BYTES)
                      throw new Error(
                        'バックアップは20 MB以内にしてください。',
                      );
                    return verifyWorkspaceBackup(await file.text());
                  });
                  event.target.value = '';
                }}
              />
            </label>
          )}
          <p role="status">
            {busy
              ? '形式・参照・Fingerprintを確認しています…'
              : restoring
                ? '証拠を変更せず、復元コピーを追加しています…'
                : restored
                  ? '別のWorkspaceとして復元コピーを追加しました。'
                  : backup
                    ? 'バックアップの形式・参照・Fingerprintを確認しました。'
                    : ''}
          </p>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          {backup ? (
            <div className="pack-result">
              <div className="pack-result__heading">
                <Check size={20} aria-hidden="true" />
                {backup.snapshot.workspace.isDemo
                  ? 'FICTIONAL DEMO DATA'
                  : 'LOCAL WORKSPACE DATA'}
              </div>
              <h3>{backup.snapshot.workspace.name}</h3>
              <p>
                {backup.snapshot.workspace.subject.displayName} ·{' '}
                {backup.snapshot.workspace.subject.canonicalDomain}
              </p>
              <p>
                書き出し日時：
                {new Date(backup.exportedAt).toLocaleString('ja-JP')}
              </p>
              <dl className="pack-counts">
                <div>
                  <dt>回答</dt>
                  <dd>{backup.snapshot.runs.length}</dd>
                </div>
                <div>
                  <dt>Finding</dt>
                  <dd>{backup.snapshot.findings.length}</dd>
                </div>
                <div>
                  <dt>Campaign</dt>
                  <dd>{backup.snapshot.campaigns.length}</dd>
                </div>
                <div>
                  <dt>公式Source</dt>
                  <dd>{backup.snapshot.sources.length}</dd>
                </div>
                <div>
                  <dt>改善案</dt>
                  <dd>{backup.snapshot.actions.length}</dd>
                </div>
                <div>
                  <dt>レビュー</dt>
                  <dd>
                    {backup.snapshot.findings.reduce(
                      (sum, item) => sum + (item.reviewHistory?.length ?? 0),
                      0,
                    )}
                  </dd>
                </div>
              </dl>
              <small className="pack-fingerprint">
                SHA-256 · {backup.fingerprint.value}
              </small>
              {mode === 'export' ? (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() =>
                    downloadJson(
                      `mirror-backup-${backup.snapshot.workspace.id}.json`,
                      backup,
                    )
                  }
                >
                  <Download size={17} aria-hidden="true" />
                  バックアップJSONを保存
                </button>
              ) : restored ? (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => {
                    close();
                    navigate('/');
                  }}
                >
                  復元したWorkspaceを開く
                </button>
              ) : (
                <>
                  <p>
                    新しいWorkspace
                    IDを発行してコピーを追加します。元のWorkspace、過去のRun・CampaignとそのFingerprintは変更しません。
                  </p>
                  <label className="backup-consent">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      disabled={restoring}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                    />
                    <span>内容を確認し、別の復元コピーとして追加します</span>
                  </label>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={!acknowledged || restoring}
                    onClick={() => void restore()}
                  >
                    復元コピーを追加
                  </button>
                </>
              )}
            </div>
          ) : null}
          <p className="section-note">
            Fingerprintは内容の整合性を照合する値で、真偽や作成者を保証する署名ではありません。過去の証拠内のWorkspace
            IDは取得当時のまま保持し、復元元を別途記録します。バックアップ作成だけではファイルは保存されません。「JSONを保存」まで行ってください。
          </p>
        </div>
      </section>
    </div>
  );
}
