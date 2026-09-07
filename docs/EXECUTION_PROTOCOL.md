# Observation execution protocol

## Purpose

Mirrorの観測は「AIに質問する処理」と「公式Claimを使って回答を評価する処理」を同じPromptへ混ぜない。評価対象を先にProviderへ見せると、実際の利用者が得る回答ではなく、正解を教えた後の回答を測定してしまうためである。

## Lifecycle

### 1. Freeze the plan

planCampaignは有効なProbeをProbe × Provider × repetitionへ展開する。各Jobには以下を固定する。

- Subjectの表示名、公式domain、alias
- 質問、locale、search条件
- Provider、repeat index
- 評価対象ClaimとSource Snapshot hash
- 安定したJob ID

Targetが空、Claim/Sourceが解決不能、繰り返しが不正、100 Jobを超える計画は実行前に拒否する。戻り値はdeep freezeし、実行途中の編集が過去の計画へ混ざらないようにする。

### 2. Acquire an answer blindly

Provider Adapterへ渡るProviderObservationRequestは次だけを含む。

    jobId
    provider
    repeatIndex
    observation:
      subject
      question
      locale
      searchEnabled

evaluationTargets、Claim文、Source原文は渡さない。現milestoneのDeterministicDemoAdapterもこの同じinterfaceで動き、外部Provider Adapterへの差し替え点になる。

### 3. Evaluate against the frozen targets

回答取得後、Assessorへanswer + citation URLs + evaluationTargetsを渡す。AssessorはTargetごとに必ず一つだけ、次を返す。

- visibility
- factuality
- attribution
- evidence state
- confidence
- rationale
- observed excerpt / citation
- actor / assessed time

Target外、重複、欠落したAssessmentはinvalid-responseとして保存し、測定値へ混ぜない。

ブラウザDemoのlexical-overlap-demo-v2は、完全一致または一文内の高い文字bigram重なりだけを採用する保守的な規則ベースEvaluatorである。URLが返っても本文を取得していないため、Evidenceはreported-url止まりとなる。Productionのsemantic evaluatorや人間の判断精度を主張するものではない。

### 4. Persist every outcome

一つのJobは必ず次のいずれかになる。

- succeeded: 回答、Assessment、Runを保存
- failed: sanitized error code、retry可否を保存
- cancelled: 実行中か開始前かを区別して保存

一件が失敗しても、残りのJobは続行する。ユーザーが中止した場合は、実行中Jobと未開始Jobを含む全予定Jobをcancelled Artifactで埋める。したがって、常にcampaign.artifacts.length === plannedRunCountになる。

### 5. Aggregate only comparable runs

MetricとFindingへ使うのは、ProbeのTargetとAssessment集合が完全一致する成功Runだけである。旧形式にTarget外Assessmentが残っていてもRaw Runは削除せず、比較集計からのみ除外する。

## Integrity metadata

新規Campaignは以下を持つ。

- mirror.campaign.v1 schema
- Evaluator ID
- Campaign fingerprint
- planned / started / completed time
- 全Job Artifact

すべてのJob Artifactは、状態にかかわらずSHA-256 fingerprintを持つ。成功Runは同じArtifact fingerprint、mirror.run.v1、origin、Evaluator ID、recorded actor/time、Campaign IDを持つ。

Fingerprintは偶発的変更の検出と同一性確認に使う。ブラウザ自身がStorageを書き換えられる現在のmilestoneでは、署名や改ざん耐性を意味しない。Productionではserver-side append-only storage、actor authentication、必要に応じて署名またはhash chainを追加する。

## Manual observation

外部AIで取得した回答はBring Your Own Answerから取り込める。

1. 質問、Provider/model、日時、回答全文、reported URLを記録
2. 人がすべてのTarget Claimを明示評価
3. 分子・分母を確認してRun Artifactを保存

「言及あり」を選んだだけで正確性や帰属を自動確定しない。URLはhttp(s)形式を検証し、保存後は回答、判定、Provenanceへ遡れる。データはこのmilestoneではlocalStorageだけに残り、外部送信されない。

## Adding a real Provider

Production AdapterはProviderAdapterを実装し、Provider IDとprovider modeを宣言する。API key、rate limit、timeout、retry、cost budgetはブラウザではなくAPI/Worker側に置く。

追加時に最低限必要なcontract test:

- ClaimやSource本文がProvider payloadへ含まれない
- Provider response schemaの拒否条件
- timeout / retryable errorの分類
- cancellation propagation
- Job idempotency
- secretとraw answerを含まないstructured logging
- evaluator versionを固定したgold-set regression
