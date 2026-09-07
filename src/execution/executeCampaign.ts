import type {
  CancelledRunArtifact,
  ClaimAssessment,
  FailedRunArtifact,
  MeasurementCampaign,
  MeasurementJobSnapshot,
  ProbeRun,
  RunArtifact,
  SucceededRunArtifact,
} from '../domain/model';
import type {
  CampaignPlan,
  CampaignProgress,
  ExecuteCampaignOptions,
  ExecutionErrorCode,
  ProviderAdapter,
  ProviderObservationRequest,
  ProviderObservationResponse,
} from './contracts';
import { ProviderExecutionError } from './contracts';

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function sanitizedMessage(error: unknown): string {
  if (error instanceof ProviderExecutionError)
    return error.message.slice(0, 240);
  return 'The provider observation could not be completed.';
}

function classifyError(error: unknown): {
  code: ExecutionErrorCode;
  message: string;
  retriable: boolean;
} {
  if (error instanceof ProviderExecutionError) {
    return {
      code: error.code,
      message: sanitizedMessage(error),
      retriable: error.retriable,
    };
  }
  return {
    code: 'provider-error',
    message: sanitizedMessage(error),
    retriable: true,
  };
}

function validateResponse(response: ProviderObservationResponse): void {
  if (
    typeof response.answer !== 'string' ||
    response.answer.trim().length === 0 ||
    typeof response.model !== 'string' ||
    response.model.trim().length === 0 ||
    !Array.isArray(response.citationUrls) ||
    response.citationUrls.some((url) => typeof url !== 'string')
  ) {
    throw new InvalidExecutionResponseError(
      'Provider returned an invalid observation response.',
    );
  }
}

function validateAssessments(
  assessments: readonly ClaimAssessment[],
  job: MeasurementJobSnapshot,
): void {
  const expected = new Set(
    job.evaluationTargets.map((target) => target.claimId),
  );
  const actual = new Set(assessments.map((assessment) => assessment.claimId));
  if (
    assessments.length !== expected.size ||
    actual.size !== expected.size ||
    [...actual].some((claimId) => !expected.has(claimId))
  ) {
    throw new InvalidExecutionResponseError(
      'Assessor must return exactly one result for every targeted Claim.',
    );
  }
}

class InvalidExecutionResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExecutionResponseError';
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function providerRequest(
  job: MeasurementJobSnapshot,
): ProviderObservationRequest {
  return {
    jobId: job.jobId,
    provider: job.provider,
    repeatIndex: job.repeatIndex,
    observation: {
      ...job.observation,
      subject: {
        ...job.observation.subject,
        aliases: [...job.observation.subject.aliases],
      },
    },
  };
}

async function succeededArtifact(input: {
  plan: CampaignPlan;
  job: MeasurementJobSnapshot;
  response: ProviderObservationResponse;
  assessments: readonly ClaimAssessment[];
  startedAt: string;
  finishedAt: string;
  runId: string;
  assessorId: string;
}): Promise<Readonly<SucceededRunArtifact>> {
  const hash = await sha256(
    JSON.stringify({
      schemaVersion: 'mirror.artifact.v1',
      status: 'succeeded',
      campaignId: input.plan.id,
      workspaceId: input.plan.workspaceId,
      job: input.job,
      plannedAt: input.plan.plannedAt,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      assessorId: input.assessorId,
      response: input.response,
      assessments: input.assessments,
    }),
  );
  const run: ProbeRun = {
    inputSnapshot: structuredClone({
      observation: input.job.observation,
      evaluationTargets: input.job.evaluationTargets,
    }),
    id: input.runId,
    probeId: input.job.probeId,
    provider: input.job.provider,
    model: input.response.model,
    repeatIndex: input.job.repeatIndex,
    executedAt: input.finishedAt,
    locale: input.job.observation.locale,
    searchEnabled: input.job.observation.searchEnabled,
    answer: input.response.answer,
    citationUrls: [...input.response.citationUrls],
    assessments: input.assessments.map((assessment) => ({ ...assessment })),
    provenance: {
      origin: input.plan.mode === 'demo' ? 'demo' : 'provider',
      schemaVersion: 'mirror.run.v1',
      assessorId: input.assessorId,
      recordedAt: input.finishedAt,
      recordedBy: 'system',
      artifactHash: hash,
      campaignId: input.plan.id,
    },
  };
  return deepFreeze({
    schemaVersion: 'mirror.artifact.v1',
    artifactHash: hash,
    campaignId: input.plan.id,
    workspaceId: input.plan.workspaceId,
    job: input.job,
    plannedAt: input.plan.plannedAt,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status: 'succeeded',
    run,
  });
}

