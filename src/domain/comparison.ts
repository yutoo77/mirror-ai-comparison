import type {
  Claim,
  ClaimAssessment,
  EvaluationTargetSnapshot,
  Probe,
  ProbeRun,
  Source,
  SourceSnapshot,
  WorkspaceSnapshot,
} from './model';
import { providerLabels } from './model';
import { resolveSourceVersion } from './sourceHistory';

export type ComparisonDefinitionOrigin = 'captured' | 'current';

export interface ComparisonSource {
  status: 'captured-match' | 'captured-history' | 'changed' | 'current-reference' | 'missing';
  label: string;
  source: Source | null;
  excerpt: string | null;
  expectedHash: string | null;
  version: SourceSnapshot | null;
}

export interface ComparisonCell {
  runId: string;
  state:
    | 'assessed'
    | 'missing-assessment'
    | 'duplicate-assessment'
    | 'not-targeted'
    | 'invalid-target';
  statement: string | null;
  definitionOrigin: ComparisonDefinitionOrigin;
  assessment: ClaimAssessment | null;
  source: ComparisonSource;
  issues: string[];
}

export interface ComparisonRun {
  run: ProbeRun;
  question: string;
  definitionOrigin: ComparisonDefinitionOrigin;
  conditionLabels: string[];
  issues: string[];
}

export interface ComparisonRow {
  claimId: string;
  statement: string;
  currentClaim: Claim | null;
  definitionsDiffer: boolean;
  cells: ComparisonCell[];
}

export interface ComparisonResult {
  probe: Probe | null;
  runs: ComparisonRun[];
  rows: ComparisonRow[];
  notices: string[];
}

export interface ComparisonOptions {
  probeId: string;
  runIds?: string[] | undefined;
  limit?: number | undefined;
}

const originLabels = {
  demo: 'デモ回答',
  manual: '手動取込',
  provider: 'API取得',
} as const;

function missingSource(label = '参照資料なし'): ComparisonSource {
  return {
    status: 'missing',
    label,
    source: null,
    excerpt: null,
    expectedHash: null,
    version: null,
  };
}

function sourceFor(
  snapshot: WorkspaceSnapshot,
  claim: Claim | null,
  target: EvaluationTargetSnapshot | undefined,
  captured: boolean,
): ComparisonSource {
  const sourceId = captured ? target?.sourceId : claim?.sourceId;
  const matches = snapshot.sources.filter((source) => source.id === sourceId);
  const source = matches.length === 1 ? matches[0]! : null;
  const expectedHash = target?.sourceSnapshotHash ?? null;
  if (!source) {
    return {
      ...missingSource(
        matches.length > 1 ? '参照資料IDの重複' : '参照資料なし',
      ),
      expectedHash,
    };
  }
  if (!captured) {
    return {
      status: 'current-reference',
      label: '現行資料を参考表示・観測時の版は未保存',
      source,
      excerpt: source.snapshot.excerpt,
      expectedHash: null,
      version: source.snapshot,
    };
  }
  if (!expectedHash) {
    return {
      ...missingSource('観測時の資料の版を確認できません'),
      source,
    };
  }
  const version = resolveSourceVersion(source, expectedHash);
  if (!version) {
    return {
      status: 'changed',
      label: '更新あり・旧本文未収録',
      source,
      excerpt: null,
      expectedHash,
      version: null,
    };
  }
  return {
    status: source.snapshot.sha256 === expectedHash ? 'captured-match' : 'captured-history',
    label: source.snapshot.sha256 === expectedHash
      ? '保存時と同じ資料の版'
      : '更新あり・保存時の原文を履歴から表示',
    source,
    excerpt: version.excerpt,
    expectedHash,
    version,
  };
}

function targetIdsFor(run: ProbeRun, probe: Probe) {
  return run.inputSnapshot
    ? run.inputSnapshot.evaluationTargets.map((target) => target.claimId)
    : probe.targetClaimIds;
}

