import type {
  EvaluationTargetSnapshot,
  MeasurementCampaign,
  MeasurementJobSnapshot,
  WorkspaceSnapshot,
} from '../domain/model';
import type { CampaignPlan } from './contracts';

export const MAX_CAMPAIGN_JOBS = 100;

export type CampaignPlanErrorCode =
  | 'no-active-probes'
  | 'invalid-repetitions'
  | 'missing-target'
  | 'missing-source'
  | 'unreviewed-target'
  | 'job-limit-exceeded';

export class CampaignPlanError extends Error {
  readonly code: CampaignPlanErrorCode;

  constructor(code: CampaignPlanErrorCode, message: string) {
    super(message);
    this.name = 'CampaignPlanError';
    this.code = code;
  }
}

export interface PlanCampaignOptions {
  campaignId: string;
  plannedAt: string;
  mode: MeasurementCampaign['mode'];
  searchEnabled?: boolean;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function planCampaign(
  snapshot: WorkspaceSnapshot,
  options: PlanCampaignOptions,
): Readonly<CampaignPlan> {
  const activeProbes = snapshot.probes.filter((probe) => probe.status === 'active');
  if (activeProbes.length === 0) {
    throw new CampaignPlanError('no-active-probes', 'At least one active probe is required.');
  }

  const claimsById = new Map(snapshot.claims.map((claim) => [claim.id, claim]));
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const jobs: MeasurementJobSnapshot[] = [];

  for (const probe of activeProbes) {
    if (!Number.isInteger(probe.repetitions) || probe.repetitions < 1) {
      throw new CampaignPlanError(
        'invalid-repetitions',
        `Probe ${probe.id} must have at least one integer repetition.`,
      );
    }
    if (probe.targetClaimIds.length === 0) {
      throw new CampaignPlanError(
        'missing-target',
        `Probe ${probe.id} must explicitly target at least one Claim.`,
      );
    }

    const evaluationTargets: EvaluationTargetSnapshot[] = probe.targetClaimIds.map((claimId) => {
      const claim = claimsById.get(claimId);
      if (!claim) {
        throw new CampaignPlanError(
          'missing-target',
          `Probe ${probe.id} references missing Claim ${claimId}.`,
        );
      }
      const source = sourcesById.get(claim.sourceId);
      if (!source) {
        throw new CampaignPlanError(
          'missing-source',
          `Claim ${claim.id} references missing Source ${claim.sourceId}.`,
        );
      }
      if (source.history?.length && claim.status !== 'verified') {
        throw new CampaignPlanError('unreviewed-target', '資料更新後の確認項目が未確認です。「公式情報」で原文と照合してから観測してください。');
      }
      return {
        claimId: claim.id,
        statement: claim.statement,
        sourceId: source.id,
        sourceSnapshotHash: source.snapshot.sha256,
      };
    });

    for (const provider of probe.providers) {
      for (let repeatIndex = 0; repeatIndex < probe.repetitions; repeatIndex += 1) {
        jobs.push({
          jobId: `${options.campaignId}:${probe.id}:${provider}:${repeatIndex}`,
          probeId: probe.id,
          provider,
          repeatIndex,
          observation: {
            subject: {
              displayName: snapshot.workspace.subject.displayName,
              canonicalDomain: snapshot.workspace.subject.canonicalDomain,
              aliases: [...snapshot.workspace.subject.aliases],
            },
            question: probe.question,
            locale: probe.locale,
            searchEnabled: options.searchEnabled ?? true,
          },
          evaluationTargets: evaluationTargets.map((target) => ({ ...target })),
        });
        if (jobs.length > MAX_CAMPAIGN_JOBS) {
          throw new CampaignPlanError(
            'job-limit-exceeded',
            `A campaign cannot exceed ${MAX_CAMPAIGN_JOBS} jobs.`,
          );
        }
      }
    }
  }

  return deepFreeze({
    schemaVersion: 'mirror.campaign.v1',
    id: options.campaignId,
    workspaceId: snapshot.workspace.id,
    mode: options.mode,
    plannedAt: options.plannedAt,
    jobs,
  });
}
