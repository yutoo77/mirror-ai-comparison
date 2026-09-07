import { describe, expect, it } from 'vitest';
import type {
  ClaimAssessment,
  MeasurementJobSnapshot,
  ProviderId,
  WorkspaceSnapshot,
} from '../domain/model';
import type {
  AnswerAssessor,
  ProviderAdapter,
  ProviderObservationRequest,
  ProviderObservationResponse,
} from './contracts';
import { DeterministicDemoAdapter } from './demoAdapter';
import { RuleBasedDemoAssessor } from './demoAssessor';
import { executeCampaign } from './executeCampaign';
import type { CampaignPlanError } from './planCampaign';
import { MAX_CAMPAIGN_JOBS, planCampaign } from './planCampaign';

function workspace(input?: {
  providers?: ProviderId[];
  repetitions?: number;
  targetClaimIds?: string[];
}): WorkspaceSnapshot {
  return {
    workspace: {
      id: 'workspace-1',
      name: 'Fixture workspace',
      subject: {
        type: 'organization',
        displayName: 'Northstar Studio',
        canonicalDomain: 'northstar.example',
        industry: 'Design software',
        aliases: ['Northstar'],
        locales: ['ja-JP'],
      },
      objective: 'product',
      isDemo: true,
      createdAt: '2026-09-03T00:00:00.000Z',
      lastMeasuredAt: null,
    },
    claims: [
      {
        id: 'claim-1',
        statement: 'Northstar Studioは共同編集機能を提供する。',
        category: 'Product',
        sourceId: 'source-1',
        status: 'verified',
        owner: 'Product',
        reviewedAt: '2026-09-03T00:00:00.000Z',
        validFrom: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'claim-2',
        statement: 'Northstar Studioは日本語に対応している。',
        category: 'Locale',
        sourceId: 'source-1',
        status: 'verified',
        owner: 'Product',
        reviewedAt: '2026-09-03T00:00:00.000Z',
        validFrom: '2026-09-01T00:00:00.000Z',
      },
    ],
    sources: [
      {
        id: 'source-1',
        title: 'Product guide',
        url: 'https://northstar.example/product',
        type: 'web',
        status: 'current',
        owner: 'Product',
        claimIds: ['claim-1', 'claim-2'],
        snapshot: {
          capturedAt: '2026-09-03T00:00:00.000Z',
          excerpt: 'Fixture excerpt',
          sha256: 'fixture-source-sha256',
          parserVersion: 'fixture-v1',
        },
      },
    ],
    probes: [
      {
        id: 'probe-1',
        question: 'Northstar Studioの機能を教えてください。',
        audience: 'Buyer',
        intent: 'Comparison',
        providers: input?.providers ?? ['chatgpt', 'gemini'],
        repetitions: input?.repetitions ?? 2,
        locale: 'ja-JP',
        status: 'active',
        targetClaimIds: input?.targetClaimIds ?? ['claim-1', 'claim-2'],
        lastRunAt: null,
        nextRunAt: null,
      },
    ],
    runs: [],
    campaigns: [],
    findings: [],
    actions: [],
    trend: [],
    activity: [],
  };
}

const plannedAt = '2026-09-03T01:00:00.000Z';

function plan(snapshot = workspace()) {
  return planCampaign(snapshot, {
    campaignId: 'campaign-1',
    plannedAt,
    mode: 'demo',
  });
}

function tickingClock(): () => string {
  let tick = 0;
  return () => `2026-09-03T01:00:${String(tick++).padStart(2, '0')}.000Z`;
}

const demoAssessor = new RuleBasedDemoAssessor();

