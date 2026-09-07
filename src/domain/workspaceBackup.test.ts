import { describe, expect, it } from 'vitest';
import { demoWorkspaces } from '../data/demoWorkspaces';
import { canonicalJson, fingerprint } from './evidencePack';
import {
  createWorkspaceBackup,
  MAX_BACKUP_BYTES,
  restoreWorkspaceCopy,
  verifyWorkspaceBackup,
} from './workspaceBackup';
import { planCampaign } from '../execution/planCampaign';
import { executeCampaign } from '../execution/executeCampaign';
import { createDeterministicDemoAdapters } from '../execution/demoAdapter';
import { RuleBasedDemoAssessor } from '../execution/demoAssessor';
import { applySourceVersion, prepareSourceVersion } from './sourceHistory';

const fixture = demoWorkspaces[0]!;
async function withCampaign(
  mode: 'success' | 'failure' | 'cancelled' = 'success',
  base = fixture,
  campaignId = 'backup-campaign',
) {
  const snapshot = structuredClone(base);
  const plan = planCampaign(snapshot, {
    campaignId,
    plannedAt: '2026-09-05T00:00:00.000Z',
    mode: 'demo',
  });
  const control = new AbortController();
  if (mode === 'cancelled') control.abort();
  const campaign = await executeCampaign(plan, {
    adapters:
      mode === 'failure'
        ? []
        : createDeterministicDemoAdapters([
            'chatgpt',
            'gemini',
            'perplexity',
            'claude',
          ]),
    assessor: new RuleBasedDemoAssessor(),
    signal: control.signal,
    now: () => '2026-09-05T00:00:01.000Z',
    createRunId: (job) => `backup-${job.jobId}`,
  });
  snapshot.campaigns.push(campaign);
  snapshot.runs.push(
    ...campaign.artifacts.flatMap((item) =>
      item.status === 'succeeded' ? [item.run] : [],
    ),
  );
  return snapshot;
}

