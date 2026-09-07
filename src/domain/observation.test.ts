import { describe, expect, it } from 'vitest';
import type {
  Claim,
  ClaimAssessment,
  Finding,
  Probe,
  ProbeRun,
  Source,
  WorkspaceSnapshot,
} from './model';
import { deriveFindingsFromRuns, findingIdFor, validateRunAssessments } from './observation';
import { demoWorkspaces } from '../data/demoWorkspaces';

const source: Source = {
  id: 'source-1',
  title: 'Official product guide',
  url: 'https://northstar.example/product',
  type: 'web',
  status: 'current',
  owner: 'Product marketing',
  claimIds: ['claim-1', 'claim-2'],
  snapshot: {
    capturedAt: '2026-09-01T00:00:00.000Z',
    excerpt: 'All plans include onboarding. Customer data stays in Japan.',
    sha256: 'fixture-hash',
    parserVersion: 'test-v1',
  },
};

const claims: Claim[] = [
  {
    id: 'claim-1',
    statement: 'All plans include onboarding.',
    category: 'Plan',
    sourceId: source.id,
    status: 'verified',
    owner: 'Product marketing',
    reviewedAt: '2026-09-01T00:00:00.000Z',
    validFrom: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'claim-2',
    statement: 'Customer data stays in Japan.',
    category: 'Security',
    sourceId: source.id,
    status: 'verified',
    owner: 'Security',
    reviewedAt: '2026-09-01T00:00:00.000Z',
    validFrom: '2026-09-01T00:00:00.000Z',
  },
];

const probe: Probe = {
  id: 'probe-1',
  question: 'What should a buyer know?',
  audience: 'Buyer',
  intent: 'Comparison',
  providers: ['chatgpt'],
  repetitions: 1,
  locale: 'en-US',
  status: 'active',
  targetClaimIds: ['claim-1', 'claim-2'],
  lastRunAt: null,
  nextRunAt: null,
};

function assessment(
  claimId: string,
  overrides: Partial<ClaimAssessment> = {},
): ClaimAssessment {
  return {
    claimId,
    visibility: 'mentioned',
    factuality: 'accurate',
    attribution: 'correct',
    evidence: 'passage-match',
    confidence: 0.9,
    rationale: 'Compared with the official source.',
    ...overrides,
  };
}

function run(
  id: string,
  executedAt: string,
  assessments: ClaimAssessment[],
): ProbeRun {
  return {
    id,
    probeId: probe.id,
    provider: 'chatgpt',
    model: 'test-model',
    repeatIndex: 0,
    executedAt,
    locale: 'en-US',
    searchEnabled: true,
    answer: `Answer from ${id}`,
    citationUrls: ['https://northstar.example/product'],
    assessments,
    provenance: {
      origin: 'manual',
      schemaVersion: 'mirror.run.v1',
      assessorId: 'human-manual-v1',
      recordedAt: executedAt,
      recordedBy: 'human',
      artifactHash: `hash-${id}`,
      campaignId: null,
    },
  };
}

function workspace(runs: ProbeRun[], findings: Finding[] = []): WorkspaceSnapshot {
  return {
    workspace: {
      id: 'workspace-1',
      name: 'Northstar',
      subject: {
        type: 'product',
        displayName: 'Northstar',
        canonicalDomain: 'northstar.example',
        industry: 'Software',
        aliases: [],
        locales: ['en-US'],
      },
      objective: 'product',
      isDemo: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      lastMeasuredAt: null,
    },
    claims,
    sources: [source],
    probes: [probe],
    runs,
    campaigns: [],
    findings,
    actions: [],
    trend: [],
    activity: [],
  };
}

describe('validateRunAssessments', () => {
  it('rejects missing, unexpected, and duplicate Claim assessments', () => {
    const result = validateRunAssessments(
      {
        assessments: [
          assessment('claim-1'),
          assessment('claim-1'),
          assessment('claim-outside'),
        ],
      },
      probe,
    );

    expect(result).toEqual({
      valid: false,
      missingClaimIds: ['claim-2'],
      unexpectedClaimIds: ['claim-outside'],
      duplicateClaimIds: ['claim-1'],
    });
  });

  it('accepts exactly one assessment for every target Claim regardless of order', () => {
    expect(
      validateRunAssessments(
        { assessments: [assessment('claim-2'), assessment('claim-1')] },
        probe,
      ).valid,
    ).toBe(true);
  });
});

