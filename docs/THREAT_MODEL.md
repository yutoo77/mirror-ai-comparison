# Threat model

## Current frontend demo

### Assets

- User-created Workspace data in localStorage
- Manually pasted AI answers and citation URLs in localStorage
- Fictional demo fixtures
- No provider API key
- No authentication token

### Current controls

- No external provider request
- Reserved `.example` domains for fixtures
- Demo / local Workspace boundary shown in UI
- SHA-256 for Source, Campaign, every Job outcome, and Run payloads
- Zod validation at the persistence boundary
- No raw HTML rendering
- Strict size/schema/reference/checksum checks before backup restore; a separate copy only
- HTTP(S)-only source/citation URLs without embedded credentials at entry and restore boundaries; no automatic fetching
- Unreadable stored data is preserved without automatic fallback writes; quota failure keeps live data exportable

The current demo is not a production security boundary. Browser users can edit their own localStorage by design.

Client-side SHA-256 is an integrity fingerprint, not a digital signature. It detects accidental divergence when the expected hash is trusted, but it does not stop a user or script that can rewrite both payload and hash.

### Local backup boundary

Workspace backups contain full text and all saved history for one selected Workspace. They are not encrypted, redacted, authenticated, or safe to publish by default. Import does not execute campaigns or send URLs to a fetcher. The app checks references and checksum, but does not independently verify the truth of content, authorship, timestamps, or nested Source/Run/Campaign hashes. Historical IDs remain unchanged inside the restored evidence; a new local container ID and explicit restore ancestry keep the copy separate.

The 20 MiB input cap is not a storage capacity promise. localStorage quotas vary; a restore may be usable in memory but fail to persist. A warning and export path remain available. Unreadable localStorage locks automatic saving until the underlying issue is dealt with; the app offers verbatim recovery export, not automatic repair or destructive reset. Concurrent tabs, cross-device sync, encryption, retention controls, and malicious same-origin code are not addressed by this local-only milestone. See [backup protocol](BACKUP_AND_RECOVERY.md).

## Production trust boundaries

```text
Browser → API → PostgreSQL
             ↘ Job queue → Worker → AI providers
                                  → External source URLs
                                  → Artifact storage
```

## Priority threats and mitigations

### Cross-workspace access

- Every record carries `workspaceId`
- Composite foreign keys and PostgreSQL Row Level Security
- API authorization on every use case
- CI tests for tenant boundary violations

### SSRF through source capture

- Resolve DNS before connection and reject private/reserved ranges
- Re-check every redirect and resolved address
- Restrict protocols, ports, content types, response size, and time
- Run fetcher in an isolated network policy

### Provider key exposure and cost abuse

- Keys only in API/Worker secret storage
- Per-workspace budget and rate limit
- Job idempotency and maximum repetitions
- Public demo never accepts arbitrary paid runs

### Prompt injection in fetched content

- Treat source content as untrusted data, never instructions
- Separate answer acquisition from Claim assessment
- Structured schemas and explicit tool allow-lists
- Persist evaluator version and rationale

### Audit tampering

- Append-only SourceSnapshot, ProbeRun, RunArtifact, AuditEvent
- SHA-256 content hashes
- Actor, time, schema version, and parent record linkage

### Sensitive data leakage

- Public sources only in the first release
- Warn users not to paste confidential provider conversations into the browser-only demo
- Manual answers remain local in this milestone and are not sent to Mirror servers or external Providers
- Redaction before provider calls and logs
- Structured logs omit answer bodies and secrets
- Retention and deletion policy per workspace

## Authentication target

- Managed OIDC
- Secure, HttpOnly, SameSite cookies
- CSRF protection for mutations
- Role-based permissions for owner, editor, reviewer, viewer
- MFA delegated to identity provider
