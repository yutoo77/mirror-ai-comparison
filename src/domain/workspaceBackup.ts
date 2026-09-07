import { z } from 'zod';
import {
  canonicalJson,
  fingerprint,
  freezeDeep,
  snapshotRecordSchemas as records,
} from './evidencePack';
import type { WorkspaceSnapshot } from './model';
import { isSafeHttpUrl } from './urls';
import { validateExperimentRecords } from './experiments';
import { hasSourceHistory, validateSourceHistory } from './sourceHistory';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const text = z.string().max(100_000);
const id = z.string().min(1).max(300);
const time = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().min(0).max(1_000_000);
const ratio = z.number().min(0).max(1);
const list = <T extends z.ZodType>(schema: T) => z.array(schema).max(5000);
const job = z.strictObject({
  jobId: id,
  probeId: id,
  provider: records.run.shape.provider,
  repeatIndex: count,
  observation: z.strictObject({
    subject: z.strictObject({
      displayName: text,
      canonicalDomain: text,
      aliases: list(text),
    }),
    question: text,
    locale: text,
    searchEnabled: z.boolean(),
  }),
  evaluationTargets: list(
    z.strictObject({
      claimId: id,
      statement: text,
      sourceId: id,
      sourceSnapshotHash: text,
    }),
  ),
});
const artifactBase = {
  schemaVersion: z.literal('mirror.artifact.v1'),
  artifactHash: text,
  campaignId: id,
  workspaceId: id,
  job,
  plannedAt: time,
  startedAt: time.nullable(),
  finishedAt: time,
};
const artifact = z.discriminatedUnion('status', [
  z.strictObject({
    ...artifactBase,
    status: z.literal('succeeded'),
    run: records.run,
  }),
  z.strictObject({
    ...artifactBase,
    status: z.literal('failed'),
    error: z.strictObject({
      code: z.enum([
        'adapter-not-found',
        'provider-error',
        'timeout',
        'invalid-response',
      ]),
      message: text,
      retriable: z.boolean(),
    }),
  }),
  z.strictObject({
    ...artifactBase,
    status: z.literal('cancelled'),
    reason: text,
  }),
]);
const campaign = z.strictObject({
  schemaVersion: z.literal('mirror.campaign.v1'),
  id,
  workspaceId: id,
  mode: z.enum(['demo', 'provider']),
  assessorId: text,
  artifactHash: text,
  status: z.enum([
    'planned',
    'running',
    'completed',
    'completed-with-errors',
    'cancelled',
  ]),
  plannedAt: time,
  startedAt: time.nullable(),
  completedAt: time.nullable(),
  plannedRunCount: count,
  artifacts: list(artifact),
});

export const workspaceSnapshotSchema = z.strictObject({
  workspace: z.strictObject({
    id,
    name: text,
    subject: z.strictObject({
      type: z.enum(['organization', 'brand', 'product', 'service']),
      displayName: text,
      canonicalDomain: text,
      industry: text,
      aliases: list(text),
      locales: list(text),
    }),
    objective: z.enum(['brand', 'product', 'recruiting', 'ir']),
    isDemo: z.boolean(),
    createdAt: time,
    lastMeasuredAt: time.nullable(),
    restoreHistory: list(
      z.strictObject({
        sourceWorkspaceId: id,
        backupFingerprint: hash,
        exportedAt: time,
        restoredAt: time,
      }),
    ).optional(),
  }),
  claims: list(records.claim),
  sources: list(records.source),
  probes: list(records.probe),
  runs: list(records.run),
  campaigns: list(campaign),
  findings: list(records.finding),
  actions: list(records.action),
  trend: list(
    z.strictObject({
      label: text,
      visibility: ratio,
      accuracy: ratio,
      evidence: ratio,
    }),
  ),
  activity: list(
    z.strictObject({
      id,
      type: z.enum(['run', 'review', 'source', 'action']),
      title: text,
      detail: text,
      at: time,
    }),
  ),
});
const backupSchema = z.strictObject({
  format: z.enum(['mirror.workspace-backup.v1', 'mirror.workspace-backup.v2', 'mirror.workspace-backup.v3']),
  exportedAt: time,
  snapshot: workspaceSnapshotSchema,
  fingerprint: z.strictObject({ algorithm: z.literal('SHA-256'), value: hash }),
});
export type WorkspaceBackup = z.infer<typeof backupSchema>;