async function cancelledArtifact(
  plan: CampaignPlan,
  job: MeasurementJobSnapshot,
  startedAt: string | null,
  finishedAt: string,
): Promise<Readonly<CancelledRunArtifact>> {
  const reason = 'Measurement cancelled before completion.';
  const hash = await sha256(
    JSON.stringify({
      schemaVersion: 'mirror.artifact.v1',
      status: 'cancelled',
      campaignId: plan.id,
      workspaceId: plan.workspaceId,
      job,
      plannedAt: plan.plannedAt,
      startedAt,
      finishedAt,
      reason,
    }),
  );
  return deepFreeze({
    schemaVersion: 'mirror.artifact.v1',
    artifactHash: hash,
    campaignId: plan.id,
    workspaceId: plan.workspaceId,
    job,
    plannedAt: plan.plannedAt,
    startedAt,
    finishedAt,
    status: 'cancelled',
    reason,
  });
}

async function failedArtifact(
  plan: CampaignPlan,
  job: MeasurementJobSnapshot,
  startedAt: string,
  finishedAt: string,
  error: unknown,
  codeOverride?: FailedRunArtifact['error']['code'],
): Promise<Readonly<FailedRunArtifact>> {
  const classified = classifyError(error);
  const persistedError = {
    ...classified,
    ...(codeOverride ? { code: codeOverride } : {}),
    ...(codeOverride === 'adapter-not-found' ? { retriable: false } : {}),
    ...(error instanceof InvalidExecutionResponseError
      ? {
          code: 'invalid-response' as const,
          message: error.message,
          retriable: false,
        }
      : {}),
  };
  const hash = await sha256(
    JSON.stringify({
      schemaVersion: 'mirror.artifact.v1',
      status: 'failed',
      campaignId: plan.id,
      workspaceId: plan.workspaceId,
      job,
      plannedAt: plan.plannedAt,
      startedAt,
      finishedAt,
      error: persistedError,
    }),
  );
  return deepFreeze({
    schemaVersion: 'mirror.artifact.v1',
    artifactHash: hash,
    campaignId: plan.id,
    workspaceId: plan.workspaceId,
    job,
    plannedAt: plan.plannedAt,
    startedAt,
    finishedAt,
    status: 'failed',
    error: persistedError,
  });
}

function emitProgress(
  plan: CampaignPlan,
  artifacts: readonly RunArtifact[],
  currentJob: MeasurementJobSnapshot | null,
  onProgress: ExecuteCampaignOptions['onProgress'],
): void {
  if (!onProgress) return;
  const progress: CampaignProgress = {
    campaignId: plan.id,
    completedJobs: artifacts.length,
    totalJobs: plan.jobs.length,
    currentJob,
    succeeded: artifacts.filter((artifact) => artifact.status === 'succeeded')
      .length,
    failed: artifacts.filter((artifact) => artifact.status === 'failed').length,
    cancelled: artifacts.filter((artifact) => artifact.status === 'cancelled')
      .length,
  };
  onProgress(deepFreeze(progress));
}

