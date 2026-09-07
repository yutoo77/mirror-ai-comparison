export type SubjectType = 'organization' | 'brand' | 'product' | 'service';
export type Objective = 'brand' | 'product' | 'recruiting' | 'ir';
export type ProviderId = 'chatgpt' | 'gemini' | 'perplexity' | 'claude';
export type RunOrigin = 'demo' | 'manual' | 'provider';
export type AssessmentActor = 'fixture' | 'human' | 'system';
export type CampaignStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'completed-with-errors'
  | 'cancelled';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type FindingKind =
  | 'omission'
  | 'outdated'
  | 'contradiction'
  | 'misattribution'
  | 'weak-evidence';
export type ReviewStatus =
  | 'unreviewed'
  | 'confirmed'
  | 'dismissed'
  | 'needs-evidence';
export type FindingStatus = 'open' | 'monitoring' | 'resolved';
export type SourceStatus = 'current' | 'review-due' | 'changed';
export type ClaimStatus = 'verified' | 'review-due' | 'draft';
export type ProbeStatus = 'active' | 'draft' | 'paused';
export type ActionStatus =
  | 'draft'
  | 'planned'
  | 'in-progress'
  | 'measuring'
  | 'completed';

export interface Subject {
  type: SubjectType;
  displayName: string;
  canonicalDomain: string;
  industry: string;
  aliases: string[];
  locales: string[];
}

export interface Workspace {
  id: string;
  name: string;
  subject: Subject;
  objective: Objective;
  isDemo: boolean;
  createdAt: string;
  lastMeasuredAt: string | null;
  restoreHistory?:
    | Array<{
        sourceWorkspaceId: string;
        backupFingerprint: string;
        exportedAt: string;
        restoredAt: string;
      }>
    | undefined;
}

export interface SourceSnapshot {
  capturedAt: string;
  excerpt: string;
  sha256: string;
  parserVersion: string;
  revisionNote?: string | undefined;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  type: 'web' | 'pdf' | 'manual';
  status: SourceStatus;
  owner: string;
  claimIds: string[];
  snapshot: SourceSnapshot;
  /** Previous captures, oldest first. Updating a source never replaces this evidence. */
  history?: SourceSnapshot[] | undefined;
}

export interface Claim {
  id: string;
  statement: string;
  category: string;
  sourceId: string;
  status: ClaimStatus;
  owner: string;
  reviewedAt: string;
  validFrom: string;
}