describe('deriveFindingsFromRuns', () => {
  it('can aggregate every bundled demo run without target leakage', () => {
    for (const snapshot of demoWorkspaces) {
      expect(() => deriveFindingsFromRuns(snapshot)).not.toThrow();
    }
  });

  it('maps omissions and contradictions without inferring outdated', () => {
    const findings = deriveFindingsFromRuns(
      workspace([
        run('run-1', '2026-09-02T00:00:00.000Z', [
          assessment('claim-1', {
            visibility: 'omitted',
            factuality: 'not-assessed',
            attribution: 'not-applicable',
            evidence: 'none',
          }),
          assessment('claim-2', {
            factuality: 'contradicted',
            observedExcerpt: 'Data may be hosted outside Japan.',
          }),
        ]),
      ]),
    );

    expect(findings.map(({ kind }) => kind).sort()).toEqual(['contradiction', 'omission']);
    expect(findings.some(({ kind }) => kind === 'outdated')).toBe(false);
    expect(findings.find(({ kind }) => kind === 'omission')?.id).toBe(
      findingIdFor('claim-1', 'omission'),
    );
    expect(findings.find(({ kind }) => kind === 'contradiction')?.evidence).toMatchObject({
      official: {
        statement: 'Customer data stays in Japan.',
        sourceTitle: 'Official product guide',
      },
      observed: { excerpt: 'Data may be hosted outside Japan.' },
    });
  });

  it('deduplicates by Claim and kind, recalculates occurrence, and preserves human state', () => {
    const existing: Finding = {
      id: 'reviewed-finding-id',
      title: 'Curated finding title',
      summary: 'A reviewer curated this summary.',
      kind: 'omission',
      severity: 'critical',
      status: 'monitoring',
      reviewStatus: 'confirmed',
      claimId: 'claim-1',
      probeIds: ['probe-1'],
      providers: ['chatgpt'],
      occurrenceRate: 1,
      previousOccurrenceRate: 0.5,
      runCount: 1,
      firstSeenAt: '2026-08-01T00:00:00.000Z',
      lastSeenAt: '2026-08-01T00:00:00.000Z',
      evidence: {
        evidenceState: 'none',
        official: {
          claimId: 'claim-1',
          statement: claims[0]?.statement ?? '',
          excerpt: source.snapshot.excerpt,
          sourceTitle: source.title,
          sourceUrl: source.url,
          capturedAt: source.snapshot.capturedAt,
        },
        observed: {
          excerpt: 'Old answer',
          provider: 'chatgpt',
          model: 'old-model',
          executedAt: '2026-08-01T00:00:00.000Z',
          citationUrl: null,
        },
        rationale: 'Previously reviewed.',
        confidence: 0.8,
      },
    };
    const omitted = assessment('claim-1', {
      visibility: 'omitted',
      factuality: 'not-assessed',
      attribution: 'not-applicable',
      evidence: 'none',
    });
    const findings = deriveFindingsFromRuns(
      workspace(
        [
          run('run-1', '2026-09-02T00:00:00.000Z', [omitted, assessment('claim-2')]),
          run('run-2', '2026-09-03T00:00:00.000Z', [assessment('claim-1'), assessment('claim-2')]),
          run('run-3', '2026-09-04T00:00:00.000Z', [omitted, assessment('claim-2')]),
        ],
        [existing, { ...existing, id: 'legacy-duplicate' }],
      ),
    );

    const omissionFindings = findings.filter(
      ({ claimId, kind }) => claimId === 'claim-1' && kind === 'omission',
    );
    expect(omissionFindings).toHaveLength(1);
    expect(omissionFindings[0]).toMatchObject({
      id: 'reviewed-finding-id',
      title: 'Curated finding title',
      severity: 'critical',
      status: 'monitoring',
      reviewStatus: 'confirmed',
      occurrenceRate: 2 / 3,
      previousOccurrenceRate: 1,
      runCount: 3,
      firstSeenAt: '2026-08-01T00:00:00.000Z',
      lastSeenAt: '2026-09-04T00:00:00.000Z',
    });
  });
});
