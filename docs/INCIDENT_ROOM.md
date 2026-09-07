# Incident Room / Evidence Pack

Status: v0.8, private local development. No API key, paid inference, account, backend or deployment required. The comparison lab is now the app's entry point; this document covers the existing incident and evidence-export workflow.

Source history is now included when available. Packs with history or an explicitly unavailable capture date use `mirror.evidence-pack.v3`; v1/v2 remain readable. A source update does not rewrite saved Finding evidence. The incident view warns when its saved passage differs from the current source; the comparison lab resolves the captured source hash against current and historical versions. See [source history](SOURCE_HISTORY.md).

## A short portfolio walkthrough

1. Open Findings and select an incident. The queue is ordered by severity, with unreviewed / needs-evidence / confirmed counts.
2. Compare the saved official excerpt with a selected answer. Select another observation to see whether the same issue appears elsewhere. Open **回答全文** for conditions, original answer, individual assessments and provenance.
3. Choose a review outcome and record a reason. The selected Run ID is attached to the review. Saved history can reopen that exact answer. Dismissing resolves the Finding; reviewing a dismissed Finding again reopens it.
4. If confirmed and at least one assessment is evaluable, create an improvement **draft**, not an automatic content change. Its baseline is the non-detection rate for this issue type among evaluable stored answers.
5. Open **監査パック**, prepare the pack, inspect what is included, and save JSON. Use **監査パックを検証** in the sidebar to read it again without changing the workspace.

The emphasis is an inspectable path from a detected issue to the actual answer, human reasoning and an improvement hypothesis. This is a design choice, not a claim that competing products lack verification. The demo does not establish commercial demand or production accuracy.

## Incident metric contract

The domain projection is `src/domain/incident.ts`. It replays saved assessments; it does not call an AI or reassess against the latest Source.

All stored Probes targeting the selected Claim contribute candidate Runs, including Probes not listed in the aggregate Finding's affected `probeIds`. Runs with missing, extra or duplicate target assessments, or an unknown Probe, are excluded. The denominator is **evaluable Runs for this kind**, not all workspace Runs and not all problems combined.

| Kind | Affected | Not detected | Not evaluable |
| --- | --- | --- | --- |
| Omission | visibility = omitted | mentioned | not-applicable |
| Contradiction | factuality = contradicted | accurate or partial | unsupported or not-assessed |
| Misattribution | attribution = misattributed | correct | ambiguous or not-applicable |
| Weak evidence | mentioned AND (unsupported OR evidence = none / reported-url / fetched) | mentioned with passage-match / human-verified and not unsupported | not mentioned |
| Outdated | Not inferred | Not inferred | All Runs; temporal validity is absent from the current assessment contract |

- An empty denominator is **null / —**, never 0%.
- Non-detection of one issue does not mean the whole answer is correct.
- Stored fixture Finding totals and the Overview's broader dimension metrics can differ from this kind-specific denominator. The Incident Room labels its recalculation explicitly.
- The projection includes stored history across questions, models, origins and evaluator versions. It is a descriptive investigation aid, not a controlled provider comparison, time-series trend, confidence interval or causal estimate. Individual conditions remain visible.
- The current Probe target list is used for structural validation. The paired Finding excerpt and Run may come from different capture times. Exact historical replay against a Campaign's frozen evaluation inputs remains future work.

## Review contract

`Finding.reviewHistory` is optional for backwards compatibility. New entries contain `id`, `status`, `note` (1–2,000 characters), `at`, and `runIds`. No identity is fabricated: there is no authenticated actor in this local app. Existing demo review states are retained without invented notes.

The reducer appends review history. Deriving new Findings preserves that history and human-owned status. Reviews do not rewrite the original Claim assessments. The interface guards draft creation until the Finding is confirmed and its denominator is nonempty; existing linked drafts remain accessible.

These are local records, not an immutable or authenticated audit log. The user can edit browser storage. A failed browser save displays a persistent warning while retaining the live workspace in memory, so related evidence can still be exported. The pack is not a substitute for full-workspace backup.

## Pack format and scope

Exports use `mirror.evidence-pack.v3` when source history or an unavailable capture date is present, and v2 otherwise. The verifier accepts genuine v1/v2/v3 packs. The pack contains:

