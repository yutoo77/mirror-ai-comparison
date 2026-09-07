import { demoWorkspaces } from '../data/demoWorkspaces';
import type { ProbeRun } from '../domain/model';
import type { ExperimentPlanInput } from '../domain/experiments';

export const experimentInput: ExperimentPlanInput = {
  seedRunId: 'before',
  baselineWindow: {
    startAt: '2026-09-01T00:00:00.000Z',
    endAt: '2026-09-01T23:00:00.000Z',
  },
  changedAt: '2026-09-02T00:00:00.000Z',
  changeSummary: '公式ページに適用条件を明記する',
  followupWindow: {
    startAt: '2026-09-03T00:00:00.000Z',
    endAt: '2026-09-03T23:00:00.000Z',
  },
};

/** Independent test captures; does not upgrade legacy fixture Runs in the app. */
export function experimentFixture() {
  const snapshot = structuredClone(demoWorkspaces[0]!);
  const finding = snapshot.findings.find((item) => item.id === 'aster-f2')!;
  const action = snapshot.actions.find(
    (item) => item.findingId === finding.id,
  )!;
  const probe = snapshot.probes.find(
    (item) => item.id === finding.probeIds[0],
  )!;
  const base = snapshot.runs.find((item) => item.probeId === probe.id)!;
  const capture = (id: string, executedAt: string): ProbeRun => ({
    ...structuredClone(base),
    id,
    executedAt,
    provenance: {
      ...base.provenance,
      campaignId: null,
      artifactHash: `hash-${id}`,
      recordedAt: executedAt,
    },
    inputSnapshot: {
      observation: {
        subject: {
          displayName: snapshot.workspace.subject.displayName,
          canonicalDomain: snapshot.workspace.subject.canonicalDomain,
          aliases: [...snapshot.workspace.subject.aliases],
        },
        question: probe.question,
        locale: base.locale,
        searchEnabled: base.searchEnabled,
      },
      evaluationTargets: probe.targetClaimIds.map((claimId) => {
        const claim = snapshot.claims.find((item) => item.id === claimId)!;
        const source = snapshot.sources.find(
          (item) => item.id === claim.sourceId,
        )!;
        return {
          claimId,
          statement: claim.statement,
          sourceId: source.id,
          sourceSnapshotHash: source.snapshot.sha256,
        };
      }),
    },
  });
  const before = capture('before', '2026-09-01T01:00:00.000Z');
  const after = capture('after', '2026-09-03T01:00:00.000Z');
  before.assessments.find(
    (item) => item.claimId === finding.claimId,
  )!.factuality = 'contradicted';
  after.assessments.find(
    (item) => item.claimId === finding.claimId,
  )!.factuality = 'accurate';
  snapshot.runs = [
    before,
    after,
    {
      ...capture('different', '2026-09-03T02:00:00.000Z'),
      model: 'another-model',
    },
  ];
  return { snapshot, finding, action, before, after };
}
