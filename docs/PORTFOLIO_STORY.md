# Mirror: 作品紹介とデモの進め方

更新: 2026-09-07 / v0.8.1。実装済みの比較・レビュー・原文の版管理を説明するためのガイドです。実APIや未見データでの精度評価は、まだ成果として扱いません。

## 30-second description

Mirrorは、企業やサービスについてのAIの説明を同じ項目で比べ、保存した公式原文と人の判断を残すアプリです。説明の違いだけでなく、何を根拠に判断したか、資料が変わった後も当時の根拠へ戻れるかを重視しました。現在は架空データと持ち込み回答で動くローカル保存型のデモです。

## Three-minute demo

1. **0:00〜0:30 / 何のための道具か。** 比較ラボを開き、架空データと保存判定であることを示す。「AIで説明が違うとき、どこを確認すればよいか」という課題を話す。
2. **0:30〜1:20 / 違いから根拠へ。** 質問を選び、2〜3件の回答を見比べ、ひとつの項目の「根拠を確認」を開く。URLがあることと本文が裏付けになることを区別する。
3. **1:20〜2:20 / 情報が変わったら。** 公式情報で資料を開き、原文を変更して更新メモと一緒に保存する。古い版が残り、関連項目が再確認の対象になることを示す。これは文字差分と参照関係の集計であり、自動の意味判定ではないと説明する。
4. **2:20〜3:00 / 判断と限界。** 過去の回答の判定を勝手に変更しないこと、必要な根拠が未収録ならそのまま表示することを示す。次は実API接続と未見データでの検証、と締める。

デモ前にバックアップを取り、変更する原文は架空データだけにする。説明時間が短ければ最初の2操作に絞る。全機能を順番に見せる必要はない。

補足デモ：Incident Roomで理由付きレビューを残し、監査パックを読み取り専用で検証する。データ保全を説明する場合は、Workspaceバックアップを別コピーとして復元し、元データと過去の証拠hashが変わらないことを示す。

## Engineering decisions to explain

### Why the public repository is clean-room

元となるプロトタイプの履歴や企業固有Fixtureを公開版へ持ち込まず、汎用化したモデルと自作データだけで再実装した。文字列置換ではなく、Subjectを一級モデルとして設計した。

### Why target Claim IDs are explicit

Workspace全体のClaimを分母にすると、質問に関係のない事実がKPIを変えてしまう。ProbeとClaimの対象関係を明示し、回帰テストで不変条件を固定した。

### Why assessment is multidimensional

「言及されなかった」「言及されたが誤り」「内容は正しいが引用根拠が弱い」は異なる改善を必要とするため、一つのスコアへ混ぜない。

### Why acquisition is blind

評価対象ClaimをProviderへ先に見せると、知っているかではなくPromptに従って復唱できるかを測ってしまう。Provider Adapterの入力型からClaimを除外し、contract testでanswer-key leakageを防いだ。

### Why cancelled work is an artifact

成功Runだけを保存すると、8件中5件しか動かなかったCampaignが「5件成功」に見える。計画した全Jobを成功・失敗・中止のいずれかで埋め、分母と運用品質を隠さない。

### Why every layer is versioned

回答だけでは再現性を説明できない。Campaign、Job、Runに入力条件、Evaluator ID、actor、time、schema、SHA-256を持たせ、指標から根拠へ戻れるようにした。SHA-256は署名ではないという限界も明記している。

### Why Human Review is a product feature

企業情報ではAI判定だけで公開施策を決められない。System inferenceとHuman decisionを分離し、責任境界をUIに表現した。

### Why a modular monolith

MicroservicesやGraph DBを先に採用せず、再現可能なRun、immutable artifact、tenant boundaryを優先した。複雑性を導入する条件も文書化した。

### Why restore creates a copy

復元時に既存Workspaceを上書きしたり過去の証拠IDを振り直したりすると、データと照合関係を失う。新しいローカルWorkspace IDだけを発行し、過去のCampaign/Runは変更しない。参照元のWorkspace IDとバックアップのfingerprintは別の復元履歴へ保存する。破損データもデモ初期化で消さず退避できるようにした。

### Why the UI became smaller

機能の分類より、質問を選ぶ・比較する・原文を確認するという作業順を優先した。Nielsenの原則を参照して、説明をヘルプへ分けつつ、デモ・未評価・根拠の限界はその場に残した。作業時間短縮や満足度の改善はまだ測定していない。

### Why source revisions are immutable evidence

原文更新のたびに古い本文・保存日時・識別情報を保持する。後からFindingを再集計する処理でも、同じ観測の根拠を現在の本文に置き換えない。履歴が存在しない古い記録に本文や日時を捏造しないこともテストした。

## AI支援と説明責任

設計案の比較、実装、テスト、文書化にAI開発支援を利用している。手書きのコード量ではなく、課題設定、採用・不採用の判断、再現できる不具合と回帰テスト、未検証の範囲を説明する。

面接前に、取得側へ正解を渡さない型、資料版の解決処理、未評価を分母から分ける計算、バックアップ復元の4箇所を実際に読み、変更したら何が壊れるかを確認するとよい。AI支援の成果を自分が理解済みだと、文書だけで断定しない。

## Honest current limitations

- 自動Provider実行はdeterministic local adapterで、外部AI APIは未接続
- Source URL自動取得は未接続
- PersistenceはlocalStorage
- Demo evaluatorは保守的な字句照合で、formal calibrationとGold Setは次段階
- Before/Afterは記述的な差であり因果効果ではない

これらを隠さず、どの順番でProduction化するかまで説明する。