describe('planCampaign', () => {
  it('expands active probe × provider × repeat in stable order and freezes inputs', () => {
    const result = plan();

    expect(result.jobs.map((job) => [job.provider, job.repeatIndex])).toEqual([
      ['chatgpt', 0],
      ['chatgpt', 1],
      ['gemini', 0],
      ['gemini', 1],
    ]);
    expect(result.jobs[0]?.jobId).toBe('campaign-1:probe-1:chatgpt:0');
    expect(result.schemaVersion).toBe('mirror.campaign.v1');
    expect(result.jobs[0]?.evaluationTargets).toEqual([
      {
        claimId: 'claim-1',
        statement: 'Northstar Studioは共同編集機能を提供する。',
        sourceId: 'source-1',
        sourceSnapshotHash: 'fixture-source-sha256',
      },
      {
        claimId: 'claim-2',
        statement: 'Northstar Studioは日本語に対応している。',
        sourceId: 'source-1',
        sourceSnapshotHash: 'fixture-source-sha256',
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.jobs)).toBe(true);
    expect(Object.isFrozen(result.jobs[0]?.evaluationTargets)).toBe(true);
  });

  it('rejects an unresolved or empty target set', () => {
    expect(() => plan(workspace({ targetClaimIds: ['missing-claim'] }))).toThrowError(
      expect.objectContaining<Partial<CampaignPlanError>>({ code: 'missing-target' }),
    );
    expect(() => plan(workspace({ targetClaimIds: [] }))).toThrowError(
      expect.objectContaining<Partial<CampaignPlanError>>({ code: 'missing-target' }),
    );
  });

  it('enforces the 100-job campaign ceiling', () => {
    const oversized = workspace({
      providers: ['chatgpt', 'gemini', 'perplexity', 'claude'],
      repetitions: Math.floor(MAX_CAMPAIGN_JOBS / 4) + 1,
    });

    expect(() => plan(oversized)).toThrowError(
      expect.objectContaining<Partial<CampaignPlanError>>({ code: 'job-limit-exceeded' }),
    );
  });
});

describe('deterministic demo boundaries', () => {
  it('returns exactly the same response for the same observation input', async () => {
    const adapter = new DeterministicDemoAdapter('chatgpt');
    const request: ProviderObservationRequest = {
      jobId: 'job-1',
      provider: 'chatgpt',
      repeatIndex: 0,
      observation: {
        subject: {
          displayName: 'Northstar Studio',
          canonicalDomain: 'northstar.example',
          aliases: ['Northstar'],
        },
        question: 'どのような製品ですか。',
        locale: 'ja-JP',
        searchEnabled: true,
      },
    };
    const signal = new AbortController().signal;

    const first = await adapter.observe(request, { signal });
    const second = await adapter.observe(request, { signal });

    expect(second).toEqual(first);
  });

  it('assesses only explicit targets and stays conservative about evidence', async () => {
    const assessments = await demoAssessor.assess(
      {
        response: {
          model: 'fixture-model',
          answer: 'Northstar Studioは共同編集機能を提供する。',
          citationUrls: ['https://northstar.example/product'],
        },
        targets: plan().jobs[0]?.evaluationTargets ?? [],
      },
      {
        signal: new AbortController().signal,
        assessedAt: '2026-09-03T01:02:00.000Z',
      },
    );

    expect(assessments.map((assessment) => assessment.claimId)).toEqual(['claim-1', 'claim-2']);
    expect(assessments[0]).toMatchObject({ visibility: 'mentioned', factuality: 'accurate', evidence: 'reported-url' });
    expect(assessments[1]).toMatchObject({ visibility: 'omitted', factuality: 'not-assessed', evidence: 'none' });
  });

  it('recognizes a close paraphrase while preserving the observed passage', async () => {
    const assessments = await demoAssessor.assess(
      {
        response: {
          model: 'fixture-model',
          answer: 'Morrow Fleetは、EVとガソリン車が混在する移行期のフリートを一つの画面で管理できる。',
          citationUrls: ['https://morrow.example/fleet'],
        },
        targets: [
          {
            claimId: 'morrow-c1',
            statement: 'Morrow FleetはEVとガソリン車が混在する車両群を一元管理できる。',
            sourceId: 'morrow-s1',
            sourceSnapshotHash: 'fixture-hash',
          },
        ],
      },
      {
        signal: new AbortController().signal,
        assessedAt: '2026-09-03T01:02:00.000Z',
      },
    );

    expect(assessments[0]).toMatchObject({
      visibility: 'mentioned',
      factuality: 'accurate',
      evidence: 'reported-url',
      observedExcerpt: 'Morrow Fleetは、EVとガソリン車が混在する移行期のフリートを一つの画面で管理できる。',
      citationUrl: 'https://morrow.example/fleet',
    });
    expect(assessments[0]?.rationale).toContain('字句重なり');
  });
});

describe('executeCampaign', () => {
  it('keeps Claims out of the provider request and returns immutable successful artifacts', async () => {
    let capturedRequest: ProviderObservationRequest | undefined;
    const adapter: ProviderAdapter = {
      provider: 'chatgpt',
      mode: 'demo',
      async observe(request) {
        capturedRequest = request;
        return {
          model: 'capturing-demo-v1',
          answer: 'Northstar Studioは共同編集機能を提供する。',
          citationUrls: [],
        };
      },
    };
    const oneJobPlan = plan(workspace({ providers: ['chatgpt'], repetitions: 1 }));
    const result = await executeCampaign(oneJobPlan, {
      adapters: [adapter],
      assessor: demoAssessor,
      signal: new AbortController().signal,
      now: tickingClock(),
      createRunId: (job) => `run:${job.jobId}`,
    });

    expect(capturedRequest).toBeDefined();
    const serializedRequest = JSON.stringify(capturedRequest);
    expect(serializedRequest).not.toContain('evaluationTargets');
    expect(serializedRequest).not.toContain('共同編集機能を提供する');
    expect(result.status).toBe('completed');
    expect(result.schemaVersion).toBe('mirror.campaign.v1');
    expect(result.assessorId).toBe(demoAssessor.id);
    expect(result.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.status).toBe('succeeded');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.artifacts)).toBe(true);
    expect(Object.isFrozen(result.artifacts[0])).toBe(true);
    if (result.artifacts[0]?.status === 'succeeded') {
      expect(result.artifacts[0].artifactHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.artifacts[0].run.provenance.artifactHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.artifacts[0].run.provenance.assessorId).toBe(demoAssessor.id);
      expect(result.artifacts[0].run.provenance.campaignId).toBe('campaign-1');
      expect(Object.isFrozen(result.artifacts[0].run.assessments)).toBe(true);
    }
  });

  it('continues after an individual job fails', async () => {
    const adapter: ProviderAdapter = {
      provider: 'chatgpt',
      mode: 'demo',
      async observe(request): Promise<ProviderObservationResponse> {
        if (request.repeatIndex === 0) throw new Error('Sensitive upstream detail');
        return {
          model: 'recovery-demo-v1',
          answer: 'Northstar Studioは共同編集機能を提供する。',
          citationUrls: [],
        };
      },
    };
    const result = await executeCampaign(
      plan(workspace({ providers: ['chatgpt'], repetitions: 2 })),
      {
        adapters: [adapter],
        assessor: demoAssessor,
        signal: new AbortController().signal,
        now: tickingClock(),
        createRunId: (job) => `run:${job.jobId}`,
      },
    );

    expect(result.status).toBe('completed-with-errors');
    expect(result.artifacts.map((artifact) => artifact.status)).toEqual(['failed', 'succeeded']);
    const failure = result.artifacts[0];
    if (failure?.status === 'failed') {
      expect(failure.artifactHash).toMatch(/^[a-f0-9]{64}$/);
      expect(failure.error).toEqual({
        code: 'provider-error',
        message: 'The provider observation could not be completed.',
        retriable: true,
      });
    }
  });

  it('cancels the active job and records every pending job after abort', async () => {
    const controller = new AbortController();
    let calls = 0;
    const adapter: ProviderAdapter = {
      provider: 'chatgpt',
      mode: 'demo',
      async observe() {
        calls += 1;
        controller.abort('test cancellation');
        throw new DOMException('Aborted', 'AbortError');
      },
    };
    const result = await executeCampaign(
      plan(workspace({ providers: ['chatgpt'], repetitions: 2 })),
      {
        adapters: [adapter],
        assessor: demoAssessor,
        signal: controller.signal,
        now: tickingClock(),
        createRunId: (job: MeasurementJobSnapshot) => `run:${job.jobId}`,
      },
    );

    expect(calls).toBe(1);
    expect(result.status).toBe('cancelled');
    expect(result.artifacts.map((artifact) => artifact.status)).toEqual(['cancelled', 'cancelled']);
    expect(result.artifacts[0]?.startedAt).not.toBeNull();
    expect(result.artifacts[1]?.startedAt).toBeNull();
    expect(result.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.artifactHash))).toBe(true);
  });

  it('rejects assessor output for non-target Claims as an invalid response', async () => {
    const invalidAssessor: AnswerAssessor = {
      id: 'invalid-assessor',
      async assess(): Promise<readonly ClaimAssessment[]> {
        return [
          {
            claimId: 'not-a-target',
            visibility: 'mentioned',
            factuality: 'accurate',
            attribution: 'correct',
            evidence: 'none',
            confidence: 1,
            rationale: 'invalid fixture',
          },
        ];
      },
    };
    const result = await executeCampaign(
      plan(workspace({ providers: ['chatgpt'], repetitions: 1 })),
      {
        adapters: [new DeterministicDemoAdapter('chatgpt')],
        assessor: invalidAssessor,
        signal: new AbortController().signal,
        now: tickingClock(),
        createRunId: (job) => `run:${job.jobId}`,
      },
    );

    expect(result.status).toBe('completed-with-errors');
    const artifact = result.artifacts[0];
    expect(artifact?.status).toBe('failed');
    if (artifact?.status === 'failed') expect(artifact.error.code).toBe('invalid-response');
  });
});
