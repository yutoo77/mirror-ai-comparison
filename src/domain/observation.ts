import type {
  ClaimAssessment,
  Finding,
  FindingKind,
  Probe,
  ProbeRun,
  RiskLevel,
  WorkspaceSnapshot,
} from './model';
import { resolveSourceVersion } from './sourceHistory';

export interface AssessmentTargetValidation {
  valid: boolean;
  missingClaimIds: string[];
  unexpectedClaimIds: string[];
  duplicateClaimIds: string[];
}

type FindingWorkspace = Pick<
  WorkspaceSnapshot,
  'claims' | 'sources' | 'probes' | 'runs' | 'findings'
>;

interface IssueOccurrence {
  assessment: ClaimAssessment;
  run: ProbeRun;
}

const severityByKind: Record<Exclude<FindingKind, 'outdated'>, RiskLevel> = {
  omission: 'medium',
  contradiction: 'high',
  misattribution: 'high',
  'weak-evidence': 'low',
};

const weakEvidenceStates = new Set<ClaimAssessment['evidence']>([
  'none',
  'reported-url',
  'fetched',
]);

function findingKey(claimId: string, kind: FindingKind): string {
  return `${claimId}\u0000${kind}`;
}

export function findingIdFor(claimId: string, kind: Exclude<FindingKind, 'outdated'>): string {
  return `finding-${claimId}-${kind}`;
}

/**
 * A run is only comparable when it assesses every explicitly targeted Claim once,
 * and contains no assessment for a Claim outside that target set.
 */
export function validateRunAssessments(
  run: Pick<ProbeRun, 'assessments'>,
  probe: Pick<Probe, 'targetClaimIds'>,
): AssessmentTargetValidation {
  const targetIds = new Set(probe.targetClaimIds);
  const counts = new Map<string, number>();

  for (const assessment of run.assessments) {
    counts.set(assessment.claimId, (counts.get(assessment.claimId) ?? 0) + 1);
  }

  const missingClaimIds = probe.targetClaimIds.filter((claimId) => !counts.has(claimId));
  const unexpectedClaimIds = Array.from(counts.keys())
    .filter((claimId) => !targetIds.has(claimId))
    .sort();
  const duplicateClaimIds = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([claimId]) => claimId)
    .sort();

  return {
    valid:
      missingClaimIds.length === 0 &&
      unexpectedClaimIds.length === 0 &&
      duplicateClaimIds.length === 0,
    missingClaimIds,
    unexpectedClaimIds,
    duplicateClaimIds,
  };
}

function issueKinds(assessment: ClaimAssessment): Exclude<FindingKind, 'outdated'>[] {
  const kinds = new Set<Exclude<FindingKind, 'outdated'>>();

  if (assessment.visibility === 'omitted') kinds.add('omission');
  if (assessment.factuality === 'contradicted') kinds.add('contradiction');
  if (assessment.attribution === 'misattributed') kinds.add('misattribution');

  // An omitted Claim cannot have answer-side support. Treat weak evidence as a
  // separate issue only when the Claim was actually mentioned.
  if (
    assessment.visibility === 'mentioned' &&
    (assessment.factuality === 'unsupported' || weakEvidenceStates.has(assessment.evidence))
  ) {
    kinds.add('weak-evidence');
  }

  return Array.from(kinds);
}

function shortClaim(statement: string): string {
  return statement.length <= 44 ? statement : `${statement.slice(0, 43)}…`;
}

function copyForKind(kind: Exclude<FindingKind, 'outdated'>, statement: string) {
  const claim = `「${shortClaim(statement)}」`;
  switch (kind) {
    case 'omission':
      return {
        title: `${claim}がAI回答で欠落`,
        summary: 'この質問で明示的に評価した公式Claimが、観測したAI回答へ反映されていません。',
      };
    case 'contradiction':
      return {
        title: `${claim}と矛盾する回答`,
        summary: '観測したAI回答が、承認済みの公式Claimと事実上矛盾しています。',
      };
    case 'misattribution':
      return {
        title: `${claim}の帰属に誤り`,
        summary: '内容の主体または対象が、公式Claimとは異なる対象へ帰属されています。',
      };
    case 'weak-evidence':
      return {
        title: `${claim}を支える根拠が弱い`,
        summary: 'Claimは言及されていますが、回答内容を支える公式原文との対応を確認できません。',
      };
  }
}

function compareOccurrences(left: IssueOccurrence, right: IssueOccurrence): number {
  const byTime = left.run.executedAt.localeCompare(right.run.executedAt);
  return byTime !== 0 ? byTime : left.run.id.localeCompare(right.run.id);
}

/**
 * Projects run-level assessments into aggregate Findings. Existing Findings are
 * merged by Claim + kind so a human review decision is never replaced by a new
 * observation. Existing findings not derivable from the current run window
 * (including manually established `outdated` findings) are retained unchanged.
 */
