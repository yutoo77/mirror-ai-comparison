# 「AIっぽいUI」から抜けるための資料調査

調査日: 2026-09-05。これは調査メモであり、自動適用する指示ファイルではありません。

公式ドキュメント、作者の公開記事、公開リポジトリを中心に確認しました。有料教材の本文を購入・通読した調査でも、各Skillをインストールして出力品質を比較した実験でもありません。効果・優先順位は、公開内容とMirrorの用途からの判断です。

## 再調査と適用（同日追記）

以下の元調査に加え、今回はNielsen Norman Groupの一次資料を読み、情報を置く場所と比較操作を中心に再整理しました。

- [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): 見た目の好みとは分けて、状態・用語・回復・一貫性などの操作上の問題を点検する。
- [Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/) / [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): 最小限とは空白の多さではない。頻繁に必要な情報を残し、低頻度の詳細を段階的に開く。
- [Comparison Tables](https://www.nngroup.com/articles/comparison-tables/) / [Recognition Rather Than Recall](https://www.nngroup.com/articles/recognition-and-recall/): 比較する項目の位置と対象の識別を揃え、覚えて往復する負担を減らす。
- [Help and Documentation](https://www.nngroup.com/articles/help-and-documentation/) / [Icon Usability](https://www.nngroup.com/articles/icon-usability/): 説明の別ページ化は、必要なラベルを削ることではない。操作に対応する名前と、関連する箇所へのヘルプ入口を残す。

適用した成果物:

- 個人用 `usability-first-ui` Skillと、原則・参照リンク集（個人環境のパスと設定は公開対象外）。外部のSkillを丸ごと導入したものではなく、今回の目的に合わせた独自の短い指針。
- 共通 `AGENTS.md` にUI作業時の参照入口を追記。元の2,383バイトのSHA-256が追記後も一致することを確認。新規の一時CodexプロセスからSkillと必須参照を実読できることも確認。
- Skill形式検証を通過。独立した音楽イベント購入画面の設計課題でも、既存の黒・赤のブランドと購入条件を残す提案になった。これは適用範囲の簡単な動作確認であり、デザイン品質のベンチマークではない。
- Mirrorの比較画面、共通ナビゲーション、使い方ページを改修。実装判断は [UI_DESIGN.md](UI_DESIGN.md) に分離した。

以降の「未適用」「提案」という表現は初回調査時点の記録です。現在の適用状況はこの追記と設計文書を参照してください。モデルの重みを再学習したわけではなく、再利用する文脈をファイル化しています。

## 結論

「禁止する装飾」の一覧だけでは足りません。利用者の仕事から画面構造を選び、良い実例を分解し、本物に近い日本語の内容で実装し、実画面を批評して直す工程が必要です。

Mirrorでは、華やかな広告ページではなく、調査・比較・確認を繰り返す実用アプリの資料を優先します。白・水色・青は残せます。色を変えることと、情報の設計を改善することは別です。

## 優先して使いたい資料

### 1. OpenAI: Frontend prompt instructions

- [公式のフロントエンド指示例](https://developers.openai.com/api/docs/guides/frontend-prompt)
- 公開記事。文書上はGPT-5.5向けで、他モデルにも共通する部分があると説明されています。
- 操作用アプリと表現的なサイトを区別し、前者は作業・一覧性・比較を優先する方針が、Mirrorとよく合います。
- 採用候補: 最初に使える作業画面を出す、装飾的な大見出しやカードの多用を避ける、対象業務に合わせる。
- 注意: 数値的な角丸制限や説明文を強く抑える指示まで普遍的な正解とはしません。初回案内、根拠の限界、アクセシブルなラベルは必要です。

### 2. Impeccable

- [プロジェクト](https://impeccable.style/) / [公開リポジトリ](https://github.com/pbakaus/impeccable)
- [設計の進め方](https://impeccable.style/designing/) / [layout](https://impeccable.style/docs/layout/) / [critique](https://impeccable.style/docs/critique/)
- AIコーディングエージェント向けの公開プロジェクト。コードはApache-2.0表記。AI実行費用とは別です。
- デザインの修正を、レイアウト、文字、情報の削減、批評などに分けて指示できる点が有用です。製品の目的と見た目の文書を分離する方式も参考になります。
- 採用候補: 設計文脈を先に固定し、問題に合う観点で改善してから検証する工程。
- 注意: 検出ルールやモデルによる点数は診断材料で、審美性や実ユーザーの使いやすさを証明しません。丸ごと導入する前に指示・実行コード・既存ルールとの衝突を確認します。

### 3. Anthropic: frontend-design

- [公式公開Skillの本文](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)
- [設計指示に関する記事](https://claude.com/blog/improving-frontend-design-through-skills)
- 公開資料。製品の題材からデザインを考え、実装前に構成を検討し、実画面を自己批評する工程が参考になります。
- 現行の本文は、暖色の背景とセリフ体、暗色と強い差し色、新聞風の構成なども「文脈なく使えば別の定型」と扱っています。
- 採用候補: 装飾やラベルに役割を求めること。以前の生成物と同じ選択を惰性で繰り返していないか確認すること。
- 注意: ブランド表現・ヒーロー寄りの記述を、調査アプリへそのまま当てはめません。複数の大型デザインSkillを同時に有効化するより、主となる方針を一つにします。

### 4. Refactoring UI — Adam Wathan / Steve Schoger

- [公式サイト・公開例・教材構成](https://refactoringui.com/)
- 本編は有料。公開の説明・作例、無料章の案内、作者の記事・動画へのリンクを確認しました。
- 階層、余白、文字、色を具体的な改善策で扱う、開発者向けの教材です。
- 採用候補: 主役を強くするだけでなく脇役を弱める、情報の関係を余白で示す、枠線を増やす前に構造を整える。
- 注意: 作例の外観を全画面へ移植するのではなく、変更の理由を学びます。最初から購入を前提にはしません。

### 5. Every Layout — Heydon Pickering / Andy Bell

- [公式サイト](https://every-layout.dev/) / [The Sidebar](https://every-layout.dev/layouts/sidebar/) / [The Switcher](https://every-layout.dev/layouts/switcher/)
- 基礎と一部レイアウトは無料公開、完全版は有料。
- レイアウトを組み合わせ可能な小さな構造として捉え、与えられた領域に応じて配置を変えるCSSの考え方が学べます。
- 採用候補: 回答と根拠の領域配分、長文時の最小幅、狭い領域での再配置。画面幅ごとの場当たり的な補修を減らす。
- 注意: 一部の説明には歴史的なブラウザ事情が含まれます。実装時は現在のCSS仕様・対応状況を確認します。

### 6. Linearのリデザイン記事

- [A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)（2026-03-12）
- [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- 無料公開の制作事例。情報密度を保ちながら、周辺ナビゲーションや装飾を控えめにする判断が説明されています。
- 採用候補: 作業中の本文を主役にする、操作の配置を予測可能にする、複数の画面状態で設計を試す。
- 注意: 学ぶのは判断の過程です。暗い配色や見た目をコピーして「Linear風」にすることは目的ではありません。

### 7. Learn UI Design — Erik D. Kennedy

- [無料ブログ](https://www.learnui.design/blog/)
- [5 Practical Exercises to Learn UI Design](https://www.learnui.design/blog/5-practical-exercises-learn-ui-design-free.html)
- 紹介した記事は無料、別途有料講座があります。
- 良い画面を見て理由を言葉にする、練習として再現する、自分の題材で試すという学び方が参考になります。
- 採用候補: 「かっこいい」で終わらず、文字・余白・配置のどれが効いているかを説明する練習。
- 注意: 再現練習と、自分の成果物として公開する独立した設計は分けます。

## 必要な場面で引く資料

| 資料 | 学ぶ対象 | 利用範囲・注意 |
| --- | --- | --- |
| [Carbon: Data table](https://carbondesignsystem.com/components/data-table/usage/) | 情報の比較、検索、行内操作、詳細の展開 | 無料の公式資料。情報構造を参考にし、IBMの外観やライブラリ導入を必須にはしない |
| [Mobbin](https://mobbin.com/) / [料金と提供機能](https://mobbin.com/pricing) | 実在するアプリの画面・フローの観察 | 無料登録の案内あり、全体へのアクセスは有料。今回はログイン後のライブラリを実利用したわけではない |
| [Butterick: Typography in ten minutes](https://practicaltypography.com/typography-in-ten-minutes.html) | 本文の読みやすさ、行の長さ、行間 | Webで公開・読者支援方式。欧文の数値や書体の好みを日本語へそのまま移植しない |
| [Rauno: Invisible Details of Interaction Design](https://rauno.me/craft/interaction-design) | 操作に応える細部、動作の連続性 | 無料公開記事。基本構造が決まった後に使い、動きを増やす理由にはしない |
| [デジタル庁: タイポグラフィ](https://design.digital.go.jp/dads/foundations/typography/) | 日本語の文字組み・書体・可読性 | 無料の公式資料。英語資料だけでは不足する部分の補助。行政サイト風にする必要はない |

## Mirrorで特に検討すべきこと

以下は、公開資料と現行実装を踏まえた設計仮説です。ユーザーテストの結果ではなく、まだUIへ適用していません。

- 回答、確認項目、根拠、補足を同じ視覚的強さにしない。今の作業で何を読むかを先に決める。
- `COMPARE LAB` や細かな英語の見出しは、理解に貢献するものだけ残す。文字を装飾として使いすぎない。
- 角丸カードを消すこと自体が目的ではない。独立した単位にはカード、繰り返し比較する項目には行や表、読み進める本文には連続した面を検討する。
- 複数回答の対等な比較には等幅列が適する場合もある。「AIっぽいから」という理由で不必要に非対称にしない。
- 比較の全体像をつかむ画面と、長文を精読する状態を区別する。すべてを常時表示して解決しない。
- 白と青は維持しつつ、常設ナビゲーションや装飾が根拠の本文より目立たない配分を試す。
- デモ、保存判定、未検証、資料の版などの必要な説明は残す。すべての文を消す「ミニマル化」は避ける。
- 空、長い日本語、URL、回答1件と3件、エラー、古い資料、スマホでも成立するかを確認する。

## 継続的に取り込む方法の提案

単に資料を読んでも基礎モデルの重みが恒久的に再学習されるわけではありません。継続して使うには、参照する内容とタイミングを明示します。

| 保存先の候補 | 保存する内容 | 理由 |
| --- | --- | --- |
| メモリ | ユーザーの好み、避けたい傾向、重要な長期方針 | 短い好みを長大な規則集にしない |
| デザイン用Skill | 調査、構成案、実装、実画面レビューの工程 | UI作業時に詳細を読み込む |
| プロジェクトの設計文書 | Mirrorの利用者、画面の役割、文字・余白・色、実例、採用理由 | 他の作品へ同じ外観を強制しない |
| `AGENTS.md` | UI作業前に適切なSkill・設計文書を読むという短い入口 | 読み込みを曖昧な記憶任せにしない |

[OpenAIの公式仕様](https://learn.chatgpt.com/docs/build-skills)では、Skillの詳細は選択時に読み込まれます。[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)は作業前の指示として扱われます。任意の `DESIGN.md` を置いただけで常に自動読込されると考えず、読む入口を設定するのが提案です。今回はいずれも新設・変更・インストールしていません。

## 次回から試す小さな工程

これは提案であり、追加済みのSkillではありません。

1. その画面で誰が何を判断・操作するかを一文で書く。
2. 同じ種類の作業を扱う実例を2〜3件選び、借りる考え方と借りない外観を言葉にする。
3. 色違いではなく、情報配置が異なる小さな構成案を2つ作り、用途への適合で選ぶ。
4. 実際に近い日本語・件数・長文で主要な1画面を実装する。
5. ブラウザで見て、主従、読みやすさ、密度、操作位置、不要な装飾を確認する。
6. 問題の大きい点を絞って修正し、前後の画面と変更理由を残す。
7. 読み取り・根拠確認の小さなタスクを人に試してもらい、見た目の好みと使いやすさを分けて聞く。

まず無料の指針と公開事例だけで、Mirrorの比較画面1つを改善し、その差を確認するのがよいと判断します。大量の教材購入や複数Skillの一括導入は、最初の一歩には不要です。
