import { useEffect } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const topics = [
  { id: 'comparison', label: '回答を比較する' },
  { id: 'judgments', label: '判定の読み方' },
  { id: 'sources', label: '根拠と資料の版' },
  { id: 'data', label: '保存とできること' },
];

export function HelpPage() {
  const location = useLocation();
  const returnTo: unknown = location.state?.returnTo;
  const comparePath =
    typeof returnTo === 'string' &&
    (returnTo === '/' || returnTo.startsWith('/?'))
      ? returnTo
      : '/';

  useEffect(() => {
    const id = location.hash.slice(1);
    if (!topics.some((topic) => topic.id === id)) return;
    const section = document.getElementById(id);
    section?.scrollIntoView?.({ block: 'start' });
    section?.focus({ preventScroll: true });
  }, [location.hash]);

  return (
    <div className="help-page">
      <header className="help-page__header">
        <Link className="help-back" to={comparePath}>
          <ArrowLeft size={16} aria-hidden="true" />
          比較ラボへ戻る
        </Link>
        <h1>使い方と判定について</h1>
        <p>回答の違いを見つけて、その根拠を自分で確かめるために。</p>
      </header>

      <div className="help-layout">
        <nav className="help-toc" aria-label="使い方の目次">
          <Link className="help-toc__return" to={comparePath}>
            <ArrowLeft size={15} aria-hidden="true" />比較に戻る
          </Link>
          {topics.map((topic) => (
            <a key={topic.id} href={`#${topic.id}`}>
              {topic.label}
            </a>
          ))}
        </nav>

        <div className="help-content">
          <section
            id="comparison"
            tabIndex={-1}
            aria-labelledby="help-comparison-title"
          >
            <h2 id="help-comparison-title">回答を比較する</h2>
            <ol className="help-steps">
              <li>
                <h3>質問を選ぶ</h3>
                <p>
                  同じ質問に紐づく保存回答を表示します。最初はAIごとの最新回答が選ばれます。
                </p>
              </li>
              <li>
                <h3>比べる回答を選ぶ</h3>
                <p>
                  「比較する回答を選ぶ」で最大3件まで切り替えます。同じAIの過去回答も選べます。上限に達したら、ひとつ解除してから追加してください。
                </p>
              </li>
              <li>
                <h3>違いから、根拠へ進む</h3>
                <p>
                  確認項目ごとに抜粋と保存判定を見比べ、「根拠を確認」で資料と判定理由を開きます。回答全体の文脈と実行条件は「回答全文」で確認できます。
                </p>
              </li>
            </ol>
            <p className="help-note">
              質問文・検索の有無・モデル・取得時点が違う回答は、同じ条件の比較ではありません。「質問・取得条件」も確認してください。
            </p>
            <Link className="help-action" to={comparePath}>
              比較ラボを開く
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </section>

          <section
            id="judgments"
            tabIndex={-1}
            aria-labelledby="help-judgments-title"
          >
            <h2 id="help-judgments-title">判定の読み方</h2>
            <p>
              比較画面は保存された判定を整理して表示します。開くたびに新しい自動検証を行うわけではありません。
            </p>
            <dl className="help-definitions">
              <div>
                <dt>保存判定</dt>
                <dd>
                  回答を保存・評価した時点の記録です。「正確」の表示も、その記録上の評価であり、この画面が正しさを保証するものではありません。
                </dd>
              </div>
              <div>
                <dt>言及と正確さ</dt>
                <dd>
                  名前や項目が回答に出てくることと、内容が正しいことは別です。根拠の有無や帰属も分けて確認します。
                </dd>
              </div>
              <div>
                <dt>未評価・判定なし</dt>
                <dd>
                  結論を出せる評価がない状態です。正確とも、不正確とも扱いません。
                </dd>
              </div>
              <div>
                <dt>架空デモ</dt>
                <dd>
                  実在するAIサービスの現在の回答ではありません。簡易評価には単語の重なりを使うものがあり、意味の正しさを検証した結果ではありません。
                </dd>
              </div>
            </dl>
            <p className="help-note">
              公式情報も無条件の正解ではありません。対象プラン・適用条件・時点を含めて確かめ、最終的な判断は人が行います。
            </p>
          </section>

          <section
            id="sources"
            tabIndex={-1}
            aria-labelledby="help-sources-title"
          >
            <h2 id="help-sources-title">根拠と資料の版</h2>
            <p>
              「根拠を確認」では、回答の抜粋と、保存資料の本文を確認できます。URLがあるだけでは、その回答を裏付けているとは限りません。
            </p>
            <dl className="help-definitions">
              <div>
                <dt>保存時の資料</dt>
                <dd>
                  保存された識別情報と一致する資料です。一致は内容の真偽や作成者の証明ではありません。
                </dd>
              </div>
              <div>
                <dt>更新あり・保存時の原文を履歴から表示</dt>
                <dd>当時の識別情報に一致する原文が履歴に残っています。過去の判定と対応する版を表示し、現在の本文で置き換えません。更新後も同じ判定になるとは限りません。</dd>
              </div>
              <div>
                <dt>更新あり・旧本文未収録</dt>
                <dd>
                  現在の資料は保存時の版と異なり、当時の本文がありません。今の本文を当時の根拠としては表示しません。
                </dd>
              </div>
              <div>
                <dt>現行資料を参考表示</dt>
                <dd>
                  観測時の版が残っていないため、今ある資料を参考として示しています。当時も同じだったとは判断できません。
                </dd>
              </div>
            </dl>
            <Link className="help-action" to="/sources">
              登録した公式情報を確認
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <p className="help-note">資料の「原文を更新」で、更新メモと一緒に新しい版を手動保存できます。以前の原文は最大50版まで保持し、関連する確認済み項目を再確認に回します。差分表示は文字の比較で、意味の変化や矛盾の自動判定ではありません。原文と照合して確認項目を編集しても、過去の回答・判定は変更しません。</p>
          </section>

          <section id="data" tabIndex={-1} aria-labelledby="help-data-title">
            <h2 id="help-data-title">保存とできること</h2>
            <p>
              データはこのブラウザに保存され、クラウドへの自動同期はありません。別の端末や別のURLでは保存内容を引き継ぎません。ブラウザのデータを消す前に「バックアップと復元」でファイルへ保存してください。
            </p>
            <ul className="help-list">
              <li>APIキー・個人情報・機密資料は入力しないでください。書き出したファイルにも入力内容と過去の原文が含まれます。</li>
              <li>入力した原文や回答を、このアプリから外部AIへ送信する機能はありません。外部リンクを開いた先の通信や、サイト配信基盤のアクセスログは別の範囲です。</li>
              <li>自分で取得したAI回答を取り込み、判定を記録できます。</li>
              <li>
                デモの観測はローカルで動きます。外部AI
                APIからの回答取得はまだありません。
              </li>
              <li>
                監査パックは調査資料の持ち出し用です。Workspace全体のバックアップとは異なります。
              </li>
              <li>
                書き出したファイルは暗号化・自動伏せ字されません。共有前に内容を確認してください。
              </li>
            </ul>
            <Link className="help-action" to="/observe?tab=runs">
              保存した回答を見る
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
