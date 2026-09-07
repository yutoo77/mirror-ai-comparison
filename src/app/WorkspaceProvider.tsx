import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { z } from 'zod';
import {
  createEmptyWorkspace,
  demoWorkspaces,
  type NewWorkspaceInput,
} from '../data/demoWorkspaces';
import type {
  ActionExperiment,
  ActionStatus,
  Claim,
  FindingReview,
  MeasurementCampaign,
  Probe,
  ProbeRun,
  ReviewStatus,
  Source,
  WorkspaceSnapshot,
  ExperimentPlan,
  ExperimentEvaluation,
} from '../domain/model';
import {
  actionBriefSchema,
  type ActionBriefInput,
} from '../domain/experimentSchema';
import {
  createExperimentEvaluation,
  createExperimentPlan,
  type ExperimentPlanInput,
} from '../domain/experiments';
import { findingKindLabels } from '../domain/model';
import { isSafeHttpUrl } from '../domain/urls';
import {
  applySourceVersion,
  prepareSourceVersion,
  reviewSourceClaim as applySourceClaimReview,
  type SourceClaimReviewInput,
  type SourceUpdateInput,
} from '../domain/sourceHistory';
import { buildIncident } from '../domain/incident';
import { persistWorkspace, reportStorageError } from './storageStatus';
import {
  restoreWorkspaceCopy,
  workspaceSnapshotSchema,
  validateWorkspaceReferences,
  type WorkspaceBackup,
} from '../domain/workspaceBackup';
import {
  deriveFindingsFromRuns,
  validateRunAssessments,
} from '../domain/observation';
import { aggregateCampaignMetrics } from '../domain/metrics';
import type { CampaignProgress } from '../execution/contracts';
import { createDeterministicDemoAdapters } from '../execution/demoAdapter';
import { RuleBasedDemoAssessor } from '../execution/demoAssessor';
import { executeCampaign } from '../execution/executeCampaign';
import { planCampaign } from '../execution/planCampaign';
import {
  type ManualObservationInput,
  type NewProbeInput,
  type NewSourceInput,
  type WorkspaceContextValue,
  WorkspaceContext,
} from './workspaceContext';

const STORAGE_KEY = 'mirror:v2:workspace-state';

interface WorkspaceState {
  activeWorkspaceId: string;
  workspaces: WorkspaceSnapshot[];
  storageBlocked: boolean;
  recoveryText: string | null;
}

type WorkspaceAction =
  | { type: 'select'; workspaceId: string }
  | { type: 'create'; snapshot: WorkspaceSnapshot }
  | { type: 'review-finding'; findingId: string; review: FindingReview }
  | { type: 'create-action'; experiment: ActionExperiment }
  | { type: 'update-action-status'; actionId: string; status: ActionStatus }
  | { type: 'edit-action'; actionId: string; brief: ActionBriefInput }
  | { type: 'plan-action'; actionId: string; plan: ExperimentPlan }
  | {
      type: 'evaluate-action';
      actionId: string;
      planId: string;
      evaluation: ExperimentEvaluation;
    }
  | { type: 'add-probe'; probe: Probe }
  | { type: 'add-source-and-claim'; source: Source; claim: Claim }
  | { type: 'update-source'; workspaceId: string; sourceId: string; expectedHash: string; version: Source['snapshot'] }
  | { type: 'review-source-claim'; claimId: string; input: SourceClaimReviewInput }
  | { type: 'verify-claim'; claimId: string }
  | { type: 'record-run'; run: ProbeRun }
  | { type: 'record-campaign'; campaign: MeasurementCampaign }
  | { type: 'reset-demo' };

const storageSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  activeWorkspaceId: z.string(),
  workspaces: z.array(
    z
      .object({
        workspace: z.object({ id: z.string() }).passthrough(),
        claims: z.array(z.unknown()),
        sources: z.array(z.unknown()),
        probes: z.array(z.unknown()),
        runs: z.array(z.unknown()),
        campaigns: z.array(z.unknown()).optional(),
        findings: z.array(z.unknown()),
        actions: z.array(z.unknown()),
        trend: z.array(z.unknown()),
        activity: z.array(z.unknown()),
      })
      .passthrough(),
  ),
});

