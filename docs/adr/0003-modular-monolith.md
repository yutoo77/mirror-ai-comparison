# ADR 0003: Start with a modular monolith

- Status: Accepted
- Date: 2026-09-02

## Context

Source取得、AI実行、評価、Web UIは異なる責務だが、初期チームと利用量は未確定である。

## Decision

Domain、API、Worker、Provider Adapterをmoduleで分離したTypeScript modular monolithから始める。PostgreSQLを正本とし、外部処理はidempotent jobとして実行する。

## Consequences

- Transaction、tenant scope、監査を一つの境界で保証しやすい
- Deploymentとローカル開発が単純になる
- 実測でボトルネックが判明したmoduleだけを後から分離する
