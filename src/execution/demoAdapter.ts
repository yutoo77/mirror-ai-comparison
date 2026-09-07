import type { ProviderId } from '../domain/model';
import type {
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderObservationRequest,
  ProviderObservationResponse,
} from './contracts';

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function abortError(): Error {
  return new DOMException('The observation was cancelled.', 'AbortError');
}

function waitForDemoLatency(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(abortError());
    };
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const openings = [
  '公開情報を確認する際は、公式サイトと更新日を合わせて確認するのが安全です。',
  '回答の正確性は、対象と時点を固定して比較する必要があります。',
  '以下はデモ環境で生成した観測回答であり、外部AIへの送信は行っていません。',
] as const;

interface DemoKnowledgeGroup {
  matches: RegExp;
  facts: readonly string[];
  citations: readonly string[];
}

// This corpus represents what a fictional external provider might already know.
// It is deliberately separate from Workspace Claims so the adapter never receives
// the evaluation answer key through its request contract.
const demoKnowledge: Record<string, readonly DemoKnowledgeGroup[]> = {
  'aster.example': [
    {
      matches: /データ|保管|セキュリティ|認証|国内/,
      facts: [
        '日本リージョンを選択した場合、顧客データは国内データセンターに保管される。',
        '情報セキュリティマネジメントシステムはISO/IEC 27001認証の対象である。',
      ],
      citations: ['https://aster.example/trust/security'],
    },
    {
      matches: /小規模|導入|支援|ノーコード/,
      facts: [
        'Aster Flowは、業務フローをノーコードで設計・運用できるクラウドサービスである。',
        'スタータープランを含むすべてのプランに、初期導入支援が含まれる。',
      ],
      citations: ['https://aster.example/product'],
    },
    {
      matches: /障害|サポート|運用/,
      facts: [
        'Enterpriseプランでは24時間365日の一次受付と、重大障害への30分以内の初動連絡を提供する。',
      ],
      citations: ['https://aster.example/support/policy'],
    },
  ],
  'morrow.example': [
    {
      matches: /EV|車両|社用車|フリート/,
      facts: ['Morrow Fleetは、EVとガソリン車が混在する移行期のフリートを一つの画面で管理できる。'],
      citations: ['https://morrow.example/fleet'],
    },
    {
      matches: /CO2|排出|監査|レポート/,
      facts: ['国際的な算定ガイドラインに沿ったCO2排出量レポートを出力できる。'],
      citations: ['https://morrow.example/fleet/emissions'],
    },
  ],
};

export class DeterministicDemoAdapter implements ProviderAdapter {
  readonly mode = 'demo' as const;

  constructor(readonly provider: ProviderId, private readonly latencyMs = 0) {}

  async observe(
    request: Readonly<ProviderObservationRequest>,
    context: ProviderExecutionContext,
  ): Promise<ProviderObservationResponse> {
    if (context.signal.aborted) throw abortError();
    await waitForDemoLatency(this.latencyMs, context.signal);

    const seed = stableHash(
      JSON.stringify({
        provider: request.provider,
        repeatIndex: request.repeatIndex,
        observation: request.observation,
      }),
    );
    const opening = openings[seed % openings.length] ?? openings[0];
    const aliases = request.observation.subject.aliases.length > 0
      ? `（別名: ${request.observation.subject.aliases.join('、')}）`
      : '';

    const knowledgeGroups = demoKnowledge[request.observation.subject.canonicalDomain] ?? [];
    const relevantGroups = knowledgeGroups.filter((group) => group.matches.test(request.observation.question));
    const relevantFacts = relevantGroups.flatMap((group) => group.facts);
    const selectedFacts = relevantFacts.filter((_, index) =>
      stableHash(`${seed}:${index}:visibility`) % 100 >= 32,
    );
    const learnedFacts = selectedFacts.length > 0
      ? `\n\n${selectedFacts.join('\n')}`
      : '\n\n公開情報から、この質問に対応する個別条件を確認できませんでした。';
    const citations = request.observation.searchEnabled && selectedFacts.length > 0
      ? [...new Set(relevantGroups.flatMap((group) => group.citations))]
      : [];

    const response = {
      model: `${this.provider}-deterministic-demo-v1`,
      answer: `${opening}\n\n${request.observation.subject.displayName}${aliases}について「${request.observation.question}」という質問を受けました。${learnedFacts}\n\n個別の事実は引用元と照合してください。`,
      citationUrls: citations,
    } satisfies ProviderObservationResponse;

    if (context.signal.aborted) throw abortError();
    return response;
  }
}

export function createDeterministicDemoAdapters(
  providers: readonly ProviderId[],
  latencyMs = 0,
): readonly ProviderAdapter[] {
  return providers.map((provider) => new DeterministicDemoAdapter(provider, latencyMs));
}
