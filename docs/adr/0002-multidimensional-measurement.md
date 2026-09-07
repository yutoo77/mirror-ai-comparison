# ADR 0002: Multidimensional measurement

- Status: Accepted
- Date: 2026-09-02

## Context

単一のcoverage scoreでは、欠落、誤り、誤帰属、根拠不足を区別できず、改善施策を選べない。また対象外Claimが分母へ混ざる危険がある。

## Decision

Probeごとに対象Claimを明示し、Visibility、Factuality、Attribution、Evidenceを別々に保存・集計する。表示用文字列を再解析して指標を作らない。

## Consequences

- 指標から改善原因を説明できる
- 評価データ量とUI上の説明は増える
- Aggregateは必ず元Runへ遡れる設計が必要になる
