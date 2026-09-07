import { useRef, useState } from 'react';
import { Download, FileCheck2, Fingerprint, Upload, X } from 'lucide-react';
import { useWorkspace } from '../app/workspaceContext';
import {
  createEvidencePack,
  MAX_PACK_BYTES,
  verifyEvidencePack,
  type EvidencePack,
} from '../domain/evidencePack';
import { buildIncident, verdictLabels } from '../domain/incident';
import { tallyRate } from '../domain/experiments';
import { formatPercent } from '../domain/metrics';
import {
  findingKindLabels,
  providerLabels,
  type Finding,
} from '../domain/model';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { downloadJson } from '../lib/download';

interface EvidencePackDialogProps {
  finding?: Finding;
  onClose: () => void;
}

/** Deliberately read-only. Imported data never enters WorkspaceProvider. */
export function EvidencePackDialog({
  finding,
  onClose,
}: EvidencePackDialogProps) {
  const { active } = useWorkspace();
  const [pack, setPack] = useState<EvidencePack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const close = () => {
    requestId.current += 1;
    onClose();
  };
  const dialogRef = useModalAccessibility<HTMLElement>(true, close);
  const process = async (operation: () => Promise<EvidencePack>) => {
    const current = ++requestId.current;
    setPack(null);
    setError('');
    setBusy(true);
    try {
      const result = await operation();
      if (current === requestId.current) setPack(result);
    } catch (cause) {
      if (current === requestId.current)
        setError(
          cause instanceof Error
            ? cause.message
            : '監査パックを処理できませんでした。',
        );
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  };
  const incident = pack
    ? buildIncident(pack.payload, pack.payload.finding)
    : null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="modal evidence-pack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pack-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <span className="eyebrow">PORTABLE EVIDENCE · LOCAL ONLY</span>
            <h2 id="pack-title">
              {finding ? '証拠をひとつの監査パックに' : '監査パックを検証'}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="監査パックを閉じる"
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="pack-content">
          <p className="pack-boundary">
            ブラウザ内だけで処理します。外部送信・Workspaceへの取り込み・上書きは行いません。
          </p>
          {finding ? (
            <div className="pack-input">
              <strong>{finding.title}</strong>
              <p>
                Finding、レビュー履歴、関連する質問・回答全文・Claim・Source原文・改善案を含みます。回答やSourceには他の情報も含まれるため、保存・共有前に機密情報や個人情報を確認してください。
              </p>
              <button
                type="button"
                className="button button--primary"
                disabled={busy}
                onClick={() =>
                  void process(() => createEvidencePack(active, finding))
                }
              >
                <FileCheck2 size={17} aria-hidden="true" />
                {pack ? '現在の内容で作り直す' : '監査パックを作成'}
              </button>
            </div>
          ) : (
            <label className="pack-input pack-file">
              <Upload size={23} aria-hidden="true" />
              <strong>JSONファイルを選択</strong>
              <span>監査パック v1/v2/v3 · 最大5 MB · 読み取り専用</span>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="監査パックのJSONファイル"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void process(async () => {
                    if (file.size > MAX_PACK_BYTES)
                      throw new Error('監査パックは5 MB以内にしてください。');
                    return verifyEvidencePack(await file.text());
                  });
                  event.target.value = '';
                }}
              />
            </label>
          )}
          <div role="status" aria-live="polite">
            {busy
              ? '構造とFingerprintを確認しています…'
              : pack
                ? '構造・参照・Fingerprintの整合性を確認しました。'
                : ''}
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {pack && incident ? (
            <div className="pack-result">
              <div className="pack-result__heading">
                <Fingerprint size={20} aria-hidden="true" />
                <span>INTEGRITY CHECK PASSED</span>
              </div>
              <h3>
                {pack.payload.workspace.displayName} /{' '}
                {pack.payload.finding.title}
              </h3>
              <p>
                {pack.payload.workspace.isDemo
                  ? '架空デモの保存データ'
                  : 'ローカルWorkspaceの保存データ'}{' '}
                · {findingKindLabels[pack.payload.finding.kind]}
              </p>
              <dl className="pack-counts">
                <div>
                  <dt>関連回答</dt>
                  <dd>{pack.payload.runs.length}</dd>
                </div>
                <div>
                  <dt>公式Source</dt>
                  <dd>{pack.payload.sources.length}</dd>
                </div>
                <div>
                  <dt>レビュー履歴</dt>
                  <dd>{pack.payload.finding.reviewHistory?.length ?? 0}</dd>
                </div>
              </dl>
              <p>
                保存判定の再集計：検出 {incident.affected} / 判定可能{' '}
                {incident.evaluable} · 判定不能 {incident.unassessed} · 除外{' '}
                {incident.excluded}
              </p>
              <details>
                <summary>公式情報と回答全文を確認</summary>
                {pack.payload.sources.map((source) => (
                  <article className="pack-document" key={source.id}>
                    <h4>{source.title}</h4>
                    <small>{source.url}</small>
                    <p>{source.snapshot.excerpt}</p>
                    <small>現在の保存版 · {source.snapshot.capturedAt}</small>
                    {(source.history ?? []).length ? <details>
                      <summary>過去の原文 {source.history!.length}版</summary>
                      {source.history!.map((version, index) => <div className="pack-document" key={index}>
                        <h5>過去版 {index + 1} · {version.capturedAt}</h5>
                        <p>{version.excerpt}</p>
                        {version.revisionNote ? <p>更新メモ：{version.revisionNote}</p> : null}
                        <small className="source-hash">SHA-256：{version.sha256}</small>
                      </div>)}
                    </details> : null}
                  </article>
                ))}
                {pack.payload.runs.map((run) => {
                  const row = incident.observations.find(
                    (item) => item.run.id === run.id,
                  );
                  const probe = pack.payload.probes.find(
                    (item) => item.id === run.probeId,
                  );
                  return (
                    <article className="pack-document" key={run.id}>
                      <h4>
                        {providerLabels[run.provider]} ·{' '}
                        {row
                          ? verdictLabels[row.verdict]
                          : '検証記録の参照回答'}
                      </h4>
                      <small>
                        {run.executedAt} · {run.provenance.origin} · {run.model}{' '}
                        · {run.id}
                      </small>
                      <p>
                        <strong>質問</strong>{' '}
                        {run.inputSnapshot?.observation.question ??
                          probe?.question}
                      </p>
                      <p>{run.answer}</p>
                      <p>
                        <strong>保存判定</strong>{' '}
                        {row?.assessment?.rationale ?? '評価なし'}
                      </p>
                    </article>
                  );
                })}
              </details>
              <details>
                <summary>改善案と検証記録を確認</summary>
                {pack.payload.actions.map((action) => (
                  <article className="pack-document" key={action.id}>
                    <h4>{action.title}</h4>
                    <p>{action.hypothesis}</p>
                    {action.measurementPlan ? (
                      <>
                        <p>変更内容: {action.measurementPlan.changeSummary}</p>
                        <p>
                          質問:{' '}
                          {action.measurementPlan.cohort.observation.question}
                        </p>
                        <p>
                          {
                            providerLabels[
                              action.measurementPlan.cohort.provider
                            ]
                          }{' '}
                          · {action.measurementPlan.cohort.model} ·{' '}
                          {action.measurementPlan.cohort.origin} ·{' '}
                          {action.measurementPlan.cohort.assessorId}
                        </p>
                        <p>
                          変更前:{' '}
                          {action.measurementPlan.baselineWindow.startAt}〜
                          {action.measurementPlan.baselineWindow.endAt} ·
                          非検出率{' '}
                          {formatPercent(
                            tallyRate(action.measurementPlan.baseline),
                          )}
                        </p>
                        <p>
                          変更日時: {action.measurementPlan.changedAt} ·
                          固定日時: {action.measurementPlan.createdAt}
                        </p>
                        <p>
                          変更後:{' '}
                          {action.measurementPlan.followupWindow.startAt}〜
                          {action.measurementPlan.followupWindow.endAt}
                        </p>
                        {(action.evaluations ?? []).map((result) => (
                          <div key={result.id}>
                            <strong>
                              {result.recordedAt} · 非検出率{' '}
                              {formatPercent(tallyRate(result.followup))}
                            </strong>
                            <p>{result.note}</p>
                            <small>
                              対象Run: {result.followup.runIds.join(', ')} ·
                              条件外 {result.followup.excluded.length}件 ·
                              判定不能 {result.followup.unassessed}件
                            </small>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p>
                        比較条件未固定。以前の参考値:{' '}
                        {formatPercent(action.before.value)} →{' '}
                        {formatPercent(action.after?.value ?? null)}
                      </p>
                    )}
                  </article>
                ))}
                {!pack.payload.actions.length ? (
                  <p>改善案はありません。</p>
                ) : null}
              </details>
              <details>
                <summary>人間のレビュー履歴を確認</summary>
                {(pack.payload.finding.reviewHistory ?? []).map((item) => (
                  <p className="pack-document" key={item.id}>
                    {item.at} · {item.status}
                    <br />
                    {item.note}
                    <br />
                    <small>
                      参照Run：{item.runIds?.join(', ') || '記録なし'}
                    </small>
                  </p>
                ))}
                {!pack.payload.finding.reviewHistory?.length ? (
                  <p>理由付きのレビュー履歴はありません。</p>
                ) : null}
              </details>
              <small className="pack-fingerprint">
                SHA-256 · {pack.fingerprint.value}
              </small>
              <button
                type="button"
                className="button button--primary"
                onClick={() =>
                  downloadJson(
                    `mirror-evidence-${pack.payload.finding.id}.json`,
                    pack,
                  )
                }
              >
                <Download size={17} aria-hidden="true" />
                JSONを保存
              </button>
            </div>
          ) : null}
          <p className="section-note">
            Fingerprintはパック内の変更・破損を確認するための照合値です。作成者の本人性、記載内容の真偽、元SourceやRunの真正性を保証する電子署名ではありません。Campaign台帳やWorkspace全体のバックアップも含みません。
          </p>
        </div>
      </section>
    </div>
  );
}