function describeRun(run: ProbeRun, probe: Probe): ComparisonRun {
  const input = run.inputSnapshot;
  const issues: string[] = [];
  const targetIds = targetIdsFor(run, probe);
  const uniqueTargets = new Set(targetIds);
  if (uniqueTargets.size !== targetIds.length) {
    issues.push('評価対象IDが重複しています。');
  }
  const assessmentCounts = new Map<string, number>();
  for (const assessment of run.assessments) {
    assessmentCounts.set(
      assessment.claimId,
      (assessmentCounts.get(assessment.claimId) ?? 0) + 1,
    );
  }
  for (const claimId of uniqueTargets) {
    const count = assessmentCounts.get(claimId) ?? 0;
    if (!count) issues.push(`判定未収録: ${claimId}`);
    if (count > 1) issues.push(`保存判定が重複: ${claimId}`);
  }
  for (const claimId of assessmentCounts.keys()) {
    if (!uniqueTargets.has(claimId)) {
      issues.push(`対象外の保存判定: ${claimId}`);
    }
  }
  if (
    input &&
    (input.observation.locale !== run.locale ||
      input.observation.searchEnabled !== run.searchEnabled)
  ) {
    issues.push('保存入力と回答の言語・検索条件が一致していません。');
  }
  if (input && input.observation.question !== probe.question) {
    issues.push('現在の質問とは異なる、観測時の質問を表示しています。');
  }
  return {
    run,
    question: input?.observation.question ?? probe.question,
    definitionOrigin: input ? 'captured' : 'current',
    conditionLabels: [
      providerLabels[run.provider],
      run.model,
      `言語: ${input?.observation.locale ?? run.locale}`,
      (input?.observation.searchEnabled ?? run.searchEnabled)
        ? '検索あり'
        : '検索なし',
      originLabels[run.provenance.origin],
      `評価: ${run.provenance.assessorId}`,
      input ? '観測時の定義を保存' : '現行定義を参照・観測時の定義は未保存',
    ],
    issues,
  };
}

function buildCell(
  snapshot: WorkspaceSnapshot,
  probe: Probe,
  run: ProbeRun,
  claimId: string,
): ComparisonCell {
  const captured = Boolean(run.inputSnapshot);
  const definitionOrigin = captured ? 'captured' : 'current';
  const claims = snapshot.claims.filter((claim) => claim.id === claimId);
  const claim = claims.length === 1 ? claims[0]! : null;
  const targets = run.inputSnapshot?.evaluationTargets.filter(
    (target) => target.claimId === claimId,
  );
  const target = targets?.length === 1 ? targets[0] : undefined;
  const targetCount = captured
    ? (targets?.length ?? 0)
    : probe.targetClaimIds.filter((id) => id === claimId).length;
  if (!targetCount) {
    return {
      runId: run.id,
      state: 'not-targeted',
      statement: null,
      definitionOrigin,
      assessment: null,
      source: missingSource('この回答では評価対象外'),
      issues: [],
    };
  }
  const assessments = run.assessments.filter(
    (item) => item.claimId === claimId,
  );
  const source = sourceFor(snapshot, claim, target, captured);
  const issues: string[] = [];
  if (!claim) {
    issues.push(
      claims.length > 1
        ? '確認項目IDが重複しています。'
        : '現在の確認項目に参照先がありません。',
    );
  }
  if (targetCount > 1)
    issues.push('評価対象IDが重複しているため、定義を特定できません。');
  if (target && claim && target.statement !== claim.statement) {
    issues.push('観測時と現在で確認項目の文章が異なります。');
  }
  if (source.status === 'missing') issues.push(source.label);
  if (source.status === 'changed')
    issues.push('現在の資料本文を、過去の判定の根拠として表示しません。');
  if (source.status === 'captured-history')
    issues.push('原文は保存当時の版です。更新後の資料に対する判定は未実施です。');
  if (claim?.status === 'review-due')
    issues.push('この確認項目は、現在の資料に照らした再確認が必要です。');
  if (assessments.length === 0) issues.push('この確認項目の判定は未収録です。');
  if (assessments.length > 1)
    issues.push('判定が重複しているため、一つの判定を選べません。');
  const state =
    targetCount > 1 || !claim
      ? 'invalid-target'
      : assessments.length > 1
        ? 'duplicate-assessment'
        : assessments.length === 0
          ? 'missing-assessment'
          : 'assessed';
  return {
    runId: run.id,
    state,
    statement: captured
      ? (target?.statement ?? null)
      : (claim?.statement ?? null),
    definitionOrigin,
    assessment: assessments.length === 1 ? assessments[0]! : null,
    source,
    issues,
  };
}