describe('full Workspace backups', () => {
  it('round-trips source history in v3, detects tampering, and forbids a silent downgrade', async () => {
    const snapshot = structuredClone(fixture);
    const source = snapshot.sources[0]!;
    const input = { expectedHash: source.snapshot.sha256, excerpt: '対象プランと地域を含む更新後の公式原文です。', note: '条件が追加されたため。' };
    const version = await prepareSourceVersion(source, input);
    const updated = applySourceVersion(snapshot, source.id, input.expectedHash, version);
    const backup = await createWorkspaceBackup(updated);
    expect(backup.format).toBe('mirror.workspace-backup.v3');
    expect((await restoreWorkspaceCopy(backup)).sources[0]!.history).toEqual([source.snapshot]);
    const tampered = structuredClone(backup);
    tampered.snapshot.sources[0]!.history![0]!.excerpt = '変更された過去の原文です。';
    await expect(verifyWorkspaceBackup(JSON.stringify(tampered))).rejects.toThrow(/Fingerprint/);
    const downgraded = structuredClone(backup);
    downgraded.format = 'mirror.workspace-backup.v2';
    const { fingerprint: ignored, ...content } = downgraded;
    void ignored;
    downgraded.fingerprint.value = await fingerprint(content);
    await expect(verifyWorkspaceBackup(JSON.stringify(downgraded))).rejects.toThrow(/v3が必要/);
  });
  it('reads legacy v1 and requires v2 for captured campaign inputs', async () => {
    const legacy = structuredClone(await createWorkspaceBackup(fixture));
    legacy.format = 'mirror.workspace-backup.v1';
    const { fingerprint: _legacyHash, ...legacyContent } = legacy;
    void _legacyHash;
    legacy.fingerprint.value = await fingerprint(legacyContent);
    expect(await verifyWorkspaceBackup(JSON.stringify(legacy))).toEqual(legacy);
    const current = structuredClone(
      await createWorkspaceBackup(await withCampaign()),
    );
    current.format = 'mirror.workspace-backup.v1';
    const { fingerprint: _newHash, ...newContent } = current;
    void _newHash;
    current.fingerprint.value = await fingerprint(newContent);
    await expect(
      verifyWorkspaceBackup(JSON.stringify(current)),
    ).rejects.toThrow(/v2が必要/);
  });

  it('rejects a captured input that disagrees with its campaign job', async () => {
    const snapshot = structuredClone(await withCampaign());
    const first = snapshot.campaigns[0]!.artifacts[0]!;
    if (first.status !== 'succeeded') throw new Error('Expected success');
    // Both copies are deliberately changed together; the independent job still protects the capture contract.
    first.run.inputSnapshot!.observation.question += ' changed';
    snapshot.runs = snapshot.runs.map((run) =>
      run.id === first.run.id ? first.run : run,
    );
    await expect(createWorkspaceBackup(snapshot)).rejects.toThrow(/Campaign/);
  });
  it('accepts new Campaigns on a restored copy without changing ancestor evidence', async () => {
    const original = await withCampaign();
    const copy = await restoreWorkspaceCopy(
      await createWorkspaceBackup(original),
    );
    const continued = await withCampaign(
      'success',
      copy,
      'post-restore-campaign',
    );
    expect(continued.campaigns[0]).toEqual(original.campaigns[0]);
    expect(continued.campaigns[1]!.workspaceId).toBe(copy.workspace.id);
    const checked = await verifyWorkspaceBackup(
      JSON.stringify(await createWorkspaceBackup(continued)),
    );
    expect(checked.snapshot.campaigns).toHaveLength(2);
    expect(checked.snapshot.workspace.restoreHistory).toHaveLength(1);
  });

  it('round-trips complete demo workspaces, including trends and activities', async () => {
    for (const snapshot of demoWorkspaces) {
      const backup = await createWorkspaceBackup(snapshot);
      expect(
        (await verifyWorkspaceBackup(JSON.stringify(backup))).snapshot,
      ).toEqual(snapshot);
      expect(Object.isFrozen(backup.snapshot.sources[0]!.snapshot)).toBe(true);
    }
  });

  it('restores independent copies and preserves all historical Campaign bytes and hashes', async () => {
    const snapshot = await withCampaign();
    const before = canonicalJson(snapshot);
    const backup = await createWorkspaceBackup(snapshot);
    const copy = await restoreWorkspaceCopy(backup);
    expect(copy.workspace.id).not.toBe(snapshot.workspace.id);
    expect(copy.workspace.isDemo).toBe(true);
    expect(copy.workspace.restoreHistory?.[0]).toMatchObject({
      sourceWorkspaceId: snapshot.workspace.id,
      backupFingerprint: backup.fingerprint.value,
    });
    expect(canonicalJson(copy.campaigns)).toBe(
      canonicalJson(snapshot.campaigns),
    );
    expect(canonicalJson(copy.runs)).toBe(canonicalJson(snapshot.runs));
    copy.claims[0]!.statement = 'A local change';
    expect(canonicalJson(snapshot)).toBe(before);
    expect(backup.snapshot.claims[0]!.statement).not.toBe('A local change');
    expect(await createWorkspaceBackup(copy)).toBeDefined();
  });

  it.each(['failure', 'cancelled'] as const)(
    'retains every %s job in the ledger',
    async (mode) => {
      const snapshot = await withCampaign(mode);
      const restored = await restoreWorkspaceCopy(
        await createWorkspaceBackup(snapshot),
      );
      expect(restored.campaigns).toEqual(snapshot.campaigns);
      expect(restored.campaigns[0]!.artifacts.length).toBeGreaterThan(0);
      expect(
        restored.campaigns[0]!.artifacts.every(
          (item) =>
            item.status === (mode === 'failure' ? 'failed' : 'cancelled'),
        ),
      ).toBe(true);
    },
  );

  it('can back up a restored copy and restore it again without rewriting the original IDs', async () => {
    const snapshot = await withCampaign();
    const first = await restoreWorkspaceCopy(
      await createWorkspaceBackup(snapshot),
    );
    const second = await restoreWorkspaceCopy(
      await createWorkspaceBackup(first),
    );
    expect(second.workspace.restoreHistory).toHaveLength(2);
    expect(second.campaigns[0]!.workspaceId).toBe(snapshot.workspace.id);
    expect(second.workspace.id).not.toBe(first.workspace.id);
  });

  it('rejects tampering, unknown versions and evidence packs', async () => {
    const backup = await createWorkspaceBackup(fixture);
    await expect(
      verifyWorkspaceBackup(
        JSON.stringify({ ...backup, format: 'mirror.evidence-pack.v1' }),
      ),
    ).rejects.toThrow('未対応');
    const changed = structuredClone(backup);
    changed.snapshot.workspace.name = 'Changed';
    await expect(
      verifyWorkspaceBackup(JSON.stringify(changed)),
    ).rejects.toThrow('Fingerprintが一致しません');
    await expect(
      verifyWorkspaceBackup(JSON.stringify({ ...backup, unexpected: true })),
    ).rejects.toThrow('不正な項目');
  });

  it('rejects duplicate identities and dangling references even with a matching checksum', async () => {
    const backup = structuredClone(await createWorkspaceBackup(fixture));
    backup.snapshot.claims[0]!.sourceId = 'missing';
    const { fingerprint: _old, ...content } = backup;
    void _old;
    backup.fingerprint.value = await fingerprint(content);
    await expect(verifyWorkspaceBackup(JSON.stringify(backup))).rejects.toThrow(
      '参照',
    );
    const duplicate = structuredClone(fixture);
    duplicate.runs.push(duplicate.runs[0]!);
    await expect(createWorkspaceBackup(duplicate)).rejects.toThrow('重複');
  });

  it('rejects executable URLs and URLs with credentials before they can enter the app', async () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script/>',
      'https://user:secret@example.com',
    ]) {
      const copy = structuredClone(fixture);
      copy.sources[0]!.url = url;
      await expect(createWorkspaceBackup(copy)).rejects.toThrow('HTTP(S)');
    }
  });

  it('rejects missing Campaign artifacts and mismatched nested Run records', async () => {
    const snapshot = await withCampaign();
    const first = snapshot.campaigns[0]!.artifacts[0]!;
    if (first.status !== 'succeeded')
      throw new Error('Expected succeeded fixture');
    const changed = structuredClone(snapshot);
    // structuredClone preserves shared references; replace one side deliberately.
    changed.runs = changed.runs.map((run) =>
      run.id === first.run.id
        ? { ...run, answer: run.answer + 'Modified' }
        : run,
    );
    await expect(createWorkspaceBackup(changed)).rejects.toThrow('Campaign');
    const missing = structuredClone(snapshot);
    missing.campaigns[0]!.artifacts.pop();
    await expect(createWorkspaceBackup(missing)).rejects.toThrow('Campaign');
  });

  it('rejects orphan campaign Runs and duplicate artifact Run IDs', async () => {
    const snapshot = await withCampaign();
    const first = snapshot.campaigns[0]!.artifacts[0]!;
    if (first.status !== 'succeeded')
      throw new Error('Expected succeeded fixture');
    const orphan = structuredClone(snapshot);
    orphan.runs.push({ ...first.run, id: 'orphan-run' });
    await expect(createWorkspaceBackup(orphan)).rejects.toThrow('Campaign');
    const duplicate = structuredClone(snapshot);
    duplicate.campaigns[0]!.artifacts.push({
      ...first,
      job: { ...first.job, jobId: 'duplicate-job' },
    });
    duplicate.campaigns[0]!.plannedRunCount += 1;
    await expect(createWorkspaceBackup(duplicate)).rejects.toThrow('Campaign');
  });

  it('fails closed for broken or oversized files', async () => {
    await expect(verifyWorkspaceBackup('{bad')).rejects.toThrow(
      '読み取れません',
    );
    await expect(
      verifyWorkspaceBackup(' '.repeat(MAX_BACKUP_BYTES + 1)),
    ).rejects.toThrow('20 MB');
  });
});
