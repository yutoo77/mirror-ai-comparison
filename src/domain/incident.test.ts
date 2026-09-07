import { describe, expect, it } from 'vitest';
import { demoWorkspaces } from '../data/demoWorkspaces';
import { buildIncident, classifyIncident } from './incident';
import type { ClaimAssessment } from './model';
import { deriveFindingsFromRuns } from './observation';

const base: ClaimAssessment = {
  claimId: 'c1',
  visibility: 'mentioned',
  factuality: 'accurate',
  attribution: 'correct',
  evidence: 'passage-match',
  confidence: 0.9,
  rationale: '保存判定',
};

describe('incident evidence projection', () => {
  it('does not mix different issue kinds in a provider numerator', () => {
    const contradicted = { ...base, factuality: 'contradicted' as const };
    expect(classifyIncident('omission', contradicted)).toBe('not-detected');
    expect(classifyIncident('contradiction', contradicted)).toBe('affected');
    expect(classifyIncident('misattribution', contradicted)).toBe(
      'not-detected',
    );
  });

  it('does not count unsupported or unassessed answers as contradiction-free', () => {
    expect(
      classifyIncident('contradiction', { ...base, factuality: 'unsupported' }),
    ).toBe('unassessed');
    expect(
      classifyIncident('contradiction', {
        ...base,
        factuality: 'not-assessed',
      }),
    ).toBe('unassessed');
    expect(
      classifyIncident('misattribution', { ...base, attribution: 'ambiguous' }),
    ).toBe('unassessed');
  });

  it('requires mention for evidence assessment and never infers temporal validity', () => {
    for (const evidence of ['none', 'reported-url', 'fetched'] as const) {
      expect(classifyIncident('weak-evidence', { ...base, evidence })).toBe(
        'affected',
      );
    }
    expect(
      classifyIncident('weak-evidence', { ...base, visibility: 'omitted' }),
    ).toBe('unassessed');
    expect(classifyIncident('weak-evidence', base)).toBe('not-detected');
    expect(classifyIncident('outdated', base)).toBe('unassessed');
  });

  it('includes non-affected probes targeting the claim and excludes invalid target sets', () => {
    const workspace = structuredClone(demoWorkspaces[0]!);
    const finding = {
      ...workspace.findings[0]!,
      claimId: 'c1',
      kind: 'omission' as const,
      probeIds: ['affected-probe'],
    };
    const templateProbe = workspace.probes[0]!;
    const templateRun = workspace.runs[0]!;
    workspace.probes = ['affected-probe', 'healthy-probe'].map((id) => ({
      ...templateProbe,
      id,
      targetClaimIds: ['c1'],
    }));
    workspace.runs = [
      {
        ...templateRun,
        id: 'affected',
        probeId: 'affected-probe',
        assessments: [{ ...base, visibility: 'omitted' }],
      },
      {
        ...templateRun,
        id: 'healthy',
        probeId: 'healthy-probe',
        assessments: [base],
      },
      {
        ...templateRun,
        id: 'unknown',
        probeId: 'healthy-probe',
        assessments: [{ ...base, visibility: 'not-applicable' }],
      },
      {
        ...templateRun,
        id: 'missing',
        probeId: 'healthy-probe',
        assessments: [],
      },
      {
        ...templateRun,
        id: 'duplicate',
        probeId: 'healthy-probe',
        assessments: [base, base],
      },
      {
        ...templateRun,
        id: 'orphan',
        probeId: 'unknown-probe',
        assessments: [base],
      },
    ];
    const incident = buildIncident(workspace, finding);
    expect(incident).toMatchObject({
      affected: 1,
      evaluable: 2,
      rate: 0.5,
      unassessed: 1,
      excluded: 3,
    });
    expect(incident.providers[0]).toMatchObject({ affected: 1, evaluable: 2 });
  });

  it('shows null rather than zero for an empty denominator', () => {
    expect(
      buildIncident({ probes: [], runs: [] }, demoWorkspaces[0]!.findings[0]!),
    ).toMatchObject({ rate: null, evaluable: 0 });
  });

  it('preserves human review history when observations are reprojected', () => {
    const workspace = structuredClone(demoWorkspaces[0]!);
    // Legacy fixture runs intentionally contain incomplete targets; use a valid record for this invariant.
    const probe = workspace.probes[0]!;
    const claimId = probe.targetClaimIds[0]!;
    const existing = workspace.findings.find(
      (item) => item.claimId === claimId && item.kind === 'omission',
    ) ?? { ...workspace.findings[0]!, claimId, kind: 'omission' as const };
    existing.reviewHistory = [
      {
        id: 'r1',
        status: 'confirmed',
        note: '元回答と原文を比較した。',
        at: '2026-09-04T00:00:00.000Z',
      },
    ];
    workspace.findings = [existing];
    workspace.runs = [
      {
        ...workspace.runs[0]!,
        probeId: probe.id,
        assessments: probe.targetClaimIds.map((id) => ({
          ...base,
          claimId: id,
          visibility: 'omitted' as const,
        })),
      },
    ];
    const result = deriveFindingsFromRuns(workspace).find(
      (item) => item.id === existing.id,
    );
    expect(result?.reviewHistory).toEqual(existing.reviewHistory);
  });
});