export interface Probe {
  id: string;
  question: string;
  audience: string;
  intent: string;
  providers: ProviderId[];
  repetitions: number;
  locale: string;
  status: ProbeStatus;
  targetClaimIds: string[];
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export type VisibilityAssessment = 'mentioned' | 'omitted' | 'not-applicable';
export type FactualityAssessment =
  | 'accurate'
  | 'partial'
  | 'contradicted'
  | 'unsupported'
  | 'not-assessed';
export type AttributionAssessment =
  | 'correct'
  | 'misattributed'
  | 'ambiguous'
  | 'not-applicable';
export type EvidenceAssessment =
  | 'reported-url'
  | 'fetched'
  | 'passage-match'
  | 'human-verified'
  | 'none';

export interface ClaimAssessment {
  claimId: string;
  visibility: VisibilityAssessment;
  factuality: FactualityAssessment;
  attribution: AttributionAssessment;
  evidence: EvidenceAssessment;
  confidence: number;
  rationale: string;
  observedExcerpt?: string | undefined;
  citationUrl?: string | undefined;
  assessedBy?: AssessmentActor | undefined;
  assessedAt?: string | undefined;
}

export interface RunProvenance {
  origin: RunOrigin;
  schemaVersion: 'mirror.run.v1';
  assessorId: string;
  recordedAt: string;
  recordedBy: AssessmentActor;
  artifactHash: string;
  campaignId: string | null;
}

export interface ObservationInputSnapshot {
  subject: {
    displayName: string;
    canonicalDomain: string;
    aliases: string[];
  };
  question: string;
  locale: string;
  searchEnabled: boolean;
}

export interface EvaluationTargetSnapshot {
  claimId: string;
  statement: string;
  sourceId: string;
  sourceSnapshotHash: string;
}

export interface MeasurementJobSnapshot {
  jobId: string;
  probeId: string;
  provider: ProviderId;
  repeatIndex: number;
  observation: ObservationInputSnapshot;
  evaluationTargets: EvaluationTargetSnapshot[];
}

export interface ProbeRun {
  id: string;
  probeId: string;
  provider: ProviderId;
  model: string;
  repeatIndex: number;
  executedAt: string;
  locale: string;
  searchEnabled: boolean;
  answer: string;
  citationUrls: string[];
  assessments: ClaimAssessment[];
  provenance: RunProvenance;
  inputSnapshot?:
    | {
        observation: ObservationInputSnapshot;
        evaluationTargets: EvaluationTargetSnapshot[];
      }
    | undefined;
}

interface RunArtifactBase {
  schemaVersion: 'mirror.artifact.v1';
  artifactHash: string;
  campaignId: string;
  workspaceId: string;
  job: MeasurementJobSnapshot;
  plannedAt: string;
  startedAt: string | null;
  finishedAt: string;
}

export interface SucceededRunArtifact extends RunArtifactBase {
  status: 'succeeded';
  run: ProbeRun;
}

export interface FailedRunArtifact extends RunArtifactBase {
  status: 'failed';
  error: {
    code:
      | 'adapter-not-found'
      | 'provider-error'
      | 'timeout'
      | 'invalid-response';
    message: string;
    retriable: boolean;
  };
}

export interface CancelledRunArtifact extends RunArtifactBase {
  status: 'cancelled';
  reason: string;
}

export type RunArtifact =
  | SucceededRunArtifact
  | FailedRunArtifact
  | CancelledRunArtifact;

export interface MeasurementCampaign {
  schemaVersion: 'mirror.campaign.v1';
  id: string;
  workspaceId: string;
  mode: 'demo' | 'provider';
  assessorId: string;
  artifactHash: string;
  status: CampaignStatus;
  plannedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  plannedRunCount: number;
  artifacts: RunArtifact[];
}

export interface FindingEvidence {
  evidenceState: EvidenceAssessment;
  official: {
    claimId: string;
    statement: string;
    excerpt: string;
    sourceTitle: string;
    sourceUrl: string;
    capturedAt: string | null;
  };
  observed: {
    excerpt: string;
    provider: ProviderId;
    model: string;
    executedAt: string;
    citationUrl: string | null;
  };
  rationale: string;
  confidence: number;
}

export interface FindingReview {
  id: string;
  status: ReviewStatus;
  note: string;
  at: string;
  runIds?: string[] | undefined;
}

export interface Finding {
  id: string;
  title: string;
  summary: string;
  kind: FindingKind;
  severity: RiskLevel;
  status: FindingStatus;
  reviewStatus: ReviewStatus;
  reviewHistory?: FindingReview[] | undefined;
  claimId: string;
  probeIds: string[];
  providers: ProviderId[];
  occurrenceRate: number;
  previousOccurrenceRate: number;
  runCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidence: FindingEvidence;
}

export interface ExperimentMeasurement {
  label: string;
  value: number;
  runCount: number;
  measuredAt: string;
}

export interface ActionExperiment {
  id: string;
  findingId: string;
  title: string;
  hypothesis: string;
  status: ActionStatus;
  owner: string;
  dueDate: string;
  targetMetric: string;
  channel: string;
  before: ExperimentMeasurement;
  after: ExperimentMeasurement | null;
  createdAt: string;
  measurementPlan?: ExperimentPlan | undefined;
  evaluations?: ExperimentEvaluation[] | undefined;
}

export interface ExperimentCohort {
  probeId: string;
  provider: ProviderId;
  model: string;
  locale: string;
  searchEnabled: boolean;
  origin: RunOrigin;
  assessorId: string;
  observation: ObservationInputSnapshot;
  targets: Array<{ claimId: string; statement: string }>;
}

export interface ExperimentWindow {
  startAt: string;
  endAt: string;
}
export type ExperimentExclusion =
  | 'missing-input'
  | 'different-conditions'
  | 'invalid-assessments';
export interface ExperimentTally {
  runIds: string[];
  excluded: Array<{ runId: string; reason: ExperimentExclusion }>;
  affected: number;
  notDetected: number;
  unassessed: number;
}
export interface ExperimentPlan {
  schemaVersion: 'mirror.experiment-plan.v1';
  id: string;
  createdAt: string;
  claimId: string;
  kind: FindingKind;
  cohort: ExperimentCohort;
  baselineWindow: ExperimentWindow;
  baseline: ExperimentTally;
  changedAt: string;
  changeSummary: string;
  followupWindow: ExperimentWindow;
}
export interface ExperimentEvaluation {
  id: string;
  recordedAt: string;
  note: string;
  followup: ExperimentTally;
}

export interface TrendPoint {
  label: string;
  visibility: number;
  accuracy: number;
  evidence: number;
}

export interface ActivityItem {
  id: string;
  type: 'run' | 'review' | 'source' | 'action';
  title: string;
  detail: string;
  at: string;
}

export interface WorkspaceSnapshot {
  workspace: Workspace;
  claims: Claim[];
  sources: Source[];
  probes: Probe[];
  runs: ProbeRun[];
  campaigns: MeasurementCampaign[];
  findings: Finding[];
  actions: ActionExperiment[];
  trend: TrendPoint[];
  activity: ActivityItem[];
}

export interface RatioMetric {
  numerator: number;
  denominator: number;
  ratio: number | null;
}

export interface RunMetrics {
  claimRecall: RatioMetric;
  factualAccuracy: RatioMetric;
  attributionAccuracy: RatioMetric;
  evidenceSupport: RatioMetric;
}

export interface CampaignMetrics extends RunMetrics {
  runCount: number;
  stability: number | null;
}

export const providerLabels: Record<ProviderId, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  claude: 'Claude',
};

export const findingKindLabels: Record<FindingKind, string> = {
  omission: '重要情報の欠落',
  outdated: '古い情報',
  contradiction: '事実との矛盾',
  misattribution: '誤った帰属',
  'weak-evidence': '根拠不足',
};

export const severityLabels: Record<RiskLevel, string> = {
  critical: '最優先',
  high: '高',
  medium: '中',
  low: '低',
};