export function validateWorkspaceReferences(snapshot: WorkspaceSnapshot): void {
  snapshot.sources.forEach(validateSourceHistory);
  validateExperimentRecords(snapshot, snapshot.actions, snapshot.findings);
  const fail = () => {
    throw new Error(
      'Workspace内の参照が欠落・重複しているか、Campaignの対応が不正です。',
    );
  };
  const unique = (items: { id: string }[]) => {
    const ids = new Set(items.map((item) => item.id));
    if (ids.size !== items.length) fail();
    return ids;
  };
  const claims = unique(snapshot.claims),
    sources = unique(snapshot.sources),
    probes = unique(snapshot.probes);
  const runs = unique(snapshot.runs),
    findings = unique(snapshot.findings),
    campaigns = unique(snapshot.campaigns);
  unique(snapshot.actions);
  unique(snapshot.activity);
  const workspaceIds = new Set([
    snapshot.workspace.id,
    ...(snapshot.workspace.restoreHistory ?? []).map(
      (item) => item.sourceWorkspaceId,
    ),
  ]);
  const allUrls: string[] = snapshot.sources.map((item) => item.url);
  for (const claim of snapshot.claims) if (!sources.has(claim.sourceId)) fail();
  for (const source of snapshot.sources)
    if (source.claimIds.some((value) => !claims.has(value))) fail();
  for (const probe of snapshot.probes) {
    if (
      new Set(probe.targetClaimIds).size !== probe.targetClaimIds.length ||
      probe.targetClaimIds.some((value) => !claims.has(value))
    )
      fail();
  }
  const validateRun = (run: WorkspaceSnapshot['runs'][number]) => {
    if (
      run.inputSnapshot?.evaluationTargets.some(
        (target) =>
          !claims.has(target.claimId) || !sources.has(target.sourceId),
      )
    )
      fail();
    if (
      !probes.has(run.probeId) ||
      run.assessments.some((item) => !claims.has(item.claimId))
    )
      fail();
    if (run.provenance.campaignId && !campaigns.has(run.provenance.campaignId))
      fail();
    allUrls.push(
      ...run.citationUrls,
      ...run.assessments.flatMap((item) =>
        item.citationUrl ? [item.citationUrl] : [],
      ),
    );
  };
  snapshot.runs.forEach(validateRun);
  for (const finding of snapshot.findings) {
    unique(finding.reviewHistory ?? []);
    if (
      !claims.has(finding.claimId) ||
      finding.evidence.official.claimId !== finding.claimId ||
      finding.probeIds.some((value) => !probes.has(value))
    )
      fail();
    if (
      finding.reviewHistory?.some((review) =>
        review.runIds?.some((value) => !runs.has(value)),
      )
    )
      fail();
    allUrls.push(finding.evidence.official.sourceUrl);
    if (finding.evidence.observed.citationUrl)
      allUrls.push(finding.evidence.observed.citationUrl);
  }
  if (snapshot.actions.some((item) => !findings.has(item.findingId))) fail();
  const runById = new Map(snapshot.runs.map((run) => [run.id, run]));
  const artifactRunIds = new Set<string>();
  for (const campaign of snapshot.campaigns) {
    if (!workspaceIds.has(campaign.workspaceId)) fail();
    unique(campaign.artifacts.map((item) => ({ id: item.job.jobId })));
    if (
      ['completed', 'completed-with-errors', 'cancelled'].includes(
        campaign.status,
      ) &&
      campaign.artifacts.length !== campaign.plannedRunCount
    )
      fail();
    for (const item of campaign.artifacts) {
      if (
        item.campaignId !== campaign.id ||
        item.workspaceId !== campaign.workspaceId ||
        !probes.has(item.job.probeId)
      )
        fail();
      if (
        item.job.evaluationTargets.some(
          (target) =>
            !claims.has(target.claimId) || !sources.has(target.sourceId),
        )
      )
        fail();
      if (item.status === 'succeeded') {
        validateRun(item.run);
        if (artifactRunIds.has(item.run.id)) fail();
        artifactRunIds.add(item.run.id);
        if (
          item.run.provenance.campaignId !== campaign.id ||
          item.run.provider !== item.job.provider ||
          item.run.probeId !== item.job.probeId ||
          item.run.repeatIndex !== item.job.repeatIndex ||
          (item.run.inputSnapshot &&
            canonicalJson(item.run.inputSnapshot) !==
              canonicalJson({
                observation: item.job.observation,
                evaluationTargets: item.job.evaluationTargets,
              }))
        )
          fail();
        const saved = runById.get(item.run.id);
        if (!saved || canonicalJson(saved) !== canonicalJson(item.run)) fail();
      }
    }
  }
  if (
    snapshot.runs.some(
      (run) => run.provenance.campaignId && !artifactRunIds.has(run.id),
    )
  )
    fail();
  if (allUrls.some((value) => !isSafeHttpUrl(value)))
    throw new Error(
      '復元できないURLが含まれています。認証情報を含まないHTTP(S) URLだけを使用してください。',
    );
}

