import { describe, expect, it } from 'vitest';
import type { ClaimAssessment, Probe, ProbeRun } from './model';
import { aggregateCampaignMetrics, calculateRunMetrics } from './metrics';

const probe: Probe = {
  id: 'probe-1',
  question: '対象について教えてください',
  audience: '検討者',
  intent: '比較',
  providers: ['chatgpt'],
  repetitions: 1,
  locale: 'ja-JP',
  status: 'active',
  targetClaimIds: ['claim-1', 'claim-2', 'claim-3'],
  lastRunAt: null,
  nextRunAt: null,
};

const assessment = (
  claimId: string,
  visibility: ClaimAssessment['visibility'],
): ClaimAssessment => ({
  claimId,
  visibility,
  factuality: visibility === 'mentioned' ? 'accurate' : 'not-assessed',
  attribution: visibility === 'mentioned' ? 'correct' : 'not-applicable',
  evidence: visibility === 'mentioned' ? 'passage-match' : 'none',
  confidence: 0.9,
  rationale: 'fixture',
});

const run = (assessments: ClaimAssessment[]): ProbeRun => ({
  id: 'run-1',
  probeId: probe.id,
  provider: 'chatgpt',
  model: 'fixture-model',
  repeatIndex: 0,
  executedAt: '2026-08-30T08:00:00.000Z',
  locale: 'ja-JP',
  searchEnabled: true,
  answer: 'fixture answer',
  citationUrls: [],
  assessments,
  provenance: {
    origin: 'demo',
    schemaVersion: 'mirror.run.v1',
    assessorId: 'fixture-v1',
    recordedAt: '2026-09-01T00:00:00.000Z',
    recordedBy: 'fixture',
    artifactHash: 'fixture-run-1',
    campaignId: null,
  },
});

describe('calculateRunMetrics', () => {
  it('uses only explicitly targeted claims as the coverage denominator', () => {
    const targetAssessments = [
      assessment('claim-1', 'mentioned'),
      assessment('claim-2', 'mentioned'),
      assessment('claim-3', 'omitted'),
    ];
    const unrelatedAssessments = Array.from({ length: 12 }, (_, index) =>
      assessment(`unrelated-${index + 1}`, 'omitted'),
    );

    const result = calculateRunMetrics(
      run([...targetAssessments, ...unrelatedAssessments]),
      probe,
    );

    expect(result.claimRecall).toEqual({
      numerator: 2,
      denominator: 3,
      ratio: 2 / 3,
    });
  });

  it('keeps evidence and factuality as separate dimensions', () => {
    const result = calculateRunMetrics(
      run([
        assessment('claim-1', 'mentioned'),
        {
          ...assessment('claim-2', 'mentioned'),
          factuality: 'contradicted',
          evidence: 'reported-url',
        },
        assessment('claim-3', 'omitted'),
      ]),
      probe,
    );

    expect(result.factualAccuracy.ratio).toBe(0.5);
    expect(result.evidenceSupport.ratio).toBe(0.5);
  });
});

describe('aggregateCampaignMetrics', () => {
  it('does not claim stability for a single run', () => {
    const result = aggregateCampaignMetrics(
      [run([assessment('claim-1', 'mentioned')])],
      [probe],
    );

    expect(result.stability).toBeNull();
  });
});
