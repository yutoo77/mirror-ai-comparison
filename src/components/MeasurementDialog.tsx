import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  FileInput,
  LoaderCircle,
  Play,
  ShieldCheck,
  StopCircle,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../app/workspaceContext';
import type { MeasurementCampaign } from '../domain/model';
import type { CampaignProgress } from '../execution/contracts';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface MeasurementDialogProps {
  open: boolean;
  onClose: () => void;
  onManual: () => void;
}

type RunPhase = 'ready' | 'running' | 'complete' | 'error';

export function MeasurementDialog({ open, onClose, onManual }: MeasurementDialogProps) {
  const { active, runDemoCampaign } = useWorkspace();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<RunPhase>('ready');
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [campaign, setCampaign] = useState<MeasurementCampaign | null>(null);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const activeProbes = active.probes.filter((probe) => probe.status === 'active');
  const answerCount = activeProbes.reduce(
    (total, probe) => total + probe.providers.length * probe.repetitions,
    0,
  );
  const providerCount = new Set(activeProbes.flatMap((probe) => probe.providers)).size;
  const targetClaimCount = new Set(activeProbes.flatMap((probe) => probe.targetClaimIds)).size;
  const unverifiedTargetCount = new Set(
    activeProbes
      .flatMap((probe) => probe.targetClaimIds)
      .filter((claimId) => active.claims.find((claim) => claim.id === claimId)?.status !== 'verified'),
  ).size;

  const resultCounts = useMemo(() => {
    if (!campaign) return { succeeded: 0, failed: 0, cancelled: 0 };
    return {
      succeeded: campaign.artifacts.filter((artifact) => artifact.status === 'succeeded').length,
      failed: campaign.artifacts.filter((artifact) => artifact.status === 'failed').length,
      cancelled: campaign.artifacts.filter((artifact) => artifact.status === 'cancelled').length,
    };
  }, [campaign]);

  const reset = useCallback(() => {
    controllerRef.current = null;
    setPhase('ready');
    setProgress(null);
    setCampaign(null);
    setError('');
  }, []);

  const close = useCallback(() => {
    if (phase === 'running') return;
    reset();
    onClose();
  }, [onClose, phase, reset]);
  const dialogRef = useModalAccessibility<HTMLElement>(open, close, phase !== 'running');

  if (!open) return null;

  const startCampaign = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setError('');
    setCampaign(null);
    setProgress({
      campaignId: '',
      completedJobs: 0,
      totalJobs: answerCount,
      currentJob: null,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    });
    setPhase('running');
    try {
      const result = await runDemoCampaign(controller.signal, (next) => setProgress({ ...next }));
      setCampaign(result);
      setPhase('complete');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Campaignを実行できませんでした。');
      setPhase('error');
    } finally {
      controllerRef.current = null;
    }
  };

  const cancelCampaign = () => {
    controllerRef.current?.abort('cancelled by user');
  };

  const openCampaign = () => {
    const campaignId = campaign?.id;
    close();
    navigate(campaignId
      ? `/observe?tab=campaigns&campaign=${encodeURIComponent(campaignId)}`
      : '/observe?tab=campaigns');
  };

  const progressRatio = progress && progress.totalJobs > 0
    ? progress.completedJobs / progress.totalJobs
    : 0;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="modal run-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <span className="eyebrow">MEASUREMENT</span>
            <h2 id="run-title">
              {phase === 'ready' ? '観測方法を選ぶ' : phase === 'running' ? 'Campaignを実行中' : phase === 'error' ? '実行できませんでした' : 'Campaignを記録しました'}
            </h2>
          </div>
          <button className="icon-button" type="button" aria-label="閉じる" onClick={close} disabled={phase === 'running'}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="modal__body">
          {phase === 'ready' ? (
            <>
              <div className="measurement-paths">
                <button className="measurement-path measurement-path--primary" type="button" onClick={() => void startCampaign()} disabled={activeProbes.length === 0}>
                  <span><Play aria-hidden="true" size={20} /></span>
                  <strong>再現可能なデモCampaign</strong>
                  <p>質問×Provider×反復を固定し、実際のRun artifactとFindingを生成します。</p>
                  <small>{answerCount} answersを予定 <ArrowRight aria-hidden="true" size={14} /></small>
                </button>
                <button className="measurement-path" type="button" onClick={onManual} disabled={activeProbes.length === 0}>
                  <span><FileInput aria-hidden="true" size={20} /></span>
                  <strong>既存のAI回答を取り込む</strong>
                  <p>任意のAIで取得した回答を、人間のClaim判定と一緒に保存します。</p>
                  <small>APIキー不要 <ArrowRight aria-hidden="true" size={14} /></small>
                </button>
              </div>
              <div className="run-summary">
                <div><strong>{activeProbes.length}</strong><span>有効な質問</span></div>
                <div><strong>{providerCount}</strong><span>AIプロバイダー</span></div>
                <div><strong>{targetClaimCount}</strong><span>対象Claim</span></div>
              </div>
              <div className="notice notice--info">
                <ShieldCheck aria-hidden="true" size={18} />
                <p>回答取得は公式Claimを見せないblind observationです。評価時だけ固定済みSnapshotと照合します。</p>
              </div>
              {unverifiedTargetCount > 0 ? (
                <div className="notice notice--warning"><p>要レビューのClaim {unverifiedTargetCount}件を含みます。結果の確定前に公式情報を再確認してください。</p></div>
              ) : null}
            </>
          ) : null}

          {phase === 'running' && progress ? (
            <div className="campaign-progress" aria-live="polite">
              <div className="campaign-progress__hero">
                <LoaderCircle className="spin" aria-hidden="true" size={27} />
                <div><strong>{progress.completedJobs}/{progress.totalJobs} answers</strong><span>Run artifactを順番に固定しています</span></div>
                <b>{Math.round(progressRatio * 100)}%</b>
              </div>
              <div className="campaign-progress__bar" role="progressbar" aria-label="Campaign進捗" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressRatio * 100)}><span style={{ width: `${progressRatio * 100}%` }} /></div>
              <dl className="campaign-progress__counts">
                <div><dt>成功</dt><dd>{progress.succeeded}</dd></div>
                <div><dt>失敗</dt><dd>{progress.failed}</dd></div>
                <div><dt>中止</dt><dd>{progress.cancelled}</dd></div>
              </dl>
              <div className="campaign-current-job">
                <span>現在のJob</span>
                <strong>{progress.currentJob?.observation.question ?? '次のJobを準備中'}</strong>
                <small>{progress.currentJob ? `${progress.currentJob.provider} · repeat ${progress.currentJob.repeatIndex + 1}` : '実行条件を固定しています'}</small>
              </div>
            </div>
          ) : null}

          {phase === 'complete' && campaign ? (
            <div className="run-complete">
              <span className={`run-complete__icon ${campaign.status === 'completed' ? '' : 'run-complete__icon--warning'}`}><Check aria-hidden="true" size={30} /></span>
              <h3>{campaign.status === 'completed' ? 'すべてのRunを保存しました' : campaign.status === 'cancelled' ? '中止内容を監査履歴へ残しました' : '一部のRunに注意が必要です'}</h3>
              <p>成功・失敗・中止をRun artifactとして分け、過去の観測は上書きしていません。</p>
              <div className="campaign-result-counts">
                <div><strong>{resultCounts.succeeded}</strong><span>saved</span></div>
                <div><strong>{resultCounts.failed}</strong><span>failed</span></div>
                <div><strong>{resultCounts.cancelled}</strong><span>cancelled</span></div>
              </div>
              <code className="campaign-id">{campaign.id}</code>
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="run-error" role="alert"><strong>Campaignを作成できませんでした</strong><p>{error}</p></div>
          ) : null}
        </div>

        <footer className="modal__footer modal__footer--end">
          {phase === 'ready' ? <button className="button button--ghost" type="button" onClick={close}>閉じる</button> : null}
          {phase === 'running' ? (
            <button className="button button--danger" type="button" onClick={cancelCampaign}><StopCircle aria-hidden="true" size={17} />観測を中止</button>
          ) : null}
          {phase === 'complete' ? (
            <><button className="button button--ghost" type="button" onClick={close}>閉じる</button><button className="button button--primary" type="button" onClick={openCampaign}>Campaign詳細を見る<ArrowRight aria-hidden="true" size={17} /></button></>
          ) : null}
          {phase === 'error' ? <><button className="button button--ghost" type="button" onClick={close}>閉じる</button><button className="button button--primary" type="button" onClick={() => void startCampaign()}>もう一度試す</button></> : null}
        </footer>
      </section>
    </div>
  );
}
