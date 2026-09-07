import type {
  ClaimAssessment,
  EvaluationTargetSnapshot,
  MeasurementCampaign,
  MeasurementJobSnapshot,
  ObservationInputSnapshot,
  ProviderId,
} from '../domain/model';

/**
 * A campaign plan is intentionally separate from the persisted campaign result.
 * The plan freezes every input needed to reproduce a run before any adapter is called.
 */
export interface CampaignPlan {
  schemaVersion: 'mirror.campaign.v1';
  id: string;
  workspaceId: string;
  mode: MeasurementCampaign['mode'];
  plannedAt: string;
  jobs: readonly MeasurementJobSnapshot[];
}

/**
 * This is the only payload visible to a provider adapter. Official Claims and
 * evaluation targets are deliberately absent so acquisition stays blind.
 */
export interface ProviderObservationRequest {
  jobId: string;
  provider: ProviderId;
  repeatIndex: number;
  observation: ObservationInputSnapshot;
}

export interface ProviderObservationResponse {
  model: string;
  answer: string;
  citationUrls: readonly string[];
}

export interface ProviderExecutionContext {
  signal: AbortSignal;
}

export interface ProviderAdapter {
  readonly provider: ProviderId;
  readonly mode: MeasurementCampaign['mode'];
  observe(
    request: Readonly<ProviderObservationRequest>,
    context: ProviderExecutionContext,
  ): Promise<ProviderObservationResponse>;
}

export interface AssessmentRequest {
  response: Readonly<ProviderObservationResponse>;
  targets: readonly EvaluationTargetSnapshot[];
}

export interface AssessmentContext {
  signal: AbortSignal;
  assessedAt: string;
}

export interface AnswerAssessor {
  readonly id: string;
  assess(
    request: Readonly<AssessmentRequest>,
    context: AssessmentContext,
  ): Promise<readonly ClaimAssessment[]>;
}

export interface CampaignProgress {
  campaignId: string;
  completedJobs: number;
  totalJobs: number;
  currentJob: MeasurementJobSnapshot | null;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export interface ExecuteCampaignOptions {
  adapters: readonly ProviderAdapter[];
  assessor: AnswerAssessor;
  signal: AbortSignal;
  now: () => string;
  createRunId: (job: MeasurementJobSnapshot) => string;
  onProgress?: (progress: Readonly<CampaignProgress>) => void;
}

export type ExecutionErrorCode =
  | 'adapter-not-found'
  | 'provider-error'
  | 'timeout'
  | 'invalid-response';

export class ProviderExecutionError extends Error {
  readonly code: Exclude<ExecutionErrorCode, 'adapter-not-found' | 'invalid-response'>;
  readonly retriable: boolean;

  constructor(
    code: ProviderExecutionError['code'],
    message: string,
    options: { retriable: boolean; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ProviderExecutionError';
    this.code = code;
    this.retriable = options.retriable;
  }
}