/** A read-only projection of recorded judgments, not a new evaluator or model ranking. */
export function buildComparison(
  snapshot: WorkspaceSnapshot,
  options: ComparisonOptions,
): ComparisonResult {
  const probes = snapshot.probes.filter(
    (probe) => probe.id === options.probeId,
  );
  const probe = probes.length === 1 ? probes[0]! : null;
  if (!probe) {
    return {
      probe: null,
      runs: [],
      rows: [],
      notices: [
        probes.length > 1
          ? '質問IDが重複しています。'
          : '比較する質問が見つかりません。',
      ],
    };
  }
  const notices = [
    '保存された判定を並べています。質問・モデル・検索・評価方法などの違いを含む比較です。',
  ];
  const allMatches = snapshot.runs.filter((run) => run.probeId === probe.id);
  const runIdCounts = new Map<string, number>();
  for (const run of snapshot.runs) {
    runIdCounts.set(run.id, (runIdCounts.get(run.id) ?? 0) + 1);
  }
  const uniqueMatches = allMatches.filter(
    (run) => runIdCounts.get(run.id) === 1,
  );
  if (uniqueMatches.length !== allMatches.length)
    notices.push('IDが重複する回答は比較から除外しました。');
  const requestedIds = options.runIds ? [...new Set(options.runIds)] : null;
  const selected = requestedIds
    ? requestedIds.flatMap((id) => {
        const match = uniqueMatches.find((run) => run.id === id);
        return match ? [match] : [];
      })
    : [...uniqueMatches].sort(
        (left, right) =>
          Date.parse(right.executedAt) - Date.parse(left.executedAt) ||
          left.id.localeCompare(right.id),
      );
  if (requestedIds && requestedIds.length !== selected.length) {
    notices.push(
      '見つからない回答、別の質問の回答、IDが重複する回答は選択に含めません。',
    );
  }
  const limit = Number.isFinite(options.limit)
    ? Math.min(3, Math.max(0, Math.floor(options.limit!)))
    : 3;
  if (selected.length > limit)
    notices.push(`表示する回答を${limit}件に絞っています。`);
  const runs = selected.slice(0, limit).map((run) => describeRun(run, probe));
  const claimIds = [
    ...new Set([
      ...probe.targetClaimIds,
      ...runs.flatMap(({ run }) => targetIdsFor(run, probe)),
    ]),
  ];
  const rows = claimIds.map((claimId): ComparisonRow => {
    const claims = snapshot.claims.filter((claim) => claim.id === claimId);
    const currentClaim = claims.length === 1 ? claims[0]! : null;
    const cells = runs.map(({ run }) =>
      buildCell(snapshot, probe, run, claimId),
    );
    const definitions = cells.flatMap((cell) =>
      cell.statement === null ? [] : [cell.statement],
    );
    if (currentClaim) definitions.push(currentClaim.statement);
    return {
      claimId,
      statement:
        currentClaim?.statement ?? definitions[0] ?? `確認項目 ${claimId}`,
      currentClaim,
      definitionsDiffer: new Set(definitions).size > 1,
      cells,
    };
  });
  return { probe, runs, rows, notices };
}
