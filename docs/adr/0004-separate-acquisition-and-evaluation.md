# ADR 0004: Separate answer acquisition from evaluation

- Status: Accepted
- Date: 2026-09-03

## Context

公式Claimを含むPromptでAI回答を取得すると、観測対象へ正解を先に渡すことになる。その結果は、利用者が通常の質問で得るAI上の認識を表さない。また、ProviderごとのSDKを画面やDomainへ直結すると、再現性、失敗処理、API key境界がProvider固有実装へ散らばる。

## Decision

回答取得とClaim評価を二つの明示的contractへ分離する。

- Provider AdapterはSubject、質問、実行条件だけを受け取る
- Campaign plannerは回答取得前に全Jobと評価Snapshotを固定する
- Assessorは回答取得後にだけTarget Claimを参照する
- Assessor outputはTarget集合と完全一致しなければ失敗Artifactにする
- 成功・失敗・中止を含む全Jobをversioned Artifactとして保存する
- Demo、Manual、実ProviderをRun originで区別する

## Consequences

- answer-key leakageをcontract testで防げる
- Provider追加がAdapter実装に局所化する
- 同じ回答を別Evaluator versionで再評価できる余地が生まれる
- Campaignの部分失敗や中止を隠さず説明できる
- acquisitionとevaluationの二段階分、modelとArtifact設計は増える
- lexical demo evaluatorは本番精度を示さないため、UIと文書で明示する必要がある
