import { describe, expect, it } from 'vitest';
import { demoWorkspaces } from '../data/demoWorkspaces';
import { buildComparison } from './comparison';
import type { ClaimAssessment, ProbeRun } from './model';

function setup() {
  const snapshot = structuredClone(demoWorkspaces[0]!);
  const claim = snapshot.claims[0]!;
  const secondClaim = snapshot.claims[1]!;
  const source = snapshot.sources.find((item) => item.id === claim.sourceId)!;
  const probe = {
    ...snapshot.probes[0]!,
    question: 'このサービスの特徴を教えてください。',
    targetClaimIds: [claim.id, secondClaim.id],
  };
  const assessment: ClaimAssessment = {
    claimId: claim.id,
    visibility: 'mentioned',
    factuality: 'partial',
    attribution: 'correct',
    evidence: 'reported-url',
    confidence: 0.7,
    rationale: '確認した人が保存した理由。',
    observedExcerpt: '保存された回答の一部分。',
  };
  const captured: ProbeRun = {
    ...snapshot.runs[0]!,
    id: 'captured',
    probeId: probe.id,
    executedAt: '2026-09-01T01:00:00.000Z',
    assessments: [assessment, { ...assessment, claimId: secondClaim.id }],
    inputSnapshot: {
      observation: {
        subject: structuredClone(snapshot.workspace.subject),
        question: probe.question,
        locale: 'ja-JP',
        searchEnabled: true,
      },
      evaluationTargets: [claim, secondClaim].map((item) => ({
        claimId: item.id,
        statement: item.statement,
        sourceId: source.id,
        sourceSnapshotHash: source.snapshot.sha256,
      })),
    },
  };
  const legacy: ProbeRun = {
    ...structuredClone(captured),
    id: 'legacy',
    executedAt: '2026-09-02T01:00:00.000Z',
    inputSnapshot: undefined,
  };
  snapshot.probes = [probe];
  snapshot.runs = [captured, legacy];
  return { snapshot, claim, secondClaim, source, probe, captured, legacy };
}

