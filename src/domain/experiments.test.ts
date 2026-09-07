import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { demoWorkspaces } from '../data/demoWorkspaces';
import type { ProbeRun } from './model';
import { experimentFixture, experimentInput } from '../test/experimentFixture';
import {
  createEvidencePack,
  verifyEvidencePack,
  fingerprint,
} from './evidencePack';
import {
  createWorkspaceBackup,
  restoreWorkspaceCopy,
  verifyWorkspaceBackup,
} from './workspaceBackup';
import {
  createExperimentEvaluation,
  createExperimentPlan,
  evaluateWindow,
  experimentCohorts,
  tallyRate,
  validateExperimentRecords,
  cohortForRun,
} from './experiments';

function setup() {
  const snapshot = structuredClone(demoWorkspaces[0]!);
  const finding = snapshot.findings.find((item) => item.id === 'aster-f2')!;
  const action = snapshot.actions.find(
    (item) => item.findingId === finding.id,
  )!;
  const probe = snapshot.probes.find(
    (item) => item.id === finding.probeIds[0],
  )!;
  const base = snapshot.runs.find((item) => item.probeId === probe.id)!;
  const captured = (run: ProbeRun, id: string, executedAt: string) =>
    ({
      ...structuredClone(run),
      id,
      executedAt,
      provenance: {
        ...run.provenance,
        campaignId: null,
        artifactHash: `hash-${id}`,
      },
      inputSnapshot: {
        observation: {
          subject: {
            displayName: snapshot.workspace.subject.displayName,
            canonicalDomain: snapshot.workspace.subject.canonicalDomain,
            aliases: [...snapshot.workspace.subject.aliases],
          },
          question: probe.question,
          locale: run.locale,
          searchEnabled: run.searchEnabled,
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
    }) satisfies ProbeRun;
  snapshot.runs = [
    captured(base, 'before', '2026-09-01T01:00:00.000Z'),
    captured(base, 'after', '2026-09-03T01:00:00.000Z'),
    {
      ...captured(base, 'different', '2026-09-03T02:00:00.000Z'),
      model: 'another-model',
    },
  ];
  return { snapshot, finding, action };
}

describe('experiment records', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));

  const lockedFixture = () => {
    const fixture = experimentFixture();
    const plan = createExperimentPlan(
      fixture.snapshot,
      fixture.action,
      fixture.finding,
      experimentInput,
      '2026-09-02T00:00:00.000Z',
    );
    fixture.action.measurementPlan = plan;
    return { ...fixture, plan };
  };

  it('separates captured condition changes while allowing a new source revision', () => {
    const { snapshot, finding, before } = experimentFixture();
    const original = cohortForRun(before);
    const variations: Array<(run: ProbeRun) => void> = [
      (run) => {
        run.provider = 'claude';
      },
      (run) => {
        run.model = 'new-model';
      },
      (run) => {
        run.provenance.origin = 'manual';
      },
      (run) => {
        run.provenance.assessorId = 'new-assessor';
      },
      (run) => {
        run.locale = run.inputSnapshot!.observation.locale = 'en-US';
      },
      (run) => {
        run.searchEnabled = run.inputSnapshot!.observation.searchEnabled =
          !run.searchEnabled;
      },
      (run) => {
        run.inputSnapshot!.observation.question += ' 詳細に';
      },
      (run) => {
        run.inputSnapshot!.evaluationTargets[0]!.statement += ' 条件付き';
      },
      (run) => {
        run.inputSnapshot!.observation.subject.displayName = '別企業';
      },
    ];
    for (const change of variations) {
      const run = structuredClone(before);
      change(run);
      expect(cohortForRun(run)).not.toEqual(original);
    }
    const revision = structuredClone(before);
    revision.inputSnapshot!.evaluationTargets[0]!.sourceSnapshotHash =
      'a-new-source-revision';
    expect(cohortForRun(revision)).toEqual(original);
    expect(experimentCohorts(snapshot, finding)).toHaveLength(2);
  });

  it('excludes incomplete captures and keeps unassessed responses outside the denominator', () => {
    const { snapshot, plan, before } = lockedFixture();
    const legacy = { ...structuredClone(before), id: 'legacy' };
    delete legacy.inputSnapshot;
    const invalid = {
      ...structuredClone(before),
      id: 'invalid',
      assessments: [],
    };
    const unassessed = { ...structuredClone(before), id: 'unknown' };
    unassessed.assessments.find(
      (item) => item.claimId === plan.claimId,
    )!.factuality = 'not-assessed';
    snapshot.runs.push(legacy, invalid, unassessed);
    const tally = evaluateWindow(snapshot, plan, plan.baselineWindow);
    expect(tally).toMatchObject({
      affected: 1,
      notDetected: 0,
      unassessed: 1,
      excluded: [
        { runId: 'invalid', reason: 'invalid-assessments' },
        { runId: 'legacy', reason: 'missing-input' },
      ],
    });
    expect(tallyRate(tally)).toBe(0);
    expect(tallyRate({ ...tally, affected: 0 })).toBeNull();
  });

  it('refuses premature evaluations, empty notes, and rewritten locked plans', () => {
    const { snapshot, action, finding, plan } = lockedFixture();
    expect(() =>
      createExperimentEvaluation(
        snapshot,
        plan,
        '確認した記録',
        '2026-09-03T22:59:59.000Z',
      ),
    ).toThrow(/観測期間/);
    const retrospective = { ...plan, createdAt: '2026-09-05T00:00:00.000Z' };
    expect(() =>
      createExperimentEvaluation(
        snapshot,
        retrospective,
        '確認した記録',
        '2026-09-04T00:00:00.000Z',
      ),
    ).toThrow(/固定した時刻/);
    expect(() =>
      createExperimentEvaluation(
        snapshot,
        plan,
        ' ',
        '2026-09-04T00:00:00.000Z',
      ),
    ).toThrow(/検証メモ/);
    expect(() =>
      createExperimentPlan(snapshot, action, finding, experimentInput),
    ).toThrow(/上書き/);
  });

  it('preserves experiment results and excluded evidence through both export formats and restore-as-copy', async () => {
    const { snapshot, action, finding, plan, before } = lockedFixture();
    action.evaluations = [
      createExperimentEvaluation(
        snapshot,
        plan,
        '保存した根拠を確認した。',
        '2026-09-04T00:00:00.000Z',
      ),
    ];
    // Later arrivals are visible in live comparisons, not silently inserted into saved tallies.
    snapshot.runs.push({ ...structuredClone(before), id: 'late-before' });
    const backup = await createWorkspaceBackup(snapshot);
    const copy = await restoreWorkspaceCopy(backup);
    expect(copy.actions).toEqual(snapshot.actions);
    expect(copy.workspace.id).not.toBe(snapshot.workspace.id);
    expect(
      copy.actions.find((item) => item.id === action.id)!.measurementPlan!
        .baseline.runIds,
    ).toEqual(['before']);
    const pack = await createEvidencePack(snapshot, finding);
    const checked = await verifyEvidencePack(JSON.stringify(pack));
    expect(checked.payload.actions[0]!.evaluations).toEqual(action.evaluations);
    expect(checked.payload.runs.some((run) => run.id === 'different')).toBe(
      true,
    );
    expect(backup.format).toBe('mirror.workspace-backup.v2');
    expect(pack.format).toBe('mirror.evidence-pack.v2');
  });

  it('rejects malformed saved references and counts even with a matching outer fingerprint', async () => {
    const { snapshot, action, plan } = lockedFixture();
    action.evaluations = [
      createExperimentEvaluation(
        snapshot,
        plan,
        '保存した根拠を確認した。',
        '2026-09-04T00:00:00.000Z',
      ),
    ];
    for (const mutate of [
      (value: typeof snapshot) => {
        value.actions.find(
          (item) => item.id === action.id,
        )!.measurementPlan!.baseline.affected += 1;
      },
      (value: typeof snapshot) => {
        value.runs = value.runs.filter((run) => run.id !== 'different');
      },
      (value: typeof snapshot) => {
        value.actions
          .find((item) => item.id === action.id)!
          .evaluations![0]!.followup.runIds.push('missing');
      },
    ]) {
      const backup = structuredClone(await createWorkspaceBackup(snapshot));
      mutate(backup.snapshot);
      const { fingerprint: _old, ...content } = backup;
      void _old;
      backup.fingerprint.value = await fingerprint(content);
      await expect(
        verifyWorkspaceBackup(JSON.stringify(backup)),
      ).rejects.toThrow(/Run参照|集計値/);
    }
  });

  it('does not trim imported notes before verifying their fingerprint', async () => {
    const { snapshot, action, finding, plan } = lockedFixture();
    action.evaluations = [
      createExperimentEvaluation(
        snapshot,
        plan,
        '保存した根拠を確認した。',
        '2026-09-04T00:00:00.000Z',
      ),
    ];
    const pack = structuredClone(await createEvidencePack(snapshot, finding));
    pack.payload.actions[0]!.evaluations![0]!.note += ' ';
    await expect(verifyEvidencePack(JSON.stringify(pack))).rejects.toThrow(
      /Fingerprint/,
    );
  });

  it('includes historical source references even when the current claim points elsewhere', async () => {
    const { snapshot, finding, before } = experimentFixture();
    const target = before.inputSnapshot!.evaluationTargets[0]!;
    const historical = structuredClone(
      snapshot.sources.find((source) => source.id === target.sourceId)!,
    );
    historical.id = 'historical-source';
    snapshot.sources.push(historical);
    target.sourceId = historical.id;
    const pack = await createEvidencePack(snapshot, finding);
    expect(
      pack.payload.sources.some((source) => source.id === historical.id),
    ).toBe(true);
    const missing = structuredClone(pack);
    missing.payload.runs[0]!.inputSnapshot!.evaluationTargets[0]!.sourceId =
      'missing';
    const { fingerprint: _old, ...content } = missing;
    void _old;
    missing.fingerprint.value = await fingerprint(content);
    await expect(verifyEvidencePack(JSON.stringify(missing))).rejects.toThrow(
      /参照/,
    );
  });

  it('freezes comparable conditions and keeps later arrivals out of the saved baseline', () => {
    const { snapshot, action, finding } = setup();
    expect(experimentCohorts(snapshot, finding)).toHaveLength(2);
    const plan = createExperimentPlan(
      snapshot,
      action,
      finding,
      {
        seedRunId: 'before',
        baselineWindow: {
          startAt: '2026-09-01T00:00:00.000Z',
          endAt: '2026-09-01T23:00:00.000Z',
        },
        changedAt: '2026-09-02T00:00:00.000Z',
        changeSummary: '公式ページの説明を明確にする',
        followupWindow: {
          startAt: '2026-09-03T00:00:00.000Z',
          endAt: '2026-09-03T23:00:00.000Z',
        },
      },
      '2026-09-02T00:00:00.000Z',
    );
    expect(plan.baseline.runIds).toEqual(['before']);
    snapshot.runs.push({
      ...structuredClone(snapshot.runs[0]!),
      id: 'late-before',
    });
    expect(plan.baseline.runIds).toEqual(['before']);
    const followup = evaluateWindow(snapshot, plan, plan.followupWindow);
    expect(followup.runIds).toEqual(['after']);
    expect(followup.excluded).toEqual([
      { runId: 'different', reason: 'different-conditions' },
    ]);
  });

  it('records an elapsed follow-up and validates its frozen run references', () => {
    const { snapshot, action, finding } = setup();
    const plan = createExperimentPlan(
      snapshot,
      action,
      finding,
      {
        seedRunId: 'before',
        baselineWindow: {
          startAt: '2026-09-01T00:00:00.000Z',
          endAt: '2026-09-01T23:00:00.000Z',
        },
        changedAt: '2026-09-02T00:00:00.000Z',
        changeSummary: '説明を更新する',
        followupWindow: {
          startAt: '2026-09-03T00:00:00.000Z',
          endAt: '2026-09-03T23:00:00.000Z',
        },
      },
      '2026-09-02T00:00:00.000Z',
    );
    const result = createExperimentEvaluation(
      snapshot,
      plan,
      '同条件の回答を確認した。',
      '2026-09-04T00:00:00.000Z',
    );
    const savedAction = {
      ...action,
      measurementPlan: plan,
      evaluations: [result],
    };
    expect(tallyRate(result.followup)).not.toBeNull();
    expect(() =>
      validateExperimentRecords(snapshot, [savedAction], [finding]),
    ).not.toThrow();
    const tampered = structuredClone(savedAction);
    tampered.measurementPlan!.baseline.affected += 1;
    expect(() =>
      validateExperimentRecords(snapshot, [tampered], [finding]),
    ).toThrow(/集計値/);
  });

  it('does not substitute current definitions for legacy runs and rejects invalid periods', () => {
    const { snapshot, action, finding } = setup();
    delete snapshot.runs[0]!.inputSnapshot;
    const provisional = {
      cohort: snapshot.runs[1]!.inputSnapshot
        ? experimentCohorts(snapshot, finding)[0]!.cohort
        : null,
      claimId: finding.claimId,
      kind: finding.kind,
    };
    expect(
      evaluateWindow(snapshot, provisional as never, {
        startAt: '2026-09-01T00:00:00.000Z',
        endAt: '2026-09-01T23:00:00.000Z',
      }).excluded[0]?.reason,
    ).toBe('missing-input');
    expect(() =>
      createExperimentPlan(
        snapshot,
        action,
        finding,
        {
          seedRunId: 'after',
          baselineWindow: {
            startAt: '2026-09-03T00:00:00.000Z',
            endAt: '2026-09-03T23:00:00.000Z',
          },
          changedAt: '2026-09-02T00:00:00.000Z',
          changeSummary: '説明を更新する',
          followupWindow: {
            startAt: '2026-09-03T00:00:00.000Z',
            endAt: '2026-09-04T00:00:00.000Z',
          },
        },
        '2026-09-04T00:00:00.000Z',
      ),
    ).toThrow(/変更前/);
  });
});
