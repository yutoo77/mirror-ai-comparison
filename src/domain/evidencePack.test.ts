import { describe, expect, it } from 'vitest';
import { demoWorkspaces } from '../data/demoWorkspaces';
import {
  createEvidencePack,
  MAX_PACK_BYTES,
  verifyEvidencePack,
  fingerprint,
} from './evidencePack';
import { buildIncident } from './incident';
import { experimentFixture } from '../test/experimentFixture';
import { applySourceVersion, prepareSourceVersion } from './sourceHistory';

const workspace = demoWorkspaces[0]!;
const selected = workspace.findings[0]!;

describe('portable evidence packs', () => {
  it('includes historical source captures in v3 and rejects their tampering or downgrade', async () => {
    const snapshot = structuredClone(workspace);
    const claim = snapshot.claims.find((item) => item.id === selected.claimId)!;
    const source = snapshot.sources.find((item) => item.id === claim.sourceId)!;
    const input = { expectedHash: source.snapshot.sha256, excerpt: '対象プランと適用条件を明記した更新後の原文です。', note: '公開情報を手動で再確認。' };
    const version = await prepareSourceVersion(source, input);
    const updated = applySourceVersion(snapshot, source.id, input.expectedHash, version);
    const pack = await createEvidencePack(updated, selected);
    expect(pack.format).toBe('mirror.evidence-pack.v3');
    const verified = await verifyEvidencePack(JSON.stringify(pack));
    expect(verified.payload.sources.find((item) => item.id === source.id)?.history).toEqual([source.snapshot]);
    const tampered = structuredClone(pack);
    tampered.payload.sources.find((item) => item.id === source.id)!.history![0]!.excerpt = '過去の根拠を変更しました。';
    await expect(verifyEvidencePack(JSON.stringify(tampered))).rejects.toThrow(/Fingerprint/);
    const downgraded = structuredClone(pack);
    downgraded.format = 'mirror.evidence-pack.v2';
    const { fingerprint: ignored, ...content } = downgraded;
    void ignored;
    downgraded.fingerprint.value = await fingerprint(content);
    await expect(verifyEvidencePack(JSON.stringify(downgraded))).rejects.toThrow(/v3が必要/);
  });
  it('reads legacy v1 but refuses new capture fields disguised as v1', async () => {
    const legacy = structuredClone(
      await createEvidencePack(workspace, selected),
    );
    legacy.format = 'mirror.evidence-pack.v1';
    const { fingerprint: _legacyHash, ...legacyContent } = legacy;
    void _legacyHash;
    legacy.fingerprint.value = await fingerprint(legacyContent);
    expect(await verifyEvidencePack(JSON.stringify(legacy))).toEqual(legacy);
    const fixture = experimentFixture();
    const downgrade = structuredClone(
      await createEvidencePack(fixture.snapshot, fixture.finding),
    );
    downgrade.format = 'mirror.evidence-pack.v1';
    const { fingerprint: _newHash, ...newContent } = downgrade;
    void _newHash;
    downgrade.fingerprint.value = await fingerprint(newContent);
    await expect(verifyEvidencePack(JSON.stringify(downgrade))).rejects.toThrow(
      /v2が必要/,
    );
  });
  it('round-trips every demo incident without mutating its workspace', async () => {
    const original = JSON.stringify(demoWorkspaces);
    for (const snapshot of demoWorkspaces) {
      for (const finding of snapshot.findings) {
        const pack = await createEvidencePack(snapshot, finding);
        const verified = await verifyEvidencePack(JSON.stringify(pack));
        expect(verified).toEqual(pack);
        const before = buildIncident(snapshot, finding);
        const after = buildIncident(verified.payload, verified.payload.finding);
        expect(after).toMatchObject({
          affected: before.affected,
          evaluable: before.evaluable,
          excluded: before.excluded,
        });
      }
    }
    expect(JSON.stringify(demoWorkspaces)).toBe(original);
  });

  it('keeps validated data deeply immutable and independent of live state', async () => {
    const copy = structuredClone(workspace);
    const pack = await createEvidencePack(copy, copy.findings[0]!);
    copy.findings[0]!.title = 'Changed later';
    expect(pack.payload.finding.title).not.toBe('Changed later');
    expect(Object.isFrozen(pack.payload.finding.evidence.official)).toBe(true);
    expect(Object.isFrozen(pack.payload.runs)).toBe(true);
  });

  it('tolerates whitespace and key ordering but rejects changed evidence', async () => {
    const pack = await createEvidencePack(workspace, selected);
    const reordered = {
      fingerprint: pack.fingerprint,
      payload: {
        ...pack.payload,
        workspace: {
          isDemo: pack.payload.workspace.isDemo,
          canonicalDomain: pack.payload.workspace.canonicalDomain,
          displayName: pack.payload.workspace.displayName,
          name: pack.payload.workspace.name,
          id: pack.payload.workspace.id,
        },
      },
      exportedAt: pack.exportedAt,
      format: pack.format,
    };
    expect(
      await verifyEvidencePack(JSON.stringify(reordered, null, 4)),
    ).toEqual(pack);
    const tampered = structuredClone(pack);
    tampered.payload.finding.evidence.official.excerpt += 'Modified';
    await expect(verifyEvidencePack(JSON.stringify(tampered))).rejects.toThrow(
      'Fingerprintが一致しません',
    );
  });

  it('rejects unknown versions and fields instead of silently stripping them', async () => {
    const pack = await createEvidencePack(workspace, selected);
    await expect(
      verifyEvidencePack(
        JSON.stringify({ ...pack, format: 'mirror.evidence-pack.v99' }),
      ),
    ).rejects.toThrow('未対応');
    await expect(
      verifyEvidencePack(JSON.stringify({ ...pack, unexpected: 'hidden' })),
    ).rejects.toThrow('不正なフィールド');
    const extraNested = structuredClone(pack);
    Object.assign(extraNested.payload.finding, { extra: true });
    await expect(
      verifyEvidencePack(JSON.stringify(extraNested)),
    ).rejects.toThrow('不正なフィールド');
  });

  it('rejects malformed JSON and oversized input before parsing', async () => {
    await expect(verifyEvidencePack('{broken')).rejects.toThrow(
      'JSONを読み取れません',
    );
    await expect(
      verifyEvidencePack(' '.repeat(MAX_PACK_BYTES + 1)),
    ).rejects.toThrow('5 MB');
  });

  it('rejects duplicate IDs and missing references on export', async () => {
    const duplicate = structuredClone(workspace);
    duplicate.runs.push(duplicate.runs[0]!);
    await expect(createEvidencePack(duplicate, selected)).rejects.toThrow(
      '参照の欠落・重複',
    );
    const missing = structuredClone(workspace);
    missing.sources = [];
    await expect(createEvidencePack(missing, selected)).rejects.toThrow(
      '参照の欠落・重複',
    );
  });

  it('preserves the actual review notes without manufacturing history', async () => {
    const copy = structuredClone(workspace);
    const finding = copy.findings[0]!;
    const incidentRunIds = new Set(
      buildIncident(copy, finding).observations.map((row) => row.run.id),
    );
    const relatedByReview = copy.runs.find(
      (run) => !incidentRunIds.has(run.id),
    )!;
    finding.reviewHistory = [
      {
        id: 'review1',
        status: 'needs-evidence',
        note: '取得日時を確認したい。',
        at: '2026-09-04T00:00:00.000Z',
        runIds: [relatedByReview.id],
      },
    ];
    const pack = await createEvidencePack(copy, finding);
    expect(pack.payload.runs.some((run) => run.id === relatedByReview.id)).toBe(
      true,
    );
    expect(
      (await verifyEvidencePack(JSON.stringify(pack))).payload.finding
        .reviewHistory,
    ).toEqual(finding.reviewHistory);
  });
});
