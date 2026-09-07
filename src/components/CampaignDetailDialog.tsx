import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  Timer,
  X,
} from 'lucide-react';
import { aggregateCampaignMetrics, formatPercent } from '../domain/metrics';
import {
  type CampaignStatus,
  type MeasurementCampaign,
  type Probe,
  providerLabels,
} from '../domain/model';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { Badge, ProviderBadge } from './ui';

interface CampaignDetailDialogProps {
  campaign: MeasurementCampaign | null;
  probes: Probe[];
  onClose: () => void;
  onOpenRun: (runId: string) => void;
}

const campaignLabels: Record<CampaignStatus, string> = {
  planned: '計画済み',
  running: '実行中',
  completed: '完了',
  'completed-with-errors': '一部失敗',
  cancelled: '中止',
};

function campaignTone(status: CampaignStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'completed-with-errors') return 'warning';
  if (status === 'cancelled') return 'danger';
  if (status === 'running') return 'info';
  return 'neutral';
}

function formatDateTime(value: string | null): string {
  if (!value) return '記録なし';
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

function formatDuration(startedAt: string | null, finishedAt: string): string {
  if (!startedAt) return '未開始';
  const milliseconds = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '記録なし';
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

export function CampaignDetailDialog({
  campaign,
  probes,
  onClose,
  onOpenRun,
}: CampaignDetailDialogProps) {
  const open = campaign !== null;
  const dialogRef = useModalAccessibility<HTMLElement>(open, onClose);

  if (!campaign) return null;

  const succeeded = campaign.artifacts.filter((artifact) => artifact.status === 'succeeded');
  const failed = campaign.artifacts.filter((artifact) => artifact.status === 'failed');
  const cancelled = campaign.artifacts.filter((artifact) => artifact.status === 'cancelled');
  const metrics = aggregateCampaignMetrics(
    succeeded.map((artifact) => artifact.run),
    probes,
  );

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal modal--wide campaign-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-detail-title"
        aria-describedby="campaign-detail-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header campaign-detail-dialog__header">
          <div>
            <div className="campaign-detail-dialog__status">
              <span className="eyebrow">CAMPAIGN ARTIFACT</span>
              <Badge tone={campaignTone(campaign.status)}>{campaignLabels[campaign.status]}</Badge>
            </div>
            <h2 id="campaign-detail-title">観測Campaignの監査記録</h2>
            <p id="campaign-detail-description">固定した計画と、成功・失敗・中止を含むすべてのJobを確認します。</p>
          </div>
          <button className="icon-button" type="button" aria-label="閉じる" onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="modal__body campaign-detail-dialog__body">
          <section className="campaign-detail-hero" aria-label="Campaignサマリー">
            <div>
              <span>{campaign.mode === 'demo' ? 'DETERMINISTIC DEMO' : 'PROVIDER RUN'}</span>
              <code>{campaign.id}</code>
            </div>
            <dl>
              <div><dt>計画</dt><dd>{campaign.plannedRunCount}</dd></div>
              <div><dt>保存</dt><dd><CheckCircle2 aria-hidden="true" size={15} />{succeeded.length}</dd></div>
              <div><dt>失敗</dt><dd><AlertTriangle aria-hidden="true" size={15} />{failed.length}</dd></div>
              <div><dt>中止</dt><dd><Ban aria-hidden="true" size={15} />{cancelled.length}</dd></div>
            </dl>
          </section>

          <section className="campaign-detail-metrics" aria-label="成功Runの測定指標">
            <div><span>対象Claimの言及率</span><strong>{formatPercent(metrics.claimRecall.ratio)}</strong><small>{metrics.claimRecall.numerator}/{metrics.claimRecall.denominator}</small></div>
            <div><span>事実の正確性</span><strong>{formatPercent(metrics.factualAccuracy.ratio)}</strong><small>{metrics.factualAccuracy.numerator}/{metrics.factualAccuracy.denominator}</small></div>
            <div><span>文章による裏付け</span><strong>{formatPercent(metrics.evidenceSupport.ratio)}</strong><small>{metrics.evidenceSupport.numerator}/{metrics.evidenceSupport.denominator}</small></div>
            <div><span>安定性</span><strong>{formatPercent(metrics.stability)}</strong><small>{metrics.runCount} saved runs</small></div>
          </section>

          <section className="campaign-detail-section" aria-labelledby="campaign-protocol-title">
            <div className="campaign-detail-section__title">
              <Fingerprint aria-hidden="true" size={18} />
              <div><span className="eyebrow">PROVENANCE</span><h3 id="campaign-protocol-title">実行プロトコル</h3></div>
            </div>
            <dl className="campaign-detail-meta">
              <div><dt>Campaign fingerprint</dt><dd><code>{campaign.artifactHash}</code></dd></div>
              <div><dt>Schema</dt><dd>{campaign.schemaVersion}</dd></div>
              <div><dt>Evaluator</dt><dd><code>{campaign.assessorId}</code></dd></div>
              <div><dt>計画日時</dt><dd><time dateTime={campaign.plannedAt}>{formatDateTime(campaign.plannedAt)}</time></dd></div>
              <div><dt>開始日時</dt><dd>{campaign.startedAt ? <time dateTime={campaign.startedAt}>{formatDateTime(campaign.startedAt)}</time> : '記録なし'}</dd></div>
              <div><dt>完了日時</dt><dd>{campaign.completedAt ? <time dateTime={campaign.completedAt}>{formatDateTime(campaign.completedAt)}</time> : '記録なし'}</dd></div>
            </dl>
          </section>

          <section className="campaign-detail-section" aria-labelledby="campaign-jobs-title">
            <div className="campaign-detail-section__title">
              <Timer aria-hidden="true" size={18} />
              <div><span className="eyebrow">JOB LEDGER</span><h3 id="campaign-jobs-title">全Jobの実行台帳</h3></div>
            </div>
            <div className="campaign-job-list">
              {campaign.artifacts.map((artifact, index) => {
                const probe = probes.find((candidate) => candidate.id === artifact.job.probeId);
                return (
                  <article className="campaign-job" key={artifact.job.jobId}>
                    <header>
                      <span className="campaign-job__index">{String(index + 1).padStart(2, '0')}</span>
                      <ProviderBadge provider={artifact.job.provider} />
                      <Badge tone={artifact.status === 'succeeded' ? 'success' : artifact.status === 'failed' ? 'warning' : 'danger'}>
                        {artifact.status === 'succeeded' ? '保存済み' : artifact.status === 'failed' ? '失敗' : '中止'}
                      </Badge>
                      <span>repeat {artifact.job.repeatIndex + 1}</span>
                      <time dateTime={artifact.finishedAt}>{formatDuration(artifact.startedAt, artifact.finishedAt)}</time>
                    </header>
                    <div className="campaign-job__body">
                      <div>
                        <strong>{probe?.question ?? artifact.job.observation.question}</strong>
                        {artifact.status === 'failed' ? (
                          <p>{artifact.error.code} · {artifact.error.message}{artifact.error.retriable ? ' · retryable' : ''}</p>
                        ) : artifact.status === 'cancelled' ? (
                          <p>{artifact.startedAt ? '実行中に中止' : '開始前に中止'} · {artifact.reason}</p>
                        ) : (
                          <p>{artifact.run.model} · {artifact.run.assessments.length} target assessments</p>
                        )}
                      </div>
                      {artifact.status === 'succeeded' ? (
                        <button className="button button--secondary button--compact" type="button" onClick={() => onOpenRun(artifact.run.id)} aria-label={`${providerLabels[artifact.job.provider]} repeat ${artifact.job.repeatIndex + 1}のRunを見る`}>
                          Runを見る<ChevronRight aria-hidden="true" size={15} />
                        </button>
                      ) : null}
                    </div>
                    <footer><span>Artifact fingerprint</span><code>{artifact.artifactHash}</code></footer>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="modal__footer modal__footer--end">
          <button className="button button--primary" type="button" onClick={onClose}>閉じる</button>
        </footer>
      </section>
    </div>
  );
}
