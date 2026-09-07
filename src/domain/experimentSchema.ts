import { z } from 'zod';

const text = z.string().max(100_000);
const id = z.string().min(1).max(300);
const time = z.iso.datetime({ offset: true });
const list = <T extends z.ZodType>(item: T) => z.array(item).max(5000);
export const runInputSchema = z.strictObject({
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
const windowSchema = z.strictObject({ startAt: time, endAt: time });
const count = z.number().int().min(0).max(5000);
const tally = z.strictObject({
  runIds: list(id),
  excluded: list(
    z.strictObject({
      runId: id,
      reason: z.enum([
        'missing-input',
        'different-conditions',
        'invalid-assessments',
      ]),
    }),
  ),
  affected: count,
  notDetected: count,
  unassessed: count,
});
export const experimentPlanSchema = z.strictObject({
  schemaVersion: z.literal('mirror.experiment-plan.v1'),
  id,
  createdAt: time,
  claimId: id,
  kind: z.enum([
    'omission',
    'outdated',
    'contradiction',
    'misattribution',
    'weak-evidence',
  ]),
  cohort: z.strictObject({
    probeId: id,
    provider: z.enum(['chatgpt', 'gemini', 'perplexity', 'claude']),
    model: text,
    locale: text,
    searchEnabled: z.boolean(),
    origin: z.enum(['demo', 'manual', 'provider']),
    assessorId: text,
    observation: runInputSchema.shape.observation,
    targets: list(z.strictObject({ claimId: id, statement: text })),
  }),
  baselineWindow: windowSchema,
  baseline: tally,
  changedAt: time,
  changeSummary: z
    .string()
    .max(2000)
    .refine((value) => value.trim().length >= 4),
  followupWindow: windowSchema,
});
export const experimentEvaluationSchema = z.strictObject({
  id,
  recordedAt: time,
  note: z
    .string()
    .max(2000)
    .refine((value) => value.trim().length >= 4),
  followup: tally,
});
export const actionBriefSchema = z.strictObject({
  title: z.string().trim().min(4).max(200),
  hypothesis: z.string().trim().min(10).max(2000),
  owner: z.string().trim().min(1).max(100),
  channel: z.string().trim().min(1).max(100),
  dueDate: time,
});
export type ActionBriefInput = z.infer<typeof actionBriefSchema>;
