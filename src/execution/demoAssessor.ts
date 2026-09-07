import type { ClaimAssessment } from '../domain/model';
import type { AnswerAssessor, AssessmentContext, AssessmentRequest } from './contracts';

const MIN_FUZZY_TARGET_LENGTH = 12;
const MENTION_THRESHOLD = 0.68;

const normalize = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

function abortError(): Error {
  return new DOMException('The assessment was cancelled.', 'AbortError');
}

function bigrams(value: string): string[] {
  const characters = Array.from(normalize(value));
  if (characters.length < 2) return characters;
  return characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
}

function diceSimilarity(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return 0;

  const remaining = new Map<string, number>();
  leftBigrams.forEach((item) => remaining.set(item, (remaining.get(item) ?? 0) + 1));
  let intersection = 0;
  rightBigrams.forEach((item) => {
    const count = remaining.get(item) ?? 0;
    if (count > 0) {
      intersection += 1;
      remaining.set(item, count - 1);
    }
  });
  return (2 * intersection) / (leftBigrams.length + rightBigrams.length);
}

function answerPassages(answer: string): string[] {
  return answer
    .split(/\r?\n+|(?<=[。！？!?])\s*/u)
    .map((passage) => passage.trim())
    .filter(Boolean);
}

function bestPassage(answer: string, statement: string): {
  passage: string;
  similarity: number;
  exact: boolean;
} {
  const target = normalize(statement);
  const passages = answerPassages(answer);
  const exactPassage = passages.find((passage) => normalize(passage).includes(target));
  if (exactPassage) return { passage: exactPassage, similarity: 1, exact: true };

  return passages.reduce(
    (best, passage) => {
      const similarity = diceSimilarity(statement, passage);
      return similarity > best.similarity ? { passage, similarity, exact: false } : best;
    },
    { passage: '', similarity: 0, exact: false },
  );
}

/**
 * A deterministic, deliberately narrow demo evaluator. It accepts an exact
 * normalized match or a high character-bigram overlap within one answer
 * passage. This handles small word-order and wording changes without claiming
 * to be a production semantic evaluator. A reported URL remains URL-only
 * evidence because this browser demo never fetches the cited page.
 */
export class RuleBasedDemoAssessor implements AnswerAssessor {
  readonly id = 'lexical-overlap-demo-v2';

  async assess(
    request: Readonly<AssessmentRequest>,
    context: AssessmentContext,
  ): Promise<readonly ClaimAssessment[]> {
    if (context.signal.aborted) throw abortError();

    return request.targets.map((target) => {
      const match = bestPassage(request.response.answer, target.statement);
      const targetLength = Array.from(normalize(target.statement)).length;
      const mentioned = match.exact || (
        targetLength >= MIN_FUZZY_TARGET_LENGTH && match.similarity >= MENTION_THRESHOLD
      );
      const citationUrl = request.response.citationUrls[0];

      return {
        claimId: target.claimId,
        visibility: mentioned ? 'mentioned' : 'omitted',
        factuality: mentioned ? 'accurate' : 'not-assessed',
        attribution: mentioned ? 'correct' : 'not-applicable',
        evidence: mentioned && citationUrl ? 'reported-url' : 'none',
        confidence: mentioned
          ? Math.min(0.99, Math.max(0.82, match.similarity))
          : Math.min(0.9, Math.max(0.65, 1 - match.similarity / 2)),
        rationale: mentioned
          ? match.exact
            ? '正規化したClaim文が回答中に含まれています。'
            : `保守的な字句重なり判定が回答中の1箇所と一致しました（${Math.round(match.similarity * 100)}%）。`
          : `保守的な字句重なりの閾値を超える回答箇所はありませんでした（最大${Math.round(match.similarity * 100)}%）。`,
        assessedBy: 'system',
        assessedAt: context.assessedAt,
        ...(mentioned ? { observedExcerpt: match.passage } : {}),
        ...(mentioned && citationUrl ? { citationUrl } : {}),
      } satisfies ClaimAssessment;
    });
  }
}