- `format`, `exportedAt`
- `payload.workspace`: ID, name, display name, canonical domain and demo flag
- `payload.finding`: saved evidence, status and review history
- `payload.probes` and `payload.runs`: relevant questions and complete answers with all recorded assessments and provenance
- `payload.claims` and `payload.sources`: the references needed by those Probes / assessments; Source claim membership is narrowed to the included Claims
- `payload.actions`: drafts/experiments linked to this Finding
- `fingerprint`: `{ algorithm: "SHA-256", value: "<lowercase hex>" }`

v2 preserves optional Run input snapshots and Action measurement plans/evaluation history. A v1 label containing those v2 fields is rejected. Runs referenced only by saved reviews or experiment tallies (including excluded Runs) are retained, along with their references. The read-only inspector shows the hypothesis, locked conditions and review notes. Internal experiment totals/references are validated; this does not establish causal improvement or re-evaluate the meaning of an answer.

The pack intentionally does **not** include the entire Workspace, unrelated Findings, full Campaign / failed-job ledgers, user accounts, credentials, or application settings. Run provenance may identify a Campaign that is not contained in the pack.

Full answers and Source excerpts may include other subjects, personal information or confidential content. Nothing is redacted automatically. A warning appears before preparation/download; inspect before sharing. Imported URLs remain inert text and are never fetched or executed. Import is read-only and has no path to WorkspaceProvider mutation.

## Fingerprint protocol

The fingerprint covers `{ format, exportedAt, payload }`, excluding the fingerprint field itself. Canonical serialization sorts object keys using JavaScript's default string ordering, preserves array order, emits JSON primitives, and omits undefined object properties. UTF-8 bytes are hashed using Web Crypto SHA-256. This is a versioned Mirror convention, not a claim of RFC 8785 compliance.

On read, the verifier checks the 5 MiB UTF-8 size limit before JSON parsing, strict Zod structure/version/enum/timestamp/bounds, fingerprint equality, entity ID uniqueness and internal references. The file selector checks size before reading the file. Array lengths are limited to 5,000 and text fields to 100,000 characters (review notes: 2,000). Verified values are independent and deeply frozen. A newer selected file supersedes an older asynchronous result.

The pack checksum detects accidental or un-rehashed changes. Anyone who changes the data can also recompute a checksum. This is **not** a signature, trusted timestamp, proof of authorship, proof of truth, independent verification of a Source hash, or validation of the nested Campaign/Run artifact hash protocol. Legacy fixture hashes remain explicitly untrusted metadata.

## Validation and remaining work

Local verification on 2026-09-04:

- `pnpm check`: typecheck, ESLint, 47 tests across 7 files, production build passed.
- `pnpm audit --audit-level high`: no known vulnerabilities reported at verification time.
- In-app Chromium browser: desktop 1440px, mobile 390px and narrow 320px layouts inspected; no page-level horizontal overflow at mobile widths.
- Pack preparation rendered the expected Run/Source counts and matching replay totals. Keyboard Tab from the last dialog action returned to the close button; Escape restored focus to the initiating button.
- Read-only file verification, note persistence/reopening, file-selection races and quota failures are covered by application tests. Broader cross-browser and screen-reader testing is not claimed.

Automated coverage lives in `incident.test.ts`, `evidencePack.test.ts`, and `IncidentRoom.test.tsx`, alongside existing campaign/metrics/application tests. It covers kind separation, unknown denominators, invalid target exclusion, history persistence/reopening, draft gating, pack round trips, tampering, strict versions, limits, reference errors, inert imported markup, read-only import and quota failures.

v0.5 adds a separate [full Workspace backup / copy restore](BACKUP_AND_RECOVERY.md). Evidence Packs remain scoped, read-only investigation artifacts and cannot be used for that restore path.

v0.6 also adds an Experiment Room: save a hypothesis, choose a captured baseline answer, lock comparison conditions and non-overlapping before/after windows, then save follow-up totals and a judgment note after the window closes. Unsupported legacy inputs and differing conditions are explicitly excluded. This is a descriptive comparison, not a randomized experiment or proof that a content change caused an improvement.

Still outside this slice: authenticated review authors, schema migration of future pack versions, cryptographic signatures, complete historical Source version storage, real Provider integration, broad browser/assistive-technology certification and real-user validation. Keep this repository private until data boundaries and the full user journey are reviewed for release.