describe('saved answer comparison', () => {
  it('projects original answers and assessments without re-evaluating or mutating them', () => {
    const { snapshot, probe, captured, claim, source } = setup();
    const before = structuredClone(snapshot);
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id],
    });
    const cell = comparison.rows.find((row) => row.claimId === claim.id)!
      .cells[0]!;
    expect(comparison.runs[0]!.run.answer).toBe(captured.answer);
    expect(cell.assessment).toBe(captured.assessments[0]);
    expect(cell.assessment?.factuality).toBe('partial');
    expect(cell.source).toMatchObject({
      status: 'captured-match',
      excerpt: source.snapshot.excerpt,
      expectedHash: source.snapshot.sha256,
    });
    expect(snapshot).toEqual(before);
  });

  it('uses captured questions and target definitions after current definitions change', () => {
    const { snapshot, probe, captured, claim, legacy } = setup();
    const oldQuestion = captured.inputSnapshot!.observation.question;
    const oldStatement = claim.statement;
    probe.question = '変更後の質問です。';
    claim.statement = '変更後の確認項目です。';
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id, legacy.id],
    });
    expect(comparison.runs[0]!.question).toBe(oldQuestion);
    expect(comparison.runs[1]).toMatchObject({
      question: probe.question,
      definitionOrigin: 'current',
    });
    expect(comparison.runs[1]!.conditionLabels).toContain(
      '現行定義を参照・観測時の定義は未保存',
    );
    const row = comparison.rows.find((item) => item.claimId === claim.id)!;
    expect(row.definitionsDiffer).toBe(true);
    expect(row.cells.map((cell) => cell.statement)).toEqual([
      oldStatement,
      claim.statement,
    ]);
    expect(row.cells[1]!.source.status).toBe('current-reference');
  });

  it('never substitutes a changed source excerpt for the captured source version', () => {
    const { snapshot, probe, captured, claim, source, legacy } = setup();
    const oldHash = source.snapshot.sha256;
    source.snapshot.sha256 = 'changed-hash';
    source.snapshot.excerpt = '更新された資料本文です。';
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id, legacy.id],
    });
    const [oldCell, legacyCell] = comparison.rows.find(
      (row) => row.claimId === claim.id,
    )!.cells;
    expect(oldCell!.source).toMatchObject({
      status: 'changed',
      label: '更新あり・旧本文未収録',
      excerpt: null,
      expectedHash: oldHash,
    });
    expect(legacyCell!.source).toMatchObject({
      status: 'current-reference',
      excerpt: source.snapshot.excerpt,
      expectedHash: null,
    });
  });

  it('keeps captured targets removed from the current probe and marks non-targets', () => {
    const { snapshot, probe, captured, claim, legacy } = setup();
    probe.targetClaimIds = probe.targetClaimIds.filter((id) => id !== claim.id);
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id, legacy.id],
    });
    const row = comparison.rows.find((item) => item.claimId === claim.id)!;
    expect(row.cells[0]!.state).toBe('assessed');
    expect(row.cells[1]).toMatchObject({
      state: 'not-targeted',
      assessment: null,
      statement: null,
    });
    expect(comparison.runs[1]!.issues).toContain(
      `対象外の保存判定: ${claim.id}`,
    );
  });

  it('exposes missing, duplicate, and unexpected saved assessments without choosing one', () => {
    const { snapshot, probe, captured, claim, secondClaim } = setup();
    captured.assessments = [
      captured.assessments[0]!,
      captured.assessments[0]!,
      {
        ...captured.assessments[0]!,
        claimId: 'unknown-claim',
      },
    ];
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id],
    });
    expect(
      comparison.rows.find((row) => row.claimId === claim.id)!.cells[0],
    ).toMatchObject({
      state: 'duplicate-assessment',
      assessment: null,
    });
    expect(
      comparison.rows.find((row) => row.claimId === secondClaim.id)!.cells[0],
    ).toMatchObject({
      state: 'missing-assessment',
      assessment: null,
    });
    expect(comparison.runs[0]!.issues).toEqual(
      expect.arrayContaining([
        `保存判定が重複: ${claim.id}`,
        `判定未収録: ${secondClaim.id}`,
        '対象外の保存判定: unknown-claim',
      ]),
    );
  });

  it('flags missing claim references while retaining the historical target text', () => {
    const { snapshot, probe, captured, claim } = setup();
    snapshot.claims = snapshot.claims.filter((item) => item.id !== claim.id);
    const row = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id],
    }).rows.find((item) => item.claimId === claim.id)!;
    expect(row.currentClaim).toBeNull();
    expect(row.statement).toBe(claim.statement);
    expect(row.cells[0]).toMatchObject({
      state: 'invalid-target',
      statement: claim.statement,
    });
  });

  it('does not invent source text for missing, ambiguous, or unversioned source references', () => {
    for (const variant of ['missing', 'ambiguous', 'unversioned'] as const) {
      const { snapshot, probe, captured, claim, source } = setup();
      if (variant === 'missing') snapshot.sources = [];
      if (variant === 'ambiguous')
        snapshot.sources.push(structuredClone(source));
      if (variant === 'unversioned')
        captured.inputSnapshot!.evaluationTargets[0]!.sourceSnapshotHash = '';
      const cell = buildComparison(snapshot, {
        probeId: probe.id,
        runIds: [captured.id],
      }).rows.find((row) => row.claimId === claim.id)!.cells[0]!;
      expect(cell.source.status).toBe('missing');
      expect(cell.source.excerpt).toBeNull();
      expect(cell.issues.length).toBeGreaterThan(0);
    }
  });

  it('does not pick a target definition when its ID is duplicated', () => {
    const { snapshot, probe, captured, claim } = setup();
    captured.inputSnapshot!.evaluationTargets.push({
      ...captured.inputSnapshot!.evaluationTargets[0]!,
      statement: '別の文章',
    });
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id],
    });
    expect(
      comparison.rows.find((row) => row.claimId === claim.id)!.cells[0],
    ).toMatchObject({
      state: 'invalid-target',
      statement: null,
    });
    expect(comparison.runs[0]!.issues).toContain(
      '評価対象IDが重複しています。',
    );
  });

  it('surfaces model, language, search, origin, evaluator, and saved-input discrepancies', () => {
    const { snapshot, probe, captured, legacy } = setup();
    legacy.model = 'different-model';
    legacy.locale = 'en-US';
    legacy.searchEnabled = false;
    legacy.provenance.origin = 'manual';
    legacy.provenance.assessorId = 'human-review';
    captured.locale = 'en-US';
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [captured.id, legacy.id],
    });
    expect(comparison.runs[1]!.conditionLabels).toEqual(
      expect.arrayContaining([
        'different-model',
        '言語: en-US',
        '検索なし',
        '手動取込',
        '評価: human-review',
      ]),
    );
    expect(comparison.runs[0]!.issues).toContain(
      '保存入力と回答の言語・検索条件が一致していません。',
    );
  });

  it('filters by probe, retains requested order, deduplicates selection, and limits to three', () => {
    const { snapshot, probe, captured, legacy } = setup();
    snapshot.runs.push(
      {
        ...structuredClone(captured),
        id: 'other-probe',
        probeId: 'another-probe',
      },
      { ...structuredClone(captured), id: 'third' },
      { ...structuredClone(captured), id: 'fourth' },
    );
    const comparison = buildComparison(snapshot, {
      probeId: probe.id,
      runIds: [
        'other-probe',
        'missing',
        legacy.id,
        legacy.id,
        captured.id,
        'third',
        'fourth',
      ],
    });
    expect(comparison.runs.map(({ run }) => run.id)).toEqual([
      legacy.id,
      captured.id,
      'third',
    ]);
    expect(comparison.notices.length).toBeGreaterThan(1);
    expect(
      buildComparison(snapshot, { probeId: probe.id, runIds: [] }).runs,
    ).toEqual([]);
    expect(
      buildComparison(snapshot, { probeId: probe.id, limit: 1 }).runs[0]!.run
        .id,
    ).toBe(legacy.id);
  });

  it('rejects ambiguous run IDs and missing probe references', () => {
    const { snapshot, probe, captured } = setup();
    snapshot.runs.push(structuredClone(captured));
    expect(
      buildComparison(snapshot, { probeId: probe.id, runIds: [captured.id] })
        .runs,
    ).toEqual([]);
    expect(buildComparison(snapshot, { probeId: 'missing' })).toMatchObject({
      probe: null,
      runs: [],
      rows: [],
    });
  });

  it('orders observations by instant even when saved timestamps use different offsets', () => {
    const { snapshot, probe, captured, legacy } = setup();
    captured.executedAt = '2026-09-01T10:00:00+09:00';
    legacy.executedAt = '2026-09-01T02:00:00Z';
    expect(
      buildComparison(snapshot, { probeId: probe.id }).runs.map(
        ({ run }) => run.id,
      ),
    ).toEqual([legacy.id, captured.id]);
  });
});
