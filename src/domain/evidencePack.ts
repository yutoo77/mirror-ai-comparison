import { z } from 'zod';
import type { Finding, WorkspaceSnapshot } from './model';
import { buildIncident } from './incident';
import { fingerprint, freezeDeep } from './integrity';
import {
  experimentEvaluationSchema,
  experimentPlanSchema,
  runInputSchema,
} from './experimentSchema';
import { validateExperimentRecords } from './experiments';
import { hasSourceHistory, MAX_SOURCE_HISTORY, validateSourceHistory } from './sourceHistory';
export { canonicalJson, fingerprint, freezeDeep } from './integrity';

export const MAX_PACK_BYTES = 5 * 1024 * 1024;
const text = z.string().max(100_000);
const id = z.string().min(1).max(300);
const timestamp = z.iso.datetime({ offset: true });
const ratio = z.number().min(0).max(1);
const count = z.number().int().min(0).max(1_000_000);
const list = <T extends z.ZodType>(schema: T) => z.array(schema).max(5000);
const provider = z.enum(['chatgpt', 'gemini', 'perplexity', 'claude']);
const actor = z.enum(['fixture', 'human', 'system']);
const review = z.enum([
  'unreviewed',
  'confirmed',
  'dismissed',
  'needs-evidence',
]);
const evidence = z.enum([
  'reported-url',
  'fetched',
  'passage-match',
  'human-verified',
  'none',
]);
// URLs are retained as inert evidence text. The viewer never follows or fetches them.
const assessment = z.strictObject({
  claimId: id,
  visibility: z.enum(['mentioned', 'omitted', 'not-applicable']),
  factuality: z.enum([
    'accurate',
    'partial',
    'contradicted',
    'unsupported',
    'not-assessed',
  ]),
  attribution: z.enum([
    'correct',
    'misattributed',
    'ambiguous',
    'not-applicable',
  ]),
  evidence,
  confidence: ratio,
  rationale: text,
  observedExcerpt: text.optional(),
  citationUrl: text.optional(),
  assessedBy: actor.optional(),
  assessedAt: timestamp.optional(),
});
const claim = z.strictObject({
  id,
  statement: text,
  category: text,
  sourceId: id,
  status: z.enum(['verified', 'review-due', 'draft']),
  owner: text,
  reviewedAt: timestamp,
  validFrom: timestamp,
});
const sourceSnapshot = z.strictObject({
  capturedAt: timestamp,
  excerpt: text,
  sha256: text,
  parserVersion: text,
  revisionNote: z.string().min(1).max(1000).optional(),
});
const source = z.strictObject({
  id,
  title: text,
  url: text,
  type: z.enum(['web', 'pdf', 'manual']),
  status: z.enum(['current', 'review-due', 'changed']),
  owner: text,
  claimIds: list(id),
  snapshot: sourceSnapshot,
  history: z.array(sourceSnapshot).max(MAX_SOURCE_HISTORY).optional(),
});
const probe = z.strictObject({
  id,
  question: text,
  audience: text,
  intent: text,
  providers: list(provider),
  repetitions: count,
  locale: text,
  status: z.enum(['active', 'draft', 'paused']),
  targetClaimIds: list(id),
  lastRunAt: timestamp.nullable(),
  nextRunAt: timestamp.nullable(),
});
const run = z.strictObject({
  inputSnapshot: runInputSchema.optional(),
  id,
  probeId: id,
  provider,
  model: text,
  repeatIndex: count,
  executedAt: timestamp,
  locale: text,
  searchEnabled: z.boolean(),
  answer: text,
  citationUrls: list(text),
  assessments: list(assessment),
  provenance: z.strictObject({
    origin: z.enum(['demo', 'manual', 'provider']),
    schemaVersion: z.literal('mirror.run.v1'),
    assessorId: text,
    recordedAt: timestamp,
    recordedBy: actor,
    artifactHash: text,
    campaignId: id.nullable(),
  }),
});
const finding = z.strictObject({
  id,
  title: text,
  summary: text,
  kind: z.enum([
    'omission',
    'outdated',
    'contradiction',
    'misattribution',
    'weak-evidence',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['open', 'monitoring', 'resolved']),
  reviewStatus: review,
  reviewHistory: list(
    z.strictObject({
      id,
      status: review,
      note: z.string().min(1).max(2000),
      at: timestamp,
      runIds: list(id).optional(),
    }),
  ).optional(),
  claimId: id,
  probeIds: list(id),
  providers: list(provider),
  occurrenceRate: ratio,
  previousOccurrenceRate: ratio,
  runCount: count,
  firstSeenAt: timestamp,
  lastSeenAt: timestamp,
  evidence: z.strictObject({
    evidenceState: evidence,
    official: z.strictObject({
      claimId: id,
      statement: text,
      excerpt: text,
      sourceTitle: text,
      sourceUrl: text,
      capturedAt: timestamp.nullable(),
    }),
    observed: z.strictObject({
      excerpt: text,
      provider,
      model: text,
      executedAt: timestamp,
      citationUrl: text.nullable(),
    }),
    rationale: text,
    confidence: ratio,
  }),
});
const measurement = z.strictObject({
  label: text,
  value: ratio,
  runCount: count,
  measuredAt: timestamp,
});
const action = z.strictObject({
  measurementPlan: experimentPlanSchema.optional(),
  evaluations: list(experimentEvaluationSchema).optional(),
  id,
  findingId: id,
  title: text,
  hypothesis: text,
  status: z.enum(['draft', 'planned', 'in-progress', 'measuring', 'completed']),
  owner: text,
  dueDate: timestamp,
  targetMetric: text,
  channel: text,
  before: measurement,
  after: measurement.nullable(),
  createdAt: timestamp,
});
const payloadSchema = z.strictObject({
  workspace: z.strictObject({
    id,
    name: text,
    displayName: text,
    canonicalDomain: text,
    isDemo: z.boolean(),
  }),
  finding,
  claims: list(claim),
  sources: list(source),
  probes: list(probe),
  runs: list(run),
  actions: list(action),
});
// Shared records keep incident exports and full backups on the same validation contract.
export const snapshotRecordSchemas = {
  claim,
  source,
  probe,
  run,
  finding,
  action,
};
const packSchema = z.strictObject({
  format: z.enum(['mirror.evidence-pack.v1', 'mirror.evidence-pack.v2', 'mirror.evidence-pack.v3']),
  exportedAt: timestamp,
  payload: payloadSchema,
  fingerprint: z.strictObject({
    algorithm: z.literal('SHA-256'),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});
export type EvidencePack = z.infer<typeof packSchema>;

function validateReferences(payload: EvidencePack['payload']) {
  payload.sources.forEach(validateSourceHistory);
  validateExperimentRecords(payload, payload.actions, [payload.finding]);
  const fail = () => {
    throw new Error(
      '参照の欠落・重複があります。元のWorkspaceを確認してください。',
    );
  };
  const uniqueIds = (items: { id: string }[]) => {
    const ids = new Set(items.map((item) => item.id));
    if (ids.size !== items.length) fail();
    return ids;
  };
  const claimIds = uniqueIds(payload.claims);
  const sourceIds = uniqueIds(payload.sources);
  const probeIds = uniqueIds(payload.probes);
  const runIds = uniqueIds(payload.runs);
  uniqueIds(payload.actions);
  uniqueIds(payload.finding.reviewHistory ?? []);
  if (
    !claimIds.has(payload.finding.claimId) ||
    payload.finding.evidence.official.claimId !== payload.finding.claimId
  )
    fail();
  if (payload.finding.probeIds.some((value) => !probeIds.has(value))) fail();
  if (payload.claims.some((item) => !sourceIds.has(item.sourceId))) fail();
  if (
    payload.sources.some((item) =>
      item.claimIds.some((value) => !claimIds.has(value)),
    )
  )
    fail();
  if (
    payload.probes.some((item) =>
      item.targetClaimIds.some((value) => !claimIds.has(value)),
    )
  )
    fail();
  if (
    payload.runs.some(
      (item) =>
        !probeIds.has(item.probeId) ||
        item.assessments.some((a) => !claimIds.has(a.claimId)) ||
        item.inputSnapshot?.evaluationTargets.some(
          (target) =>
            !claimIds.has(target.claimId) || !sourceIds.has(target.sourceId),
        ),
    )
  )
    fail();
  if (payload.actions.some((item) => item.findingId !== payload.finding.id))
    fail();
  if (
    payload.finding.reviewHistory?.some((item) =>
      item.runIds?.some((value) => !runIds.has(value)),
    )
  )
    fail();
}

function checkSize(json: string) {
  if (new TextEncoder().encode(json).byteLength > MAX_PACK_BYTES)
    throw new Error('監査パックは5 MB以内にしてください。');
}

export async function createEvidencePack(
  workspace: WorkspaceSnapshot,
  selected: Finding,
): Promise<EvidencePack> {
  const linkedActions = workspace.actions.filter(
    (item) => item.findingId === selected.id,
  );
  const savedRunIds = new Set([
    ...(selected.reviewHistory ?? []).flatMap((review) => review.runIds ?? []),
    ...linkedActions.flatMap((item) =>
      item.measurementPlan
        ? [
            ...item.measurementPlan.baseline.runIds,
            ...item.measurementPlan.baseline.excluded.map((row) => row.runId),
            ...(item.evaluations ?? []).flatMap((result) => [
              ...result.followup.runIds,
              ...result.followup.excluded.map((row) => row.runId),
            ]),
          ]
        : [],
    ),
  ]);
  const incidentRuns = buildIncident(workspace, selected).observations.map(
    (row) => row.run,
  );
  const runs = workspace.runs.filter(
    (run) =>
      savedRunIds.has(run.id) ||
      incidentRuns.some((item) => item.id === run.id),
  );
  const probeIds = new Set([
    ...selected.probeIds,
    ...runs.map((item) => item.probeId),
  ]);
  const probes = workspace.probes.filter((item) => probeIds.has(item.id));
  const claimIds = new Set([
    selected.claimId,
    ...probes.flatMap((item) => item.targetClaimIds),
    ...runs.flatMap((item) => item.assessments.map((a) => a.claimId)),
    ...runs.flatMap(
      (item) =>
        item.inputSnapshot?.evaluationTargets.map((target) => target.claimId) ??
        [],
    ),
  ]);
  const claims = workspace.claims.filter((item) => claimIds.has(item.id));
  const sourceIds = new Set([
    ...claims.map((item) => item.sourceId),
    ...runs.flatMap(
      (item) =>
        item.inputSnapshot?.evaluationTargets.map(
          (target) => target.sourceId,
        ) ?? [],
    ),
  ]);
  const parsed = payloadSchema.safeParse({
    workspace: {
      id: workspace.workspace.id,
      name: workspace.workspace.name,
      ...{
        displayName: workspace.workspace.subject.displayName,
        canonicalDomain: workspace.workspace.subject.canonicalDomain,
        isDemo: workspace.workspace.isDemo,
      },
    },
    finding: selected,
    claims,
    sources: workspace.sources
      .filter((item) => sourceIds.has(item.id))
      .map((item) => ({
        ...item,
        claimIds: item.claimIds.filter((value) => claimIds.has(value)),
      })),
    probes,
    runs,
    actions: workspace.actions.filter((item) => item.findingId === selected.id),
  });
  if (!parsed.success)
    throw new Error(
      '保存データの形式または項目数が監査パックの仕様に合いません。元のWorkspaceを確認してください。',
    );
  const payload = parsed.data;
  validateReferences(payload);
  const content = {
    format: hasSourceHistory(payload.sources) || payload.finding.evidence.official.capturedAt === null
      ? 'mirror.evidence-pack.v3' as const
      : 'mirror.evidence-pack.v2' as const,
    exportedAt: new Date().toISOString(),
    payload,
  };
  const pack: EvidencePack = {
    ...content,
    fingerprint: { algorithm: 'SHA-256', value: await fingerprint(content) },
  };
  checkSize(JSON.stringify(pack, null, 2));
  return freezeDeep(pack);
}

export async function verifyEvidencePack(json: string): Promise<EvidencePack> {
  checkSize(json);
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    throw new Error(
      'JSONを読み取れませんでした。監査パックのJSONファイルを選んでください。',
    );
  }
  const parsed = packSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      '未対応の形式・バージョン、または不正なフィールドです。監査パックv1/v2/v3が必要です。',
    );
  const { fingerprint: saved, ...content } = parsed.data;
  if (!parsed.data.format.endsWith('.v3') && (hasSourceHistory(parsed.data.payload.sources) || parsed.data.payload.finding.evidence.official.capturedAt === null))
    throw new Error('資料の版履歴・原文未収録の情報を含む監査パックにはv3が必要です。');
  if (
    parsed.data.format.endsWith('.v1') &&
    (parsed.data.payload.runs.some((run) => run.inputSnapshot) ||
      parsed.data.payload.actions.some(
        (action) => action.measurementPlan || action.evaluations,
      ))
  )
    throw new Error('検証条件付きの監査パックにはv2が必要です。');
  if ((await fingerprint(content)) !== saved.value)
    throw new Error(
      'Fingerprintが一致しません。内容が変更されたか、ファイルが破損しています。',
    );
  validateReferences(parsed.data.payload);
  return freezeDeep(parsed.data);
}