export function deriveFindingsFromRuns(workspace: FindingWorkspace): Finding[] {
  const probeById = new Map(workspace.probes.map((probe) => [probe.id, probe]));
  const claimById = new Map(workspace.claims.map((claim) => [claim.id, claim]));
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const eligibleRunCountByClaim = new Map<string, number>();
  const occurrencesByKey = new Map<string, IssueOccurrence[]>();

  for (const run of workspace.runs) {
    const probe = probeById.get(run.probeId);
    if (!probe) {
      throw new Error(`Run ${run.id} references unknown Probe ${run.probeId}.`);
    }

    const validation = validateRunAssessments(run, probe);
    if (!validation.valid) {
      throw new Error(
        `Run ${run.id} does not assess exactly its target Claims ` +
          `(missing: ${validation.missingClaimIds.join(', ') || 'none'}; ` +
          `unexpected: ${validation.unexpectedClaimIds.join(', ') || 'none'}; ` +
          `duplicates: ${validation.duplicateClaimIds.join(', ') || 'none'}).`,
      );
    }

    for (const claimId of probe.targetClaimIds) {
      eligibleRunCountByClaim.set(claimId, (eligibleRunCountByClaim.get(claimId) ?? 0) + 1);
    }

    for (const assessment of run.assessments) {
      for (const kind of issueKinds(assessment)) {
        const key = findingKey(assessment.claimId, kind);
        const occurrences = occurrencesByKey.get(key) ?? [];
        occurrences.push({ assessment, run });
        occurrencesByKey.set(key, occurrences);
      }
    }
  }

  // Deduplicate legacy/current records by the same aggregate identity while
  // retaining the first record's stable id and human-owned fields.
  const existingByKey = new Map<string, Finding>();
  const existingOrder: string[] = [];
  for (const finding of workspace.findings) {
    const key = findingKey(finding.claimId, finding.kind);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, finding);
      existingOrder.push(key);
    }
  }

  const mergedByKey = new Map(existingByKey);
  const newKeys: string[] = [];

  for (const [key, occurrences] of occurrencesByKey) {
    const ordered = [...occurrences].sort(compareOccurrences);
    const first = ordered[0];
    const latest = ordered.at(-1);
    if (!first || !latest) continue;

    const claim = claimById.get(latest.assessment.claimId);
    if (!claim) {
      throw new Error(`Assessment references unknown Claim ${latest.assessment.claimId}.`);
    }
    const source = sourceById.get(claim.sourceId);
    if (!source) {
      throw new Error(`Claim ${claim.id} references unknown Source ${claim.sourceId}.`);
    }

    const kind = key.slice(key.indexOf('\u0000') + 1) as Exclude<FindingKind, 'outdated'>;
    const existing = existingByKey.get(key);
    const eligibleRunCount = eligibleRunCountByClaim.get(claim.id) ?? 0;
    const occurrenceRate = eligibleRunCount === 0 ? 0 : occurrences.length / eligibleRunCount;
    const copy = copyForKind(kind, claim.statement);
    const probeIds = Array.from(new Set(occurrences.map(({ run }) => run.probeId))).sort();
    const providers = Array.from(new Set(occurrences.map(({ run }) => run.provider))).sort();
    const target = latest.run.inputSnapshot?.evaluationTargets.find((item) => item.claimId === claim.id);
    const capturedSource = target ? sourceById.get(target.sourceId) : source;
    const capturedVersion = target
      ? (capturedSource ? resolveSourceVersion(capturedSource, target.sourceSnapshotHash) : null)
      : source.history?.length ? null : source.snapshot;
    const sameSavedObservation = existing &&
      existing.evidence.observed.executedAt === latest.run.executedAt &&
      existing.evidence.observed.provider === latest.run.provider &&
      existing.evidence.observed.model === latest.run.model &&
      existing.evidence.observed.excerpt === (latest.assessment.observedExcerpt?.trim() || latest.run.answer);
    const official = sameSavedObservation ? existing.evidence.official : {
      claimId: claim.id,
      statement: target?.statement ?? claim.statement,
      excerpt: capturedVersion?.excerpt ?? '',
      sourceTitle: capturedSource?.title ?? '観測時の参照資料なし',
      sourceUrl: capturedSource?.url ?? source.url,
      capturedAt: capturedVersion?.capturedAt ?? null,
    };

    const finding: Finding = {
      id: existing?.id ?? findingIdFor(claim.id, kind),
      title: existing?.title ?? copy.title,
      summary: existing?.summary ?? copy.summary,
      kind,
      severity: existing?.severity ?? severityByKind[kind],
      status: existing?.status ?? 'open',
      reviewStatus: existing?.reviewStatus ?? 'unreviewed',
      reviewHistory: existing?.reviewHistory,
      claimId: claim.id,
      probeIds,
      providers,
      occurrenceRate,
      previousOccurrenceRate: existing?.occurrenceRate ?? 0,
      runCount: eligibleRunCount,
      firstSeenAt:
        existing && existing.firstSeenAt < first.run.executedAt
          ? existing.firstSeenAt
          : first.run.executedAt,
      lastSeenAt: latest.run.executedAt,
      evidence: {
        evidenceState: latest.assessment.evidence,
        official,
        observed: {
          excerpt: latest.assessment.observedExcerpt?.trim() || latest.run.answer,
          provider: latest.run.provider,
          model: latest.run.model,
          executedAt: latest.run.executedAt,
          citationUrl:
            latest.assessment.citationUrl?.trim() || latest.run.citationUrls[0] || null,
        },
        rationale: latest.assessment.rationale,
        confidence: latest.assessment.confidence,
      },
    };

    mergedByKey.set(key, finding);
    if (!existing) newKeys.push(key);
  }

  return [
    ...existingOrder.flatMap((key) => {
      const finding = mergedByKey.get(key);
      return finding ? [finding] : [];
    }),
    ...newKeys.sort().flatMap((key) => {
      const finding = mergedByKey.get(key);
      return finding ? [finding] : [];
    }),
  ];
}
