import type { Source, SourceSnapshot, WorkspaceSnapshot } from './model';

export const MAX_SOURCE_TEXT = 100_000;
export const MAX_SOURCE_HISTORY = 50;

export interface SourceUpdateInput {
  expectedHash: string;
  excerpt: string;
  note: string;
}

export interface SourceClaimReviewInput {
  expectedHash: string;
  statement: string;
}

/** Hashes identify saved text, not its truth, author, or the live URL's contents. */
export function resolveSourceVersion(source: Source, hash: string): SourceSnapshot | null {
  if (!hash) return null;
  const matches = [source.snapshot, ...(source.history ?? [])].filter(
    (version) => version.sha256 === hash,
  );
  if (!matches.length || new Set(matches.map((version) => version.excerpt)).size !== 1)
    return null;
  return matches[0]!;
}

export function validateSourceHistory(source: Source): void {
  if ((source.history?.length ?? 0) > MAX_SOURCE_HISTORY)
    throw new Error(`資料の過去版は${MAX_SOURCE_HISTORY}件まで保存できます。`);
  const versions = [source.snapshot, ...(source.history ?? [])];
  const textByHash = new Map<string, string>();
  for (const version of versions) {
    if (textByHash.has(version.sha256) && textByHash.get(version.sha256) !== version.excerpt)
      throw new Error('同じ識別情報に異なる資料本文が含まれています。');
    textByHash.set(version.sha256, version.excerpt);
  }
}

export function hasSourceHistory(sources: Source[]): boolean {
  return sources.some((source) => source.history !== undefined || source.snapshot.revisionNote !== undefined);
}

export function sourceImpact(workspace: WorkspaceSnapshot, sourceId: string) {
  const claims = workspace.claims.filter((claim) => claim.sourceId === sourceId);
  const claimIds = new Set(claims.map((claim) => claim.id));
  const probes = workspace.probes.filter((probe) => probe.targetClaimIds.some((id) => claimIds.has(id)));
  const probeById = new Map(workspace.probes.map((probe) => [probe.id, probe]));
  const runs = workspace.runs.filter((run) =>
    run.inputSnapshot
      ? run.inputSnapshot.evaluationTargets.some((target) => target.sourceId === sourceId)
      : probeById.get(run.probeId)?.targetClaimIds.some((id) => claimIds.has(id)),
  );
  return { claims, probes, runs };
}

export async function prepareSourceVersion(
  source: Source,
  input: SourceUpdateInput,
  capturedAt = new Date().toISOString(),
): Promise<SourceSnapshot> {
  validateSourceHistory(source);
  if (source.snapshot.sha256 !== input.expectedHash)
    throw new Error('編集中に資料が更新されました。現在の版を開き直してください。');
  if ((source.history?.length ?? 0) >= MAX_SOURCE_HISTORY)
    throw new Error(`過去版の保存上限（${MAX_SOURCE_HISTORY}件）です。履歴は削除していません。`);
  const excerpt = input.excerpt.trim();
  const note = input.note.trim();
  if (excerpt.length < 10 || excerpt.length > MAX_SOURCE_TEXT)
    throw new Error('原文は10〜100,000文字で入力してください。');
  if (excerpt === source.snapshot.excerpt.trim())
    throw new Error('保存済みの原文と同じ内容です。新しい版は作りません。');
  if (!note || note.length > 1000)
    throw new Error('更新メモを1〜1,000文字で入力してください。');
  if (!Number.isFinite(Date.parse(capturedAt)))
    throw new Error('保存日時を確認してください。');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(excerpt));
  return {
    capturedAt,
    excerpt,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    parserVersion: 'local-manual-v2',
    revisionNote: note,
  };
}

/** Conservatively queues linked claims, without changing any saved answer or verdict. */
export function applySourceVersion(
  workspace: WorkspaceSnapshot,
  sourceId: string,
  expectedHash: string,
  version: SourceSnapshot,
): WorkspaceSnapshot {
  const sources = workspace.sources.filter((source) => source.id === sourceId);
  const source = sources.length === 1 ? sources[0] : undefined;
  if (!source || source.snapshot.sha256 !== expectedHash)
    throw new Error('資料の版が変わったため保存できません。現在の版を開き直してください。');
  if (version.excerpt.trim() === source.snapshot.excerpt.trim())
    throw new Error('保存済みの原文と同じ内容です。');
  const updated: Source = {
    ...source,
    status: 'changed',
    history: [...(source.history ?? []), structuredClone(source.snapshot)],
    snapshot: structuredClone(version),
  };
  validateSourceHistory(updated);
  return {
    ...workspace,
    sources: workspace.sources.map((item) => item.id === sourceId ? updated : item),
    claims: workspace.claims.map((claim) =>
      claim.sourceId === sourceId && claim.status !== 'draft'
        ? { ...claim, status: 'review-due' }
        : claim,
    ),
    activity: [{
      id: `source-update-${crypto.randomUUID()}`,
      type: 'source',
      title: '原文の新しい版を保存しました',
      detail: `${source.title} · ${version.revisionNote ?? ''}`,
      at: version.capturedAt,
    }, ...workspace.activity],
  };
}

export function reviewSourceClaim(
  workspace: WorkspaceSnapshot,
  claimId: string,
  input: SourceClaimReviewInput,
  reviewedAt = new Date().toISOString(),
): WorkspaceSnapshot {
  const claim = workspace.claims.find((item) => item.id === claimId);
  const source = workspace.sources.find((item) => item.id === claim?.sourceId);
  if (!claim || !source || source.snapshot.sha256 !== input.expectedHash)
    throw new Error('資料が更新されています。現在の原文で確認し直してください。');
  const statement = input.statement.trim();
  if (statement.length < 10 || statement.length > 2000)
    throw new Error('確認項目は10〜2,000文字で入力してください。');
  const claims = workspace.claims.map((item) => item.id === claimId
    ? { ...item, statement, status: 'verified' as const, reviewedAt }
    : item);
  const allReviewed = claims.filter((item) => item.sourceId === source.id)
    .every((item) => item.status === 'verified');
  return {
    ...workspace,
    claims,
    sources: workspace.sources.map((item) => item.id === source.id && allReviewed
      ? { ...item, status: 'current' }
      : item),
    activity: [{
      id: `claim-review-${crypto.randomUUID()}`,
      type: 'review',
      title: '原文を確認して確認項目を保存しました',
      detail: `${source.title} · ${input.expectedHash}\n変更前: ${claim.statement}\n確認後: ${statement}`,
      at: reviewedAt,
    }, ...workspace.activity],
  };
}

/** A bounded, literal text comparison; not a semantic claim-change detector. */
export function compareSourceText(before: string, after: string) {
  const left = Array.from(before), right = Array.from(after);
  let start = 0, end = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  while (end < left.length - start && end < right.length - start &&
    left[left.length - 1 - end] === right[right.length - 1 - end]) end++;
  return {
    prefix: left.slice(0, start).join(''),
    before: left.slice(start, left.length - end).join(''),
    after: right.slice(start, right.length - end).join(''),
    suffix: end ? left.slice(left.length - end).join('') : '',
  };
}
