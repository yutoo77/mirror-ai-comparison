import { describe, expect, it } from 'vitest';
import { demoWorkspaces } from '../data/demoWorkspaces';
import {
  applySourceVersion, compareSourceText, MAX_SOURCE_HISTORY, prepareSourceVersion,
  resolveSourceVersion, reviewSourceClaim, sourceImpact, validateSourceHistory,
} from './sourceHistory';
import { buildComparison } from './comparison';
import { deriveFindingsFromRuns } from './observation';
import { planCampaign } from '../execution/planCampaign';

const captureTime = '2026-09-05T12:00:00.000Z';
function fixture() {
  const workspace = structuredClone(demoWorkspaces[0]!);
  const source = workspace.sources[0]!;
  const input = { expectedHash: source.snapshot.sha256, excerpt: 'エンタープライズプランでは、導入支援を平日のみ提供します。', note: '対象プランと対応日の条件を確認。' };
  return { workspace, source, input };
}

describe('versioned source evidence', () => {
  it('appends an immutable previous capture and queues linked claims only', async () => {
    const { workspace, source, input } = fixture();
    const original = structuredClone(workspace);
    const version = await prepareSourceVersion(source, input, captureTime);
    const updated = applySourceVersion(workspace, source.id, input.expectedHash, version);
    expect(version.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(updated.sources[0]).toMatchObject({ history: [source.snapshot], snapshot: version, status: 'changed' });
    for (const claim of updated.claims) {
      const before = workspace.claims.find((item) => item.id === claim.id)!;
      expect(claim.status).toBe(claim.sourceId === source.id && before.status !== 'draft' ? 'review-due' : before.status);
    }
    expect(updated.runs).toBe(workspace.runs);
    expect(updated.findings).toBe(workspace.findings);
    expect(updated.campaigns).toBe(workspace.campaigns);
    version.excerpt = 'mutated caller object';
    expect(updated.sources[0]!.snapshot.excerpt).toBe(input.excerpt);
    expect(workspace).toEqual(original);
  });

  it.each([
    ['same text', (input: ReturnType<typeof fixture>['input'], source: ReturnType<typeof fixture>['source']) => ({ ...input, excerpt: source.snapshot.excerpt })],
    ['empty note', (input: ReturnType<typeof fixture>['input']) => ({ ...input, note: '   ' })],
    ['short text', (input: ReturnType<typeof fixture>['input']) => ({ ...input, excerpt: '短い' })],
    ['oversized text', (input: ReturnType<typeof fixture>['input']) => ({ ...input, excerpt: 'a'.repeat(100001) })],
    ['oversized note', (input: ReturnType<typeof fixture>['input']) => ({ ...input, note: 'a'.repeat(1001) })],
    ['stale editor', (input: ReturnType<typeof fixture>['input']) => ({ ...input, expectedHash: 'stale' })],
  ])('refuses %s without touching saved evidence', async (_label, modify) => {
    const { source, input } = fixture();
    const before = structuredClone(source);
    await expect(prepareSourceVersion(source, modify(input, source))).rejects.toThrow();
    expect(source).toEqual(before);
  });

  it('does not prune evidence when the history limit is reached', async () => {
    const { source, input } = fixture();
    source.history = Array.from({ length: MAX_SOURCE_HISTORY }, () => structuredClone(source.snapshot));
    await expect(prepareSourceVersion(source, input)).rejects.toThrow(/保存上限/);
    expect(source.history).toHaveLength(MAX_SOURCE_HISTORY);
  });

  it('keeps a prior capture addressable after multiple updates and a text reversion', async () => {
    const { workspace, source, input } = fixture();
    const first = await prepareSourceVersion(source, input, captureTime);
    const updated = applySourceVersion(workspace, source.id, input.expectedHash, first);
    const reverted = await prepareSourceVersion(updated.sources[0]!, { ...input, expectedHash: first.sha256, excerpt: source.snapshot.excerpt, note: '元の文面に戻ったことを手動確認。' });
    const next = applySourceVersion(updated, source.id, first.sha256, reverted);
    expect(next.sources[0]!.history).toHaveLength(2);
    expect(resolveSourceVersion(next.sources[0]!, first.sha256)?.excerpt).toBe(input.excerpt);
    expect(resolveSourceVersion(next.sources[0]!, source.snapshot.sha256)?.excerpt).toBe(source.snapshot.excerpt);
    expect(() => applySourceVersion(next, source.id, first.sha256, reverted)).toThrow(/資料の版/);
  });

  it('fails closed on conflicting text for the same saved hash', () => {
    const { source } = fixture();
    source.history = [{ ...source.snapshot, excerpt: '別の原文です。' }];
    expect(resolveSourceVersion(source, source.snapshot.sha256)).toBeNull();
    expect(() => validateSourceHistory(source)).toThrow(/異なる資料本文/);
  });

  it('links captures using saved targets and labels legacy relationships conservatively', () => {
    const { workspace, source } = fixture();
    const impact = sourceImpact(workspace, source.id);
    expect(impact.claims.every((claim) => claim.sourceId === source.id)).toBe(true);
    expect(impact.probes.length).toBeGreaterThan(0);
    const run = workspace.runs[0]!;
    run.inputSnapshot = { observation: { subject: workspace.workspace.subject, question: '保存時の質問', locale: 'ja-JP', searchEnabled: false }, evaluationTargets: [{ claimId: workspace.claims[0]!.id, statement: '保存時の項目', sourceId: 'another-source', sourceSnapshotHash: 'different' }] };
    expect(sourceImpact(workspace, source.id).runs).not.toContain(run);
    run.inputSnapshot.evaluationTargets[0]!.sourceId = source.id;
    expect(sourceImpact(workspace, source.id).runs).toContain(run);
  });

  it('reviews a revised statement against the current version without revising answers', async () => {
    const { workspace, source, input } = fixture();
    const version = await prepareSourceVersion(source, input, captureTime);
    let updated = applySourceVersion(workspace, source.id, input.expectedHash, version);
    const claims = updated.claims.filter((claim) => claim.sourceId === source.id);
    expect(() => reviewSourceClaim(updated, claims[0]!.id, { expectedHash: input.expectedHash, statement: input.excerpt })).toThrow(/更新/);
    for (const claim of claims) updated = reviewSourceClaim(updated, claim.id, { expectedHash: version.sha256, statement: input.excerpt }, captureTime);
    expect(updated.sources[0]!.status).toBe('current');
    expect(updated.claims.find((claim) => claim.id === claims[0]!.id)?.statement).toBe(input.excerpt);
    expect(updated.runs).toBe(workspace.runs);
    expect(updated.findings).toBe(workspace.findings);
    expect(updated.sources[0]!.history).toEqual([source.snapshot]);
  });

  it('shows the captured historical passage rather than the newest text in comparisons', async () => {
    const { workspace, source, input } = fixture();
    const claim = workspace.claims.find((item) => item.sourceId === source.id)!;
    const probe = workspace.probes.find((item) => item.targetClaimIds.includes(claim.id))!;
    const run = workspace.runs.find((item) => item.probeId === probe.id)!;
    run.inputSnapshot = {
      observation: { subject: workspace.workspace.subject, question: probe.question, locale: run.locale, searchEnabled: run.searchEnabled },
      evaluationTargets: [{ claimId: claim.id, statement: claim.statement, sourceId: source.id, sourceSnapshotHash: source.snapshot.sha256 }],
    };
    const version = await prepareSourceVersion(source, input, captureTime);
    const updated = applySourceVersion(workspace, source.id, input.expectedHash, version);
    const cell = buildComparison(updated, { probeId: probe.id, runIds: [run.id] }).rows.find((row) => row.claimId === claim.id)!.cells[0]!;
    expect(cell.source).toMatchObject({ status: 'captured-history', excerpt: source.snapshot.excerpt, version: source.snapshot });
    expect(cell.source.excerpt).not.toBe(input.excerpt);
    expect(cell.issues).toContain('原文は保存当時の版です。更新後の資料に対する判定は未実施です。');
  });

  it('compares literal changed ranges without splitting emoji or inventing unchanged differences', () => {
    expect(compareSourceText('月額100円です。', '月額200円です。')).toEqual({ prefix: '月額', before: '1', after: '2', suffix: '00円です。' });
    expect(compareSourceText('対象😀です。', '対象😁です。')).toEqual({ prefix: '対象', before: '😀', after: '😁', suffix: 'です。' });
    expect(compareSourceText('同じ原文', '同じ原文')).toEqual({ prefix: '同じ原文', before: '', after: '', suffix: '' });
  });

  it('does not silently use unreviewed revised targets for a new automatic campaign', async () => {
    const { workspace, source, input } = fixture();
    const version = await prepareSourceVersion(source, input);
    const updated = applySourceVersion(workspace, source.id, input.expectedHash, version);
    expect(() => planCampaign(updated, { campaignId: 'new', plannedAt: captureTime, mode: 'demo' })).toThrow(/原文と照合/);
  });

  it('retains the recorded official evidence when findings are rebuilt after a source change', async () => {
    const { workspace, source, input } = fixture();
    workspace.findings = deriveFindingsFromRuns(workspace);
    const original = workspace.findings.filter((finding) => workspace.claims.find((claim) => claim.id === finding.claimId)?.sourceId === source.id);
    expect(original.length).toBeGreaterThan(0);
    const version = await prepareSourceVersion(source, input);
    const updated = applySourceVersion(workspace, source.id, input.expectedHash, version);
    const rebuilt = deriveFindingsFromRuns(updated);
    for (const finding of original)
      expect(rebuilt.find((item) => item.id === finding.id)?.evidence.official).toEqual(finding.evidence.official);
  });

  it('resolves captured text for new findings and does not invent a missing capture date', async () => {
    const { workspace, source, input } = fixture();
    const claim = workspace.claims.find((item) => item.sourceId === source.id)!;
    const probe = workspace.probes.find((item) => item.targetClaimIds.includes(claim.id))!;
    const run = workspace.runs.find((item) => item.probeId === probe.id)!;
    run.assessments = probe.targetClaimIds.map((claimId) => ({ ...run.assessments[0]!, claimId, visibility: 'mentioned', factuality: 'contradicted' }));
    run.inputSnapshot = {
      observation: { subject: workspace.workspace.subject, question: probe.question, locale: run.locale, searchEnabled: run.searchEnabled },
      evaluationTargets: probe.targetClaimIds.map((claimId) => {
        const item = workspace.claims.find((candidate) => candidate.id === claimId)!;
        const reference = workspace.sources.find((candidate) => candidate.id === item.sourceId)!;
        return { claimId, statement: item.statement, sourceId: reference.id, sourceSnapshotHash: reference.snapshot.sha256 };
      }),
    };
    workspace.runs = [run];
    workspace.findings = [];
    const version = await prepareSourceVersion(source, input);
    const updated = applySourceVersion(workspace, source.id, input.expectedHash, version);
    const finding = deriveFindingsFromRuns(updated).find((item) => item.claimId === claim.id)!;
    expect(finding.evidence.official.excerpt).toBe(source.snapshot.excerpt);
    expect(finding.evidence.official.capturedAt).toBe(source.snapshot.capturedAt);
    updated.sources.find((item) => item.id === source.id)!.history = [];
    const unavailable = deriveFindingsFromRuns(updated).find((item) => item.claimId === claim.id)!;
    expect(unavailable.evidence.official).toMatchObject({ excerpt: '', capturedAt: null });
  });
});
