# Product decisions

> **Direction update — 2026-09-05:** [Product direction](PRODUCT_DIRECTION.md) is the current implementation priority. Mirror starts with a single-person comparison lab for AI descriptions and evidence. Enterprise monitoring and improvement experiments below are background design context, not the immediate roadmap. Fact-level verification is an existing category; the contribution must be demonstrated through implementation and evaluation.

## Product thesis

企業が発信した情報は、公式サイトに存在するだけでは価値にならない。利用者が生成AIへ質問したときに、正しく、適切な根拠とともに届く必要がある。

Mirrorは「企業情報管理」ではなく、次のJobに絞る。

> 公式に確認された事実と生成AIの回答との差を継続観測し、根拠を確認して、改善と再測定につなげたい。

## Earlier target-user hypothesis

最初の利用者は、企業の広報、ブランド、Product Marketing、コンテンツ/GEO担当者を想定する。分析対象は企業に限定せず、Organization / Brand / Product / Serviceを同じSubjectモデルで扱う。

採用、製品、ブランド、IRは個別実装ではなくObjective templateとする。

## Design principles (not claims of market novelty)

差別化の中心は、大量のプロンプト監視ではない。

1. Organization-owned truth
2. Claim-level assessment
3. Traceable evidence chain
4. Human approval and auditability
5. Closed-loop remeasurement

「表示されたか」だけでなく、「何が正しく伝わり、何が欠け、どの文章が裏付けたか」を説明できることを価値とする。

## Information architecture

### Overview

30秒で、何が変わったか、どれが重要か、次に何を確認するかを理解する。

### Observe

誰が、何を、どの条件でAIへ尋ねるかを設計する。質問テンプレート、Campaign、Run Artifactを分離する。回答取得時はClaimをProviderへ見せず、外部で取得した回答も同じRun modelへ取り込める。

### Findings

公式原文、AI回答、引用、判定、不確実性、人間レビューを一つのInspectorで確認する。

### Improve

ToDoではなくExperimentとして、仮説、変更内容、成功指標、前後のMeasurement Windowを管理する。

### Sources & Claims

組織が正しいと認める情報、原文Snapshot、Claim、Owner、鮮度、版を管理する。

## Explicit non-goals for this milestone

- Generic knowledge management
- AI content generation suite
- SEO rank tracker
- Causal attribution of content changes
- Full enterprise IAM
- Autonomous publishing
- Dozens of independent dashboards

これらを足さないことで、Core Loopの説明力と完成度を優先する。

## UX principles

- 一画面につき一つの主要判断
- 初期表示は重要な3件まで
- Fact / AI output / system inference / human decisionを視覚的に分離
- 数値には分母、対象範囲、実行数を付ける
- IDより人が理解できる名称を優先
- 色だけで状態を伝えない
- Desktopは分析、Mobileは確認・承認を中心にする
- 架空デモ、Simulation、実観測を混同させない
- 成功件数だけを見せず、計画数、失敗、中止を同じCampaign台帳に残す
- 人が「言及」を選んでも正確性・帰属を自動確定しない
