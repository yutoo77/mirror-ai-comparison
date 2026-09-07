import type {
  ClaimAssessment,
  Finding,
  FindingKind,
  Probe,
  ProbeRun,
  WorkspaceSnapshot,
} from './model';
import { validateRunAssessments } from './observation';

export type ObservationVerdict =
  | 'affected'
  | 'not-detected'
  | 'unassessed'
  | 'excluded';

export const verdictLabels: Record<ObservationVerdict, string> = {
  affected: 'この問題を検出',
  'not-detected': 'この問題は非検出',
  unassessed: '判定できない',
  excluded: '集計から除外',
};

export interface IncidentObservation {
  run: ProbeRun;
  probe: Probe | undefined;
  assessment: ClaimAssessment | undefined;
  verdict: ObservationVerdict;
}

/** Replay stored assessments only. Non-detection does not mean the whole answer is correct. */
export function classifyIncident(
  kind: FindingKind,
  assessment: ClaimAssessment,
): ObservationVerdict {
  switch (kind) {
    case 'omission':
      return assessment.visibility === 'omitted'
        ? 'affected'
        : assessment.visibility === 'mentioned'
          ? 'not-detected'
          : 'unassessed';
    case 'contradiction':
      return assessment.factuality === 'contradicted'
        ? 'affected'
        : ['accurate', 'partial'].includes(assessment.factuality)
          ? 'not-detected'
          : 'unassessed';
    case 'misattribution':
      return assessment.attribution === 'misattributed'
        ? 'affected'
        : assessment.attribution === 'correct'
          ? 'not-detected'
          : 'unassessed';
    case 'weak-evidence':
      if (assessment.visibility !== 'mentioned') return 'unassessed';
      return assessment.factuality === 'unsupported' ||
        ['none', 'reported-url', 'fetched'].includes(assessment.evidence)
        ? 'affected'
        : 'not-detected';
    case 'outdated':
      // The assessment contract has no temporal-validity dimension.
      return 'unassessed';
  }
}

export function summarizeObservations(observations: IncidentObservation[]) {
  const affected = observations.filter(
    (row) => row.verdict === 'affected',
  ).length;
  const evaluable = observations.filter((row) =>
    ['affected', 'not-detected'].includes(row.verdict),
  ).length;
  return {
    affected,
    evaluable,
    rate: evaluable ? affected / evaluable : null,
    unassessed: observations.filter((row) => row.verdict === 'unassessed')
      .length,
    excluded: observations.filter((row) => row.verdict === 'excluded').length,
  };
}

export function buildIncident(
  workspace: Pick<WorkspaceSnapshot, 'runs' | 'probes'>,
  finding: Finding,
) {
  const probes = new Map(workspace.probes.map((probe) => [probe.id, probe]));
  const observations: IncidentObservation[] = workspace.runs
    .flatMap((run) => {
      const probe = probes.get(run.probeId);
      const assessment = run.assessments.find(
        (item) => item.claimId === finding.claimId,
      );
      if (!probe?.targetClaimIds.includes(finding.claimId) && !assessment)
        return [];
      const valid =
        probe &&
        probe.targetClaimIds.includes(finding.claimId) &&
        validateRunAssessments(run, probe).valid;
      return [
        {
          run,
          probe,
          assessment,
          verdict:
            valid && assessment
              ? classifyIncident(finding.kind, assessment)
              : 'excluded',
        },
      ];
    })
    .sort(
      (left, right) =>
        Date.parse(right.run.executedAt) - Date.parse(left.run.executedAt) ||
        left.run.id.localeCompare(right.run.id),
    );
  const providers = [
    ...new Set(observations.map((row) => row.run.provider)),
  ].map((provider) => ({
    provider,
    ...summarizeObservations(
      observations.filter((row) => row.run.provider === provider),
    ),
  }));
  return { observations, providers, ...summarizeObservations(observations) };
}
