# Workspace backup and recovery

Status: v0.8, private local development. No deployment, account, paid API or backend required.

## User workflow

1. Select the Workspace to preserve, then open **バックアップと復元** from the sidebar (mobile: open the menu).
2. Choose **バックアップを作成**, check the subject and record counts, then **バックアップJSONを保存**. Preparing a backup alone does not download it.
3. On restore, choose the JSON in **復元する**. File selection only validates and previews; it does not change the live workspace.
4. Check **内容を確認し、別の復元コピーとして追加します**, then **復元コピーを追加**. Open the new Workspace or switch back using the Workspace selector.
5. Retain the file in a safe location. It contains unencrypted original text; do not publish it without checking all contents.

This is a full snapshot of **one selected Workspace**, not all browser data. It includes Sources/Claims, Probes, full Runs and assessments, successful/failed/cancelled Campaign artifacts, Findings and review history, Actions, trend points and activity records. It preserves existing records; it does not reconstruct missing evidence. Browser preferences and other Workspaces are outside the snapshot. The Incident **Evidence Pack** is a different, smaller read-only format and cannot be restored here.

## Wire format and verification

Exports containing source revision history or a Finding with an explicitly unavailable capture date use `mirror.workspace-backup.v3`; other exports remain v2. Both contain `format`, `exportedAt`, `snapshot`, and `fingerprint: { algorithm: "SHA-256", value: "<hex>" }`. Verification accepts genuine v1/v2/v3 files, rejecting newer fields disguised as older formats. All available source versions and update notes are retained; missing historical versions are not reconstructed. See [source history](SOURCE_HISTORY.md).

The checksum covers `{ format, exportedAt, snapshot }` with the same sorted-object-key, array-order-preserving UTF-8 canonical JSON convention as [Evidence Pack](INCIDENT_ROOM.md). It is not RFC 8785, a signature, proof of truth/authorship, or independent verification of nested artifact hashes. Anyone can alter data and recompute the checksum.

Before state mutation the verifier checks:

- File byte size before reading; UTF-8 content size before JSON parsing: at most 20 MiB (UI label: 20 MB)
- Strict version, record shapes, enums, ISO timestamps and bounds; arrays at most 5,000 entries, text fields at most 100,000 characters, review notes at most 2,000
- Outer SHA-256 equality
- Unique entity identities and internal Claim/Source/Probe/Run/Finding/Action/review references
- Campaign workspace ancestry, unique job IDs and terminal job counts
- Both directions of Campaign artifact / top-level Run linkage, with matching saved Run content
- Captured Run input matches its Campaign job; experiment references, frozen baseline totals, follow-up totals and dates are internally consistent
- Live Source/citation URLs restricted to HTTP(S) without embedded username/password

Verified data is cloned and deeply frozen before preview. Restore validates again, so a caller cannot bypass checks by supplying a fabricated typed value. Choosing a newer file invalidates a pending older result; a failed validation never changes workspace state. The restore action is guarded against double submission. No restored job is automatically executed and no imported URL is fetched.

The validator preserves legacy incomplete target assessments if their entity references are valid. Those Runs remain excluded from metric denominators by the existing observation/incident contracts; restoring does not invent missing assessments.

## Copy identity and historical evidence

Only `snapshot.workspace` changes on restore:

- New `workspace-restored-<uuid>` local ID
- Display name with a restore time
- Appended `restoreHistory` entry: source Workspace ID, original backup fingerprint, export time, restore time

All historical Run/Campaign/Job IDs, data and hash strings stay unchanged. Campaigns may reference the current Workspace ID or one of its explicit restore ancestors. A subsequent Campaign is planned for the new local ID. A restored copy can itself be backed up and restored again; ancestry is retained. Identical record IDs across independent Workspace containers do not merge records. The restored `isDemo` flag stays unchanged; it is a data label, not an authenticity guarantee.

**デモデータを復元** only resets the built-in fixture IDs, not every Workspace carrying `isDemo`. Restored demo copies and user-created Workspaces are preserved.

## Unreadable storage and quota failures

Startup first migrates the supported v1/v2 localStorage structures, then validates every snapshot. A malformed JSON document, unsupported version, malformed nested record, broken reference, duplicate Workspace identity, or storage read error enters a **temporary protected mode**:

- The original stored value is not overwritten by demo initialization or subsequent changes.
- A temporary demo opens with a persistent warning. Work in this tab is not automatically saved.
- When readable as a raw string, **元の保存データを退避** downloads that original string without parsing/reformatting it. This recovery file is not a valid Workspace backup and is not auto-repaired/imported.
- Valid backups can still be restored temporarily and exported from memory. Restoring does not unlock saving or discard the protected original.

Do not close the tab before exporting any temporary changes you need. Repairing malformed original data requires diagnosis of the retained recovery file; the app intentionally does not clear localStorage on your behalf. If storage access itself was denied, the app cannot retrieve a recovery string and says the session is temporary.

If a later save fails (for example, quota exceeded), live data remains in memory with a persistent warning and a backup action. **A successful copy addition is not a guarantee of durable storage.** The 20 MiB file allowance does not guarantee localStorage has enough space. No automatic backup, cross-device sync, multi-tab conflict resolution, encryption, future-version migration, or large-history database is implemented.

## Verification and visual scope

The automated suite covers full round trips, copy/re-copy identity, preservation of successful/failed/cancelled artifacts, tampering, broken references, unsafe URLs, missing/duplicate Campaign Runs, oversized input, explicit confirmation, persistence/reload, demo-reset protection, file-selection races, quota fallback, and unreadable-storage preservation. Download tests inspect the generated file contents and object-URL cleanup; they do not certify every browser's file-save UI.

The palette is now white/light-blue/blue, with navy navigation and separate semantic warning/error/success colors. Core text/primary/badge token pairs are tested at 4.5:1 or higher. This is targeted contrast coverage, not whole-app accessibility certification. The main information layout is unchanged. Sidebar overflow is scrollable on short viewports; dialog keyboard focus remains trapped and returns to the trigger (mobile menu button on mobile).

Local in-app Chromium checks use desktop and mobile widths. Cross-browser, screen-reader and real-user validation remain future work. Keep the project private.

### Historical v0.5 verification on 2026-09-05

- `pnpm check`: typecheck, ESLint, 85 tests across 12 files, and production build passed.
- `pnpm audit --audit-level high`: no known vulnerabilities reported at verification time.
- In-app Chromium at 1440px, 390px and 320px: desktop/mobile appearance and backup dialog inspected; no page/dialog horizontal overflow in the checked states.
- An existing Workspace with 18 Runs and 2 Campaigns survived reload and produced a validated backup preview without resetting its history.
- Keyboard Tab wrapped inside the export dialog; Escape returned focus to the desktop trigger or mobile menu button.
- Freshly reloaded Overview reported no new browser errors. Duplicate same-day trend labels were fixed; static, uncomputed metric deltas and the misleading monthly-series label were removed. Actual input-file restore and quota/error flows are covered by application tests, not a cross-browser file-picker certification.
- No public deployment, remote push or paid Provider call was made.
