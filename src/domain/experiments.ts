import type {
  ActionExperiment,
  ExperimentCohort,
  ExperimentEvaluation,
  ExperimentPlan,
  ExperimentTally,
  ExperimentWindow,
  Finding,
  ProbeRun,
  WorkspaceSnapshot,
} from './model';
import { canonicalJson, freezeDeep } from './integrity';
import { classifyIncident } from './incident';
import { validateRunAssessments } from './observation';
import {
  experimentEvaluationSchema,
  experimentPlanSchema,
} from './experimentSchema';

type Evidence = Pick<WorkspaceSnapshot, 'runs' | 'probes' | 'claims'>;
export const exclusionLabels = {
  'missing-input': '入力Snapshotがない旧形式の回答',
  'different-conditions': '質問・モデル・取得方法・評価基準などが異なる',
  'invalid-assessments': '対象Claimの判定が欠落・重複している',
};

export interface ExperimentPlanInput {
  seedRunId: string;
  baselineWindow: ExperimentWindow;
  changedAt: string;
  changeSummary: string;
  followupWindow: ExperimentWindow;
}

/** Conditions known at capture time; never substitute today's Probe/Claim text. */
export function cohortForRun(run: ProbeRun): ExperimentCohort | null {
  const input = run.inputSnapshot;
  if (
    !input ||
    !input.observation.question.trim() ||
    !run.model.trim() ||
    !run.provenance.assessorId.trim()
  )
    return null;
  if (
    input.observation.locale !== run.locale ||
    input.observation.searchEnabled !== run.searchEnabled
  )
    return null;
  const targetIds = input.evaluationTargets.map((target) => target.claimId);
  if (!targetIds.length || new Set(targetIds).size !== targetIds.length)
    return null;
  return {
    probeId: run.probeId,
    provider: run.provider,
    model: run.model,
    locale: run.locale,
    searchEnabled: run.searchEnabled,
    origin: run.provenance.origin,
    assessorId: run.provenance.assessorId,
    observation: {
      ...input.observation,
      subject: {
        ...input.observation.subject,
        aliases: [...input.observation.subject.aliases].sort(),
      },
    },
    targets: input.evaluationTargets
      .map(({ claimId, statement }) => ({ claimId, statement }))
      .sort((a, b) => a.claimId.localeCompare(b.claimId)),
  };
}

export function experimentCohorts(snapshot: Evidence, finding: Finding) {
  const groups = new Map<
    string,
    {
      key: string;
      cohort: ExperimentCohort;
      seedRunId: string;
      runCount: number;
    }
  >();
  for (const run of snapshot.runs) {
    const cohort = cohortForRun(run);
    if (!cohort?.targets.some((target) => target.claimId === finding.claimId))
      continue;
    if (
      !validateRunAssessments(run, {
        targetClaimIds: cohort.targets.map((target) => target.claimId),
      }).valid
    )
      continue;
    const key = canonicalJson(cohort),
      existing = groups.get(key);
    if (existing) existing.runCount += 1;
    else groups.set(key, { key, cohort, seedRunId: run.id, runCount: 1 });
  }
  return [...groups.values()];
}

export function tallyRate(tally: ExperimentTally): number | null {
  const denominator = tally.affected + tally.notDetected;
  return denominator ? tally.notDetected / denominator : null;
}

export function actionComparison(action: ActionExperiment) {
  const plan = action.measurementPlan,
    latest = action.evaluations?.at(-1);
  return {
    recorded: Boolean(plan),
    before: plan ? tallyRate(plan.baseline) : action.before.value,
    after: plan
      ? latest
        ? tallyRate(latest.followup)
        : null
      : (action.after?.value ?? null),
  };
}

