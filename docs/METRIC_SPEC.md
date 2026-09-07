# Metric specification

## Why no single score

生成AI回答の品質は、一つの「カバレッジ」へ安全に圧縮できない。Mirrorでは、問題原因を説明できるように次元を分ける。

## Assessment dimensions

### Visibility

- `mentioned`: 対象Claimの内容が回答に存在する
- `omitted`: その質問で評価対象だが、回答に存在しない
- `not-applicable`: その回答では評価対象外

### Factuality

- `accurate`
- `partial`
- `contradicted`
- `unsupported`
- `not-assessed`

### Attribution

- `correct`
- `misattributed`
- `ambiguous`
- `not-applicable`

### Evidence state

強さの異なる状態を混同しない。

1. `reported-url`: ProviderがURLを返しただけ
2. `fetched`: URLの内容を取得した
3. `passage-match`: 回答内容を支える文章を照合した
4. `human-verified`: 人が文章と判定を確認した
5. `none`: 引用を確認できない

## Metrics

### Incident-specific replay (v0.4)

Incident Room uses `affected / evaluable` for the **selected Finding kind**, separately from the broader dimension metrics below. Invalid target sets are excluded; unsupported/unknown states are not silently counted as healthy. No evaluable Runs means `null`, displayed as `—`. See [the kind-by-kind table](INCIDENT_ROOM.md#incident-metric-contract) for the precise mapping and historical-data limitations.

New Action drafts from this screen use the complement of that issue's detection rate, not a generic accuracy score. They require human confirmation and at least one evaluable Run. Existing fixture Action baselines retain their original definitions.

### Target claim recall

```text
mentioned target claims / explicitly targeted claims
```

質問ごとの `targetClaimIds` が唯一の分母である。Workspace内の対象外Claimを含めない。

### Factual accuracy

```text
accurate mentions / mentions with factuality assessed
```

欠落と誤りを同じ失点として混ぜない。

### Attribution accuracy

```text
correct attributions / mentions with attribution assessed
```

### Passage support

```text
passage-match or human-verified mentions / mentioned target claims
```

ProviderがURLを返しただけではpassage supportに含めない。

### Stability

同じProbeの複数RunについてTarget Claim Recallのばらつきを測る。現在のfrontend fixtureでは、Probe単位の標準偏差から説明用の0–1指標を算出し、その平均を表示する。

これは正式な信頼区間ではない。Production版ではProvider、Prompt variant、Region、Time windowを階層として保持し、分布と区間推定を表示する。

## Observation and evaluator scope

- 回答取得はTarget Claimを見せないblind observationとする
- 評価はCampaign計画時に固定したClaim / Source Snapshotだけを使う
- AssessorはTargetごとにちょうど一つのAssessmentを返す
- Target外、欠落、重複したAssessmentを含むRunは集計しない
- Demoの規則ベース判定と人間の判定をRun origin / Evaluator IDで区別する
- Evaluatorの変更前後を同一系列として黙って混ぜない

## Invariants

- Target外Claimは分子・分母へ入らない
- `omitted` と `not-assessed` を同一視しない
- 1 Runだけではstabilityを表示しない
- `reported-url` を「検証済み引用」と呼ばない
- 集計値から元のRun、回答、Assessment、Snapshotへ遡れる
- 改善前後の差を因果効果と断定しない
- Provider/model/prompt/schema/locale/search/timeをRunに固定する
- Campaign、失敗・中止を含む全Job、成功Runのfingerprintを保持する

SHA-256 fingerprintはArtifact同一性の確認用であり、client-side storage自体の改ざん耐性を保証しない。

## Required regression fixture

全15 Claim、Target 3 Claim、Mentioned 2 Claimの場合、結果は必ず `2/3`。対象外12 ClaimのAssessmentを追加しても結果は変わらない。