function adapterFor(
  adapters: readonly ProviderAdapter[],
  job: MeasurementJobSnapshot,
  mode: CampaignPlan['mode'],
): ProviderAdapter | undefined {
  return adapters.find(
    (adapter) => adapter.provider === job.provider && adapter.mode === mode,
  );
}

export async function executeCampaign(
  plan: Readonly<CampaignPlan>,
  options: ExecuteCampaignOptions,
): Promise<Readonly<MeasurementCampaign>> {
  const startedAt = options.now();
  const artifacts: RunArtifact[] = [];
  emitProgress(plan, artifacts, null, options.onProgress);

  for (const job of plan.jobs) {
    if (options.signal.aborted) {
      artifacts.push(await cancelledArtifact(plan, job, null, options.now()));
      emitProgress(plan, artifacts, null, options.onProgress);
      continue;
    }

    const jobStartedAt = options.now();
    emitProgress(plan, artifacts, job, options.onProgress);
    const adapter = adapterFor(options.adapters, job, plan.mode);
    if (!adapter) {
      artifacts.push(
        await failedArtifact(
          plan,
          job,
          jobStartedAt,
          options.now(),
          new Error('Adapter not configured.'),
          'adapter-not-found',
        ),
      );
      emitProgress(plan, artifacts, null, options.onProgress);
      continue;
    }

    try {
      const response = await adapter.observe(providerRequest(job), {
        signal: options.signal,
      });
      if (options.signal.aborted) {
        artifacts.push(
          await cancelledArtifact(plan, job, jobStartedAt, options.now()),
        );
        emitProgress(plan, artifacts, null, options.onProgress);
        continue;
      }
      validateResponse(response);
      const assessedAt = options.now();
      const assessments = await options.assessor.assess(
        { response, targets: job.evaluationTargets },
        { signal: options.signal, assessedAt },
      );
      if (options.signal.aborted) {
        artifacts.push(
          await cancelledArtifact(plan, job, jobStartedAt, options.now()),
        );
      } else {
        validateAssessments(assessments, job);
        artifacts.push(
          await succeededArtifact({
            plan,
            job,
            response,
            assessments,
            startedAt: jobStartedAt,
            finishedAt: options.now(),
            runId: options.createRunId(job),
            assessorId: options.assessor.id,
          }),
        );
      }
    } catch (error) {
      if (options.signal.aborted || isAbortError(error)) {
        artifacts.push(
          await cancelledArtifact(plan, job, jobStartedAt, options.now()),
        );
      } else {
        artifacts.push(
          await failedArtifact(plan, job, jobStartedAt, options.now(), error),
        );
      }
    }
    emitProgress(plan, artifacts, null, options.onProgress);
  }

  const completedAt = options.now();
  const hasCancellation = artifacts.some(
    (artifact) => artifact.status === 'cancelled',
  );
  const hasFailure = artifacts.some((artifact) => artifact.status === 'failed');
  const status: MeasurementCampaign['status'] = hasCancellation
    ? 'cancelled'
    : hasFailure
      ? 'completed-with-errors'
      : 'completed';
  const campaignHash = await sha256(
    JSON.stringify({
      schemaVersion: plan.schemaVersion,
      id: plan.id,
      workspaceId: plan.workspaceId,
      mode: plan.mode,
      assessorId: options.assessor.id,
      status,
      plannedAt: plan.plannedAt,
      startedAt,
      completedAt,
      plannedRunCount: plan.jobs.length,
      artifacts,
    }),
  );
  const campaign: MeasurementCampaign = {
    schemaVersion: plan.schemaVersion,
    id: plan.id,
    workspaceId: plan.workspaceId,
    mode: plan.mode,
    assessorId: options.assessor.id,
    artifactHash: campaignHash,
    status,
    plannedAt: plan.plannedAt,
    startedAt,
    completedAt,
    plannedRunCount: plan.jobs.length,
    artifacts,
  };
  return deepFreeze(campaign);
}