function checkSize(json: string) {
  if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES)
    throw new Error('バックアップは20 MB以内にしてください。');
}

export async function createWorkspaceBackup(
  snapshot: WorkspaceSnapshot,
): Promise<WorkspaceBackup> {
  const parsed = workspaceSnapshotSchema.safeParse(snapshot);
  if (!parsed.success)
    throw new Error(
      'Workspaceの形式または項目数がバックアップ仕様に合いません。',
    );
  validateWorkspaceReferences(parsed.data);
  const content = {
    format: hasSourceHistory(parsed.data.sources) || parsed.data.findings.some((finding) => finding.evidence.official.capturedAt === null)
      ? 'mirror.workspace-backup.v3' as const
      : 'mirror.workspace-backup.v2' as const,
    exportedAt: new Date().toISOString(),
    snapshot: parsed.data,
  };
  const backup: WorkspaceBackup = {
    ...content,
    fingerprint: { algorithm: 'SHA-256', value: await fingerprint(content) },
  };
  checkSize(JSON.stringify(backup, null, 2));
  return freezeDeep(backup);
}

export async function verifyWorkspaceBackup(
  json: string,
): Promise<WorkspaceBackup> {
  checkSize(json);
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    throw new Error('バックアップのJSONを読み取れませんでした。');
  }
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      '未対応の形式・バージョン、または不正な項目です。Workspaceバックアップv1/v2/v3を選んでください。',
    );
  const { fingerprint: saved, ...content } = parsed.data;
  if (!parsed.data.format.endsWith('.v3') && (hasSourceHistory(parsed.data.snapshot.sources) || parsed.data.snapshot.findings.some((finding) => finding.evidence.official.capturedAt === null)))
    throw new Error('資料の版履歴・原文未収録の情報を含むバックアップにはv3が必要です。');
  if (
    parsed.data.format.endsWith('.v1') &&
    (parsed.data.snapshot.runs.some((run) => run.inputSnapshot) ||
      parsed.data.snapshot.actions.some(
        (action) => action.measurementPlan || action.evaluations,
      ))
  )
    throw new Error('検証条件付きのバックアップにはv2が必要です。');
  if ((await fingerprint(content)) !== saved.value)
    throw new Error(
      'Fingerprintが一致しません。ファイルが変更または破損しています。',
    );
  validateWorkspaceReferences(parsed.data.snapshot);
  return freezeDeep(parsed.data);
}

/** Only the local container gets a fresh identity. Historical artifact bytes stay unchanged. */
export async function restoreWorkspaceCopy(
  backup: WorkspaceBackup,
): Promise<WorkspaceSnapshot> {
  const verified = await verifyWorkspaceBackup(JSON.stringify(backup));
  const snapshot: WorkspaceSnapshot = structuredClone(verified.snapshot);
  const restoredAt = new Date().toISOString();
  snapshot.workspace = {
    ...snapshot.workspace,
    id: `workspace-restored-${crypto.randomUUID()}`,
    name: `${snapshot.workspace.subject.displayName} · 復元 ${new Date(restoredAt).toLocaleString('ja-JP')}`,
    restoreHistory: [
      ...(snapshot.workspace.restoreHistory ?? []),
      {
        sourceWorkspaceId: verified.snapshot.workspace.id,
        backupFingerprint: verified.fingerprint.value,
        exportedAt: verified.exportedAt,
        restoredAt,
      },
    ],
  };
  return snapshot;
}