export function evaluateWindow(
  snapshot: Pick<Evidence, 'runs'>,
  plan: Pick<ExperimentPlan, 'cohort' | 'claimId' | 'kind'>,
  window: ExperimentWindow,
  includedIds?: string[],
): ExperimentTally {
  const tally: ExperimentTally = {
    runIds: [],
    excluded: [],
    affected: 0,
    notDetected: 0,
    unassessed: 0,
  };
  const allowed = includedIds ? new Set(includedIds) : null;
  const candidates = snapshot.runs
    .filter(
      (run) =>
        run.probeId === plan.cohort.probeId &&
        Date.parse(run.executedAt) >= Date.parse(window.startAt) &&
        Date.parse(run.executedAt) <= Date.parse(window.endAt) &&
        (!allowed || allowed.has(run.id)),
    )
    .sort(
      (a, b) =>
        Date.parse(a.executedAt) - Date.parse(b.executedAt) ||
        a.id.localeCompare(b.id),
    );
  for (const run of candidates) {
    const cohort = cohortForRun(run);
    if (!cohort) {
      tally.excluded.push({ runId: run.id, reason: 'missing-input' });
      continue;
    }
    if (canonicalJson(cohort) !== canonicalJson(plan.cohort)) {
      tally.excluded.push({ runId: run.id, reason: 'different-conditions' });
      continue;
    }
    if (
      !validateRunAssessments(run, {
        targetClaimIds: cohort.targets.map((target) => target.claimId),
      }).valid
    ) {
      tally.excluded.push({ runId: run.id, reason: 'invalid-assessments' });
      continue;
    }
    const assessment = run.assessments.find(
      (item) => item.claimId === plan.claimId,
    );
    if (!assessment) {
      tally.excluded.push({ runId: run.id, reason: 'invalid-assessments' });
      continue;
    }
    tally.runIds.push(run.id);
    const verdict = classifyIncident(plan.kind, assessment);
    if (verdict === 'affected') tally.affected += 1;
    else if (verdict === 'not-detected') tally.notDetected += 1;
    else tally.unassessed += 1;
  }
  return tally;
}

function validatePeriods(plan: ExperimentPlan) {
  const b = plan.baselineWindow,
    a = plan.followupWindow;
  if (
    !(
      Date.parse(b.startAt) <= Date.parse(b.endAt) &&
      Date.parse(b.endAt) <= Date.parse(plan.createdAt) &&
      Date.parse(b.endAt) < Date.parse(plan.changedAt) &&
      Date.parse(plan.changedAt) <= Date.parse(a.startAt) &&
      Date.parse(a.startAt) <= Date.parse(a.endAt)
    )
  ) {
    throw new Error(
      '変更前の期間は現在以前にし、変更前の終了 < 変更日時 ≤ 変更後の開始 ≤ 終了にしてください。',
    );
  }
}

export function createExperimentPlan(
  snapshot: Evidence,
  action: ActionExperiment,
  finding: Finding,
  input: ExperimentPlanInput,
  now = new Date().toISOString(),
): ExperimentPlan {
  if (action.measurementPlan)
    throw new Error('固定済みの比較条件は上書きできません。');
  if (action.findingId !== finding.id)
    throw new Error('改善案とFindingの参照が一致しません。');
  if (finding.reviewStatus !== 'confirmed')
    throw new Error('先にFindingを改善対象として確認してください。');
  const seed = snapshot.runs.find((run) => run.id === input.seedRunId);
  const cohort = seed ? cohortForRun(seed) : null;
  if (
    !cohort ||
    !cohort.targets.some((target) => target.claimId === finding.claimId)
  )
    throw new Error(
      '入力Snapshotを持つ対象Claimの回答を選んでください。新しいCampaignか手動取り込みが必要です。',
    );
  const plan: ExperimentPlan = {
    schemaVersion: 'mirror.experiment-plan.v1',
    id: `plan-${crypto.randomUUID()}`,
    createdAt: now,
    claimId: finding.claimId,
    kind: finding.kind,
    cohort,
    baselineWindow: input.baselineWindow,
    baseline: {
      runIds: [],
      excluded: [],
      affected: 0,
      notDetected: 0,
      unassessed: 0,
    },
    changedAt: input.changedAt,
    changeSummary: input.changeSummary.trim(),
    followupWindow: input.followupWindow,
  };
  if (!experimentPlanSchema.safeParse(plan).success)
    throw new Error('期間と変更内容（4〜2,000文字）を確認してください。');
  validatePeriods(plan);
  plan.baseline = evaluateWindow(snapshot, plan, plan.baselineWindow);
  if (tallyRate(plan.baseline) === null)
    throw new Error(
      '変更前に、同じ保存条件で判定可能な回答が1件以上必要です。「古い情報」の自動比較は未対応です。',
    );
  return freezeDeep(structuredClone(plan));
}