const cloneDemoState = (): WorkspaceState => ({
  activeWorkspaceId: demoWorkspaces[0]?.workspace.id ?? '',
  workspaces: structuredClone(demoWorkspaces),
  storageBlocked: false,
  recoveryText: null,
});

function migrateStoredRun(storedRun: unknown, index: number): ProbeRun {
  const run = storedRun as ProbeRun;
  return run.provenance
    ? {
        ...run,
        provenance: {
          ...run.provenance,
          assessorId:
            run.provenance.assessorId ??
            (run.provenance.origin === 'manual'
              ? 'legacy-manual'
              : 'legacy-fixture'),
        },
      }
    : {
        ...run,
        provenance: {
          origin: 'demo',
          schemaVersion: 'mirror.run.v1',
          assessorId: 'legacy-fixture',
          recordedAt: run.executedAt,
          recordedBy: 'fixture',
          artifactHash: `legacy-${run.id || index}`,
          campaignId: null,
        },
      };
}

function loadInitialState(): WorkspaceState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return cloneDemoState();
    const parsed = storageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !parsed.data.workspaces.length)
      throw new Error('Invalid workspace storage.');

    const workspaces = parsed.data.workspaces.map((snapshot) => ({
      ...snapshot,
      campaigns: (snapshot.campaigns ?? []).map(
        (storedCampaign, campaignIndex) => {
          const campaign = storedCampaign as MeasurementCampaign;
          return {
            ...campaign,
            schemaVersion: campaign.schemaVersion ?? 'mirror.campaign.v1',
            assessorId: campaign.assessorId ?? 'legacy-unknown',
            artifactHash:
              campaign.artifactHash ??
              `legacy-campaign-${campaign.id || campaignIndex}`,
            artifacts: (campaign.artifacts ?? []).map(
              (artifact, artifactIndex) => {
                if (artifact.status === 'succeeded') {
                  const run = migrateStoredRun(artifact.run, artifactIndex);
                  return {
                    ...artifact,
                    run,
                    artifactHash:
                      artifact.artifactHash ?? run.provenance.artifactHash,
                  };
                }
                return {
                  ...artifact,
                  artifactHash:
                    artifact.artifactHash ??
                    `legacy-artifact-${artifact.job?.jobId || artifactIndex}`,
                };
              },
            ),
          };
        },
      ),
      runs: snapshot.runs.map(migrateStoredRun),
    })) as unknown as WorkspaceSnapshot[];
    for (const snapshot of workspaces) {
      workspaceSnapshotSchema.parse(snapshot);
      validateWorkspaceReferences(snapshot);
    }
    if (
      new Set(workspaces.map((snapshot) => snapshot.workspace.id)).size !==
      workspaces.length
    )
      throw new Error('Duplicate workspace IDs.');
    const activeExists = workspaces.some(
      (snapshot) => snapshot.workspace.id === parsed.data.activeWorkspaceId,
    );
    return {
      activeWorkspaceId: activeExists
        ? parsed.data.activeWorkspaceId
        : (workspaces[0]?.workspace.id ?? ''),
      workspaces,
      storageBlocked: false,
      recoveryText: null,
    };
  } catch {
    return { ...cloneDemoState(), storageBlocked: true, recoveryText: raw };
  }
}

function updateActiveWorkspace(
  state: WorkspaceState,
  updater: (workspace: WorkspaceSnapshot) => WorkspaceSnapshot,
): WorkspaceState {
  return {
    ...state,
    workspaces: state.workspaces.map((snapshot) =>
      snapshot.workspace.id === state.activeWorkspaceId
        ? updater(snapshot)
        : snapshot,
    ),
  };
}

function latestIsoTimestamp(
  ...values: Array<string | null | undefined>
): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function deriveFindingsFromComparableRuns(snapshot: WorkspaceSnapshot) {
  const probeById = new Map(snapshot.probes.map((probe) => [probe.id, probe]));
  const comparableRuns = snapshot.runs.filter((run) => {
    const probe = probeById.get(run.probeId);
    return probe ? validateRunAssessments(run, probe).valid : false;
  });
  return deriveFindingsFromRuns({ ...snapshot, runs: comparableRuns });
}

function reducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case 'select':
      return state.workspaces.some(
        (snapshot) => snapshot.workspace.id === action.workspaceId,
      )
        ? { ...state, activeWorkspaceId: action.workspaceId }
        : state;
    case 'create':
      if (
        state.workspaces.some(
          (snapshot) => snapshot.workspace.id === action.snapshot.workspace.id,
        )
      )
        return state;
      return {
        ...state,
        activeWorkspaceId: action.snapshot.workspace.id,
        workspaces: [...state.workspaces, action.snapshot],
      };
    case 'review-finding':
      return updateActiveWorkspace(state, (snapshot) => ({
        ...snapshot,
        findings: snapshot.findings.map((finding) =>
          finding.id === action.findingId
            ? {
                ...finding,
                reviewStatus: action.review.status,
                reviewHistory: [
                  ...(finding.reviewHistory ?? []),
                  action.review,
                ],
                status:
                  action.review.status === 'dismissed'
                    ? 'resolved'
                    : finding.reviewStatus === 'dismissed'
                      ? 'open'
                      : finding.status,
              }
            : finding,
        ),
      }));
    case 'create-action':
      return updateActiveWorkspace(state, (snapshot) => ({
        ...snapshot,
        actions: [action.experiment, ...snapshot.actions],
      }));
    case 'edit-action':
      return updateActiveWorkspace(state, (snapshot) => ({
        ...snapshot,
        actions: snapshot.actions.map((item) =>
          item.id === action.actionId && !item.measurementPlan
            ? { ...item, ...action.brief }
            : item,
        ),
      }));
    case 'plan-action':
      return updateActiveWorkspace(state, (snapshot) => {
        const target = snapshot.actions.find(
          (item) => item.id === action.actionId,
        );
        if (!target || target.measurementPlan) return snapshot;
        return {
          ...snapshot,
          actions: snapshot.actions.map((item) =>
            item.id === action.actionId && !item.measurementPlan
              ? { ...item, measurementPlan: action.plan, status: 'measuring' }
              : item,
          ),
          activity: [
            {
              id: `activity-${action.plan.id}`,
              type: 'action',
              title: '比較条件と変更前の回答を固定しました',
              detail: action.plan.changeSummary,
              at: action.plan.createdAt,
            },
            ...snapshot.activity,
          ],
        };
      });
    case 'evaluate-action':
      return updateActiveWorkspace(state, (snapshot) => {
        const target = snapshot.actions.find(
          (item) => item.id === action.actionId,
        );
        if (
          target?.measurementPlan?.id !== action.planId ||
          target.evaluations?.some((entry) => entry.id === action.evaluation.id)
        )
          return snapshot;
        return {
          ...snapshot,
          actions: snapshot.actions.map((item) =>
            item.id === action.actionId &&
            item.measurementPlan?.id === action.planId &&
            !item.evaluations?.some(
              (entry) => entry.id === action.evaluation.id,
            )
              ? {
                  ...item,
                  status: 'completed',
                  evaluations: [...(item.evaluations ?? []), action.evaluation],
                }
              : item,
          ),
          activity: [
            {
              id: `activity-${action.evaluation.id}`,
              type: 'action',
              title: '改善検証の集計と判断メモを保存しました',
              detail: action.evaluation.note,
              at: action.evaluation.recordedAt,
            },
            ...snapshot.activity,
          ],
        };
      });
    case 'update-action-status':
      return updateActiveWorkspace(state, (snapshot) => ({
        ...snapshot,
        actions: snapshot.actions.map((experiment) =>
          experiment.id === action.actionId
            ? { ...experiment, status: action.status }
            : experiment,
        ),
      }));
    case 'add-probe':
      return updateActiveWorkspace(state, (snapshot) => ({
        ...snapshot,
        probes: [action.probe, ...snapshot.probes],
      }));
    case 'add-source-and-claim':
      return updateActiveWorkspace(state, (snapshot) => ({
        ...snapshot,
        sources: [action.source, ...snapshot.sources],
        claims: [action.claim, ...snapshot.claims],
        activity: [
          {
            id: `activity-${crypto.randomUUID()}`,
            type: 'source',
            title: '公式情報を追加しました',
            detail: action.source.title,
            at: action.source.snapshot.capturedAt,
          },
          ...snapshot.activity,
        ],
      }));
    case 'update-source':
      return {
        ...state,
        workspaces: state.workspaces.map((snapshot) => {
          if (snapshot.workspace.id !== action.workspaceId) return snapshot;
          // A stale asynchronous update must never overwrite a newer capture.
          if (snapshot.sources.find((source) => source.id === action.sourceId)?.snapshot.sha256 !== action.expectedHash)
            return snapshot;
          return applySourceVersion(snapshot, action.sourceId, action.expectedHash, action.version);
        }),
      };
    case 'review-source-claim':
      return updateActiveWorkspace(state, (snapshot) =>
        applySourceClaimReview(snapshot, action.claimId, action.input));
    case 'verify-claim':
      return updateActiveWorkspace(state, (snapshot) => ({
        ...snapshot,
        claims: snapshot.claims.map((claim) =>
          claim.id === action.claimId
            ? {
                ...claim,
                status: 'verified',
                reviewedAt: new Date().toISOString(),
              }
            : claim,
        ),
      }));
    case 'record-run':
      return updateActiveWorkspace(state, (snapshot) => {
        if (snapshot.runs.some((run) => run.id === action.run.id))
          return snapshot;
        const workspaceLastMeasuredAt = latestIsoTimestamp(
          snapshot.workspace.lastMeasuredAt,
          action.run.executedAt,
        );
        const nextSnapshot: WorkspaceSnapshot = {
          ...snapshot,
          workspace: {
            ...snapshot.workspace,
            lastMeasuredAt: workspaceLastMeasuredAt,
          },
          probes: snapshot.probes.map((probe) =>
            probe.id === action.run.probeId
              ? {
                  ...probe,
                  lastRunAt: latestIsoTimestamp(
                    probe.lastRunAt,
                    action.run.executedAt,
                  ),
                }
              : probe,
          ),
          runs: [...snapshot.runs, action.run],
          activity: [
            {
              id: `activity-${crypto.randomUUID()}`,
              type: 'run',
              title: '回答を手動で取り込みました',
              detail: `${action.run.provider} · ${action.run.assessments.length} target assessments`,
              at: action.run.provenance.recordedAt,
            },
            ...snapshot.activity,
          ],
        };
        return {
          ...nextSnapshot,
          findings: deriveFindingsFromComparableRuns(nextSnapshot),
        };
      });
    case 'record-campaign':
      return {
        ...state,
        workspaces: state.workspaces.map((snapshot) => {
          if (snapshot.workspace.id !== action.campaign.workspaceId)
            return snapshot;
          if (
            snapshot.campaigns.some(
              (campaign) => campaign.id === action.campaign.id,
            )
          )
            return snapshot;

          const successfulRuns = action.campaign.artifacts.flatMap(
            (artifact) =>
              artifact.status === 'succeeded' ? [artifact.run] : [],
          );
          const knownRunIds = new Set(snapshot.runs.map((run) => run.id));
          const newRuns = successfulRuns.filter(
            (run) => !knownRunIds.has(run.id),
          );
          const runs = [...snapshot.runs, ...newRuns];
          const latestRunAt = latestIsoTimestamp(
            snapshot.workspace.lastMeasuredAt,
            ...newRuns.map((run) => run.executedAt),
          );
          const measuredProbeIds = new Set(newRuns.map((run) => run.probeId));
          const nextSnapshot: WorkspaceSnapshot = {
            ...snapshot,
            workspace: { ...snapshot.workspace, lastMeasuredAt: latestRunAt },
            probes: snapshot.probes.map((probe) =>
              measuredProbeIds.has(probe.id)
                ? {
                    ...probe,
                    lastRunAt: latestIsoTimestamp(
                      probe.lastRunAt,
                      ...newRuns
                        .filter((run) => run.probeId === probe.id)
                        .map((run) => run.executedAt),
                    ),
                  }
                : probe,
            ),
            runs,
            campaigns: [...snapshot.campaigns, action.campaign],
            activity: [
              {
                id: `activity-${crypto.randomUUID()}`,
                type: 'run',
                title:
                  action.campaign.status === 'completed'
                    ? 'デモCampaignが完了しました'
                    : 'デモCampaignを監査履歴へ保存しました',
                detail: `${newRuns.length}/${action.campaign.plannedRunCount} answersを保存 · ${action.campaign.id}`,
                at: action.campaign.completedAt ?? action.campaign.plannedAt,
              },
              ...snapshot.activity,
            ],
          };
          const campaignMetrics = aggregateCampaignMetrics(
            newRuns,
            nextSnapshot.probes,
          );
          const measuredAt =
            action.campaign.completedAt ?? action.campaign.plannedAt;
          const trend =
            newRuns.length > 0
              ? [
                  ...nextSnapshot.trend,
                  {
                    label: new Intl.DateTimeFormat('ja-JP', {
                      month: 'numeric',
                      day: 'numeric',
                    }).format(new Date(measuredAt)),
                    visibility: campaignMetrics.claimRecall.ratio ?? 0,
                    accuracy: campaignMetrics.factualAccuracy.ratio ?? 0,
                    evidence: campaignMetrics.evidenceSupport.ratio ?? 0,
                  },
                ].slice(-8)
              : nextSnapshot.trend;
          return {
            ...nextSnapshot,
            trend,
            findings: deriveFindingsFromComparableRuns(nextSnapshot),
          };
        }),
      };
    case 'reset-demo':
      return {
        ...state,
        activeWorkspaceId:
          demoWorkspaces[0]?.workspace.id ?? state.activeWorkspaceId,
        workspaces: [
          ...structuredClone(demoWorkspaces),
          ...state.workspaces.filter(
            (snapshot) =>
              !demoWorkspaces.some(
                (demo) => demo.workspace.id === snapshot.workspace.id,
              ),
          ),
        ],
      };
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const pendingSourceUpdates = useRef(new Set<string>());
  const active =
    state.workspaces.find(
      (snapshot) => snapshot.workspace.id === state.activeWorkspaceId,
    ) ?? state.workspaces[0];

  useEffect(() => {
    if (state.storageBlocked) {
      reportStorageError(
        state.recoveryText === null
          ? 'ブラウザの保存領域を読み取れないため、一時モードで開いています。元データは取得できていません。このタブでの変更は自動保存されません。必要な変更は「バックアップと復元」で書き出してください。'
          : '保存データを読み取れなかったため、元のデータを上書きせず一時モードで開いています。「バックアップと復元」で元の保存データを退避してください。このタブでの変更は自動保存されません。',
      );
      return;
    }
    persistWorkspace(STORAGE_KEY, {
      version: 2,
      activeWorkspaceId: state.activeWorkspaceId,
      workspaces: state.workspaces,
    });
  }, [state]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    dispatch({ type: 'select', workspaceId });
  }, []);

  const createWorkspace = useCallback((input: NewWorkspaceInput) => {
    const snapshot = createEmptyWorkspace(input);
    dispatch({ type: 'create', snapshot });
    return snapshot.workspace.id;
  }, []);

  const restoreWorkspace = useCallback(async (backup: WorkspaceBackup) => {
    const snapshot = await restoreWorkspaceCopy(backup);
    dispatch({ type: 'create', snapshot });
    return snapshot.workspace.id;
  }, []);

  const reviewFinding = useCallback(
    (
      findingId: string,
      status: ReviewStatus,
      note = '',
      runIds: string[] = [],
    ) => {
      const trimmed = note.trim();
      if (!trimmed || trimmed.length > 2000)
        throw new Error('判断の理由を1〜2,000文字で記録してください。');
      if (runIds.some((id) => !active?.runs.some((run) => run.id === id)))
        throw new Error('参照する回答が見つかりません。');
      dispatch({
        type: 'review-finding',
        findingId,
        review: {
          id: `review-${crypto.randomUUID()}`,
          status,
          note: trimmed,
          at: new Date().toISOString(),
          runIds: [...new Set(runIds)],
        },
      });
    },
    [active],
  );

  const createActionFromFinding = useCallback(
    (findingId: string) => {
      if (!active) return '';
      const finding = active.findings.find(
        (candidate) => candidate.id === findingId,
      );
      if (!finding) return '';
      const existing = active.actions.find(
        (experiment) => experiment.findingId === findingId,
      );
      if (existing) return existing.id;
      const incident = buildIncident(active, finding);
      if (finding.reviewStatus !== 'confirmed' || incident.rate === null)
        return '';

      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 14);
      const experiment: ActionExperiment = {
        id: `action-${crypto.randomUUID()}`,
        findingId,
        title: `${finding.title}への改善案`,
        hypothesis: `公式情報の構造と表現を改善すると、「${findingKindLabels[finding.kind]}」の非検出率が上がる。同条件で再観測して検証する。`,
        status: 'draft',
        owner: '未設定',
        dueDate: dueDate.toISOString(),
        targetMetric: `${findingKindLabels[finding.kind]}の非検出率（保存Run・判定可能分）`,
        channel: '未設定',
        before: {
          label: '変更前',
          value: 1 - incident.rate,
          runCount: incident.evaluable,
          measuredAt:
            incident.observations.find(
              (row) =>
                row.verdict === 'affected' || row.verdict === 'not-detected',
            )?.run.executedAt ?? finding.lastSeenAt,
        },
        after: null,
        createdAt: now.toISOString(),
      };
      dispatch({ type: 'create-action', experiment });
      return experiment.id;
    },
    [active],
  );

  const updateActionStatus = useCallback(
    (actionId: string, status: ActionStatus) => {
      if (
        status === 'completed' &&
        !active?.actions.find((item) => item.id === actionId)?.evaluations
          ?.length
      )
        throw new Error('比較条件を固定して、再測定結果を記録してください。');
      dispatch({ type: 'update-action-status', actionId, status });
    },
    [active],
  );

  const editAction = useCallback(
    (actionId: string, input: ActionBriefInput) => {
      const action = active?.actions.find((item) => item.id === actionId);
      if (!action || action.measurementPlan)
        throw new Error('条件固定後は仮説を上書きできません。');
      const parsed = actionBriefSchema.safeParse(input);
      if (!parsed.success)
        throw new Error(
          'タイトル4〜200文字、仮説10〜2,000文字、担当・掲載先1〜100文字、期限を確認してください。',
        );
      dispatch({ type: 'edit-action', actionId, brief: parsed.data });
    },
    [active],
  );

  const lockExperimentPlan = useCallback(
    (actionId: string, input: ExperimentPlanInput) => {
      const action = active?.actions.find((item) => item.id === actionId);
      const finding = active?.findings.find(
        (item) => item.id === action?.findingId,
      );
      if (!active || !action || !finding)
        throw new Error('対象の改善案が見つかりません。');
      const plan = createExperimentPlan(active, action, finding, input);
      dispatch({ type: 'plan-action', actionId, plan });
    },
    [active],
  );

  const recordExperimentEvaluation = useCallback(
    (actionId: string, note: string) => {
      const action = active?.actions.find((item) => item.id === actionId);
      if (!active || !action?.measurementPlan)
        throw new Error('比較条件を先に固定してください。');
      const evaluation = createExperimentEvaluation(
        active,
        action.measurementPlan,
        note,
      );
      dispatch({
        type: 'evaluate-action',
        actionId,
        planId: action.measurementPlan.id,
        evaluation,
      });
    },
    [active],
  );

  const addProbe = useCallback(
    (input: NewProbeInput) => {
      const id = `probe-${crypto.randomUUID()}`;
      const probe: Probe = {
        id,
        question: input.question,
        audience: input.audience,
        intent: input.intent,
        providers: input.providers,
        repetitions: input.repetitions,
        locale: active?.workspace.subject.locales[0] ?? 'ja-JP',
        status: 'active',
        targetClaimIds: input.targetClaimIds,
        lastRunAt: null,
        nextRunAt: null,
      };
      dispatch({ type: 'add-probe', probe });
      return id;
    },
    [active],
  );

  const addSourceWithClaim = useCallback(async (input: NewSourceInput) => {
    if (!isSafeHttpUrl(input.url))
      throw new Error('認証情報を含まないHTTP(S) URLを入力してください。');
    const capturedAt = new Date().toISOString();
    const sourceId = `source-${crypto.randomUUID()}`;
    const claimId = `claim-${crypto.randomUUID()}`;
    const source: Source = {
      id: sourceId,
      title: input.title,
      url: input.url,
      type: 'web',
      status: 'current',
      owner: input.owner,
      claimIds: [claimId],
      snapshot: {
        capturedAt,
        excerpt: input.excerpt,
        sha256: await sha256(input.excerpt),
        parserVersion: 'local-manual-v1',
      },
    };
    const claim: Claim = {
      id: claimId,
      statement: input.claimStatement,
      category: input.category,
      sourceId,
      status: 'draft',
      owner: input.owner,
      reviewedAt: capturedAt,
      validFrom: capturedAt,
    };
    dispatch({ type: 'add-source-and-claim', source, claim });
    return sourceId;
  }, []);

  const updateSource = useCallback(async (sourceId: string, input: SourceUpdateInput) => {
    const source = active?.sources.find((item) => item.id === sourceId);
    if (!active || !source) throw new Error('更新する資料が見つかりません。');
    const key = `${active.workspace.id}:${sourceId}`;
    if (pendingSourceUpdates.current.has(key)) throw new Error('この資料は保存中です。完了してから更新してください。');
    pendingSourceUpdates.current.add(key);
    try {
      const version = await prepareSourceVersion(source, input);
      dispatch({ type: 'update-source', workspaceId: active.workspace.id, sourceId, expectedHash: input.expectedHash, version });
    } finally { pendingSourceUpdates.current.delete(key); }
  }, [active]);

  const reviewSourceClaim = useCallback((claimId: string, input: SourceClaimReviewInput) => {
    if (!active) throw new Error('確認するWorkspaceが見つかりません。');
    // Validate before dispatch so the dialog can retain the user's input on errors.
    applySourceClaimReview(active, claimId, input);
    dispatch({ type: 'review-source-claim', claimId, input });
  }, [active]);

  const verifyClaim = useCallback((claimId: string) => {
    dispatch({ type: 'verify-claim', claimId });
  }, []);

  const addManualObservation = useCallback(
    async (input: ManualObservationInput) => {
      if (!active) throw new Error('Workspace data is unavailable.');
      const probe = active.probes.find(
        (candidate) => candidate.id === input.probeId,
      );
      if (!probe) throw new Error('選択した質問が見つかりません。');

      if (
        !validateRunAssessments({ assessments: input.assessments }, probe).valid
      ) {
        throw new Error('すべての対象Claimを一度ずつ評価してください。');
      }

      const recordedAt = new Date().toISOString();
      const executedAt = new Date(input.executedAt).toISOString();
      const repeatIndex =
        active.runs
          .filter(
            (run) =>
              run.probeId === input.probeId && run.provider === input.provider,
          )
          .reduce((highest, run) => Math.max(highest, run.repeatIndex), -1) + 1;
      const citationUrls = [
        ...new Set(input.citationUrls.map((url) => url.trim()).filter(Boolean)),
      ];
      if (
        [
          ...citationUrls,
          ...input.assessments.flatMap((item) =>
            item.citationUrl ? [item.citationUrl] : [],
          ),
        ].some((url) => !isSafeHttpUrl(url))
      ) {
        throw new Error('認証情報を含まないHTTP(S) URLを入力してください。');
      }
      const assessments = input.assessments.map((assessment) => ({
        ...assessment,
        assessedBy: 'human' as const,
        assessedAt: recordedAt,
      }));
      const inputSnapshot = structuredClone({
        observation: {
          subject: {
            displayName: active.workspace.subject.displayName,
            canonicalDomain: active.workspace.subject.canonicalDomain,
            aliases: active.workspace.subject.aliases,
          },
          question: probe.question,
          locale: probe.locale,
          searchEnabled: input.searchEnabled,
        },
        evaluationTargets: probe.targetClaimIds.map((claimId) => {
          const claim = active.claims.find((item) => item.id === claimId);
          const source = active.sources.find(
            (item) => item.id === claim?.sourceId,
          );
          if (!claim || !source)
            throw new Error('比較条件の公式Claim・Sourceが見つかりません。');
          return {
            claimId,
            statement: claim.statement,
            sourceId: source.id,
            sourceSnapshotHash: source.snapshot.sha256,
          };
        }),
      });
      const canonicalPayload = JSON.stringify({
        inputSnapshot,
        assessorId: 'human-manual-v1',
        probeId: input.probeId,
        provider: input.provider,
        model: input.model.trim(),
        executedAt,
        searchEnabled: input.searchEnabled,
        answer: input.answer.trim(),
        citationUrls,
        assessments,
      });
      const id = `run-${crypto.randomUUID()}`;
      const run: ProbeRun = {
        inputSnapshot,
        id,
        probeId: input.probeId,
        provider: input.provider,
        model: input.model.trim(),
        repeatIndex,
        executedAt,
        locale: probe.locale,
        searchEnabled: input.searchEnabled,
        answer: input.answer.trim(),
        citationUrls,
        assessments,
        provenance: {
          origin: 'manual',
          schemaVersion: 'mirror.run.v1',
          assessorId: 'human-manual-v1',
          recordedAt,
          recordedBy: 'human',
          artifactHash: await sha256(canonicalPayload),
          campaignId: null,
        },
      };
      dispatch({ type: 'record-run', run });
      return id;
    },
    [active],
  );

  const runDemoCampaign = useCallback(
    async (
      signal: AbortSignal,
      onProgress?: (progress: Readonly<CampaignProgress>) => void,
    ) => {
      if (!active) throw new Error('Workspace data is unavailable.');
      const plannedAt = new Date().toISOString();
      const campaignId = `campaign-${crypto.randomUUID()}`;
      const plan = planCampaign(active, {
        campaignId,
        plannedAt,
        mode: 'demo',
      });
      const providers = [...new Set(plan.jobs.map((job) => job.provider))];
      const campaign = await executeCampaign(plan, {
        adapters: createDeterministicDemoAdapters(providers, 90),
        assessor: new RuleBasedDemoAssessor(),
        signal,
        now: () => new Date().toISOString(),
        createRunId: (job) =>
          `run-${campaignId}-${job.probeId}-${job.provider}-${job.repeatIndex}`,
        ...(onProgress ? { onProgress } : {}),
      });
      dispatch({ type: 'record-campaign', campaign });
      return campaign;
    },
    [active],
  );

  const resetDemo = useCallback(() => {
    dispatch({ type: 'reset-demo' });
  }, []);

  const value = useMemo<WorkspaceContextValue | null>(() => {
    if (!active) return null;
    return {
      active,
      workspaces: state.workspaces,
      recoveryText: state.recoveryText,
      restoreWorkspace,
      selectWorkspace,
      createWorkspace,
      reviewFinding,
      createActionFromFinding,
      updateActionStatus,
      editAction,
      lockExperimentPlan,
      recordExperimentEvaluation,
      addProbe,
      addSourceWithClaim,
      updateSource,
      reviewSourceClaim,
      verifyClaim,
      addManualObservation,
      runDemoCampaign,
      resetDemo,
    };
  }, [
    active,
    state.workspaces,
    state.recoveryText,
    restoreWorkspace,
    selectWorkspace,
    createWorkspace,
    reviewFinding,
    createActionFromFinding,
    updateActionStatus,
    editAction,
    lockExperimentPlan,
    recordExperimentEvaluation,
    addProbe,
    addSourceWithClaim,
    updateSource,
    reviewSourceClaim,
    verifyClaim,
    addManualObservation,
    runDemoCampaign,
    resetDemo,
  ]);

  if (!active) {
    return <main className="fatal-error">Workspace data is unavailable.</main>;
  }

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}
