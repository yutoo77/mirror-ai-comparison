import { createContext, useContext } from 'react';
import type { NewWorkspaceInput } from '../data/demoWorkspaces';
import type {
  ActionStatus,
  ClaimAssessment,
  MeasurementCampaign,
  ProviderId,
  ReviewStatus,
  WorkspaceSnapshot,
} from '../domain/model';
import type { CampaignProgress } from '../execution/contracts';
import type { WorkspaceBackup } from '../domain/workspaceBackup';
import type { ActionBriefInput } from '../domain/experimentSchema';
import type { ExperimentPlanInput } from '../domain/experiments';
import type { SourceClaimReviewInput, SourceUpdateInput } from '../domain/sourceHistory';

export interface NewProbeInput {
  question: string;
  audience: string;
  intent: string;
  providers: ProviderId[];
  repetitions: number;
  targetClaimIds: string[];
}

export interface NewSourceInput {
  title: string;
  url: string;
  excerpt: string;
  claimStatement: string;
  category: string;
  owner: string;
}

export interface ManualObservationInput {
  probeId: string;
  provider: ProviderId;
  model: string;
  executedAt: string;
  searchEnabled: boolean;
  answer: string;
  citationUrls: string[];
  assessments: ClaimAssessment[];
}

export interface WorkspaceContextValue {
  active: WorkspaceSnapshot;
  workspaces: WorkspaceSnapshot[];
  recoveryText: string | null;
  restoreWorkspace: (backup: WorkspaceBackup) => Promise<string>;
  selectWorkspace: (workspaceId: string) => void;
  createWorkspace: (input: NewWorkspaceInput) => string;
  reviewFinding: (
    findingId: string,
    status: ReviewStatus,
    note?: string,
    runIds?: string[],
  ) => void;
  createActionFromFinding: (findingId: string) => string;
  updateActionStatus: (actionId: string, status: ActionStatus) => void;
  editAction: (actionId: string, input: ActionBriefInput) => void;
  lockExperimentPlan: (actionId: string, input: ExperimentPlanInput) => void;
  recordExperimentEvaluation: (actionId: string, note: string) => void;
  addProbe: (input: NewProbeInput) => string;
  addSourceWithClaim: (input: NewSourceInput) => Promise<string>;
  updateSource: (sourceId: string, input: SourceUpdateInput) => Promise<void>;
  reviewSourceClaim: (claimId: string, input: SourceClaimReviewInput) => void;
  verifyClaim: (claimId: string) => void;
  addManualObservation: (input: ManualObservationInput) => Promise<string>;
  runDemoCampaign: (
    signal: AbortSignal,
    onProgress?: (progress: Readonly<CampaignProgress>) => void,
  ) => Promise<MeasurementCampaign>;
  resetDemo: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value)
    throw new Error('useWorkspace must be used within WorkspaceProvider.');
  return value;
}