export function createExperimentEvaluation(
  snapshot: Evidence,
  plan: ExperimentPlan,
  note: string,
  now = new Date().toISOString(),
): ExperimentEvaluation {
  if (
    !Number.isFinite(Date.parse(now)) ||
    Date.parse(now) < Date.parse(plan.createdAt)
  )
    throw new Error('比較条件を固定した時刻以降に記録してください。');
  if (Date.parse(now) < Date.parse(plan.followupWindow.endAt))
    throw new Error('変更後の観測期間が終了してから記録してください。');
  const followup = evaluateWindow(snapshot, plan, plan.followupWindow);
  if (tallyRate(followup) === null)
    throw new Error(
      '変更後に同じ保存条件で判定可能な回答がありません。観測を追加してください。',
    );
  const result = {
    id: `evaluation-${crypto.randomUUID()}`,
    recordedAt: now,
    note: note.trim(),
    followup,
  };
  if (!experimentEvaluationSchema.safeParse(result).success)
    throw new Error('検証メモを4〜2,000文字で入力してください。');
  return freezeDeep(structuredClone(result));
}

function validateTally(
  snapshot: Evidence,
  plan: ExperimentPlan,
  window: ExperimentWindow,
  tally: ExperimentTally,
) {
  const ids = [...tally.runIds, ...tally.excluded.map((item) => item.runId)];
  if (
    new Set(ids).size !== ids.length ||
    canonicalJson(evaluateWindow(snapshot, plan, window, ids)) !==
      canonicalJson(tally) ||
    tallyRate(tally) === null
  )
    throw new Error('検証記録のRun参照・保存条件・集計値が一致しません。');
}

/** Verify saved cohorts/results without silently recomputing them from later arrivals. */
export function validateExperimentRecords(
  snapshot: Evidence,
  actions: ActionExperiment[],
  findings: Finding[],
) {
  for (const action of actions) {
    const plan = action.measurementPlan,
      results = action.evaluations ?? [];
    if (!plan) {
      if (results.length) throw new Error('比較条件がない検証記録です。');
      continue;
    }
    if (!experimentPlanSchema.safeParse(plan).success)
      throw new Error('検証条件の形式が不正です。');
    const finding = findings.find((item) => item.id === action.findingId);
    if (
      !finding ||
      plan.claimId !== finding.claimId ||
      plan.kind !== finding.kind ||
      !snapshot.probes.some((item) => item.id === plan.cohort.probeId) ||
      !plan.cohort.targets.some((item) => item.claimId === plan.claimId) ||
      plan.cohort.targets.some(
        (target) => !snapshot.claims.some((item) => item.id === target.claimId),
      )
    )
      throw new Error('検証条件の対象参照が不正です。');
    validatePeriods(plan);
    validateTally(snapshot, plan, plan.baselineWindow, plan.baseline);
    if (new Set(results.map((item) => item.id)).size !== results.length)
      throw new Error('検証記録のIDが重複しています。');
    for (const result of results) {
      if (
        !experimentEvaluationSchema.safeParse(result).success ||
        Date.parse(result.recordedAt) <
          Math.max(
            Date.parse(plan.createdAt),
            Date.parse(plan.followupWindow.endAt),
          )
      )
        throw new Error('検証記録の時刻または内容が不正です。');
      validateTally(snapshot, plan, plan.followupWindow, result.followup);
    }
  }
}
