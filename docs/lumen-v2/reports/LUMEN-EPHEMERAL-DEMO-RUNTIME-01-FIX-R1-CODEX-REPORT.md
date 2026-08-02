# Implementation Report — LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1

Date: 2026-08-02
Owner: Codex
Risk: HIGH
Branch: `codex/lumen-ephemeral-demo-runtime-01-fix-r1`

## Verdict for this implementation round

Implementation complete on the exact latest functionality baseline. The branch
is ready for GPT acceptance review as a Draft PR candidate. It is not merged and
not released to Production.

## Baseline control

The branch was created from:

`origin/lumen/lumen-auth-throttle-id-fix-01-trae@e5fcd089d03fd9d4975cfaf3e85f1d5db9cb3392`

PR #6 at `061b667` was not cherry-picked wholesale. Its old-base diff removed
newer CORS, CloudBase NoSQL, Preview probe, auth, and UX files. The reapply is a
surgical additive/line-level port on top of the functionality baseline.

## Implemented fixes

### H-01 — Provider credential isolation

- Added a complete local draft to `EphemeralProviderSettings`.
- Provider type change immediately sets the draft `apiKey` to an empty string
  and selects the first model for the new Provider.
- Model/key edits remain local until Save.
- Cancel/close calls only `onClose`; it cannot mutate the parent configuration.
- Save commits one trimmed `{ type, defaultModel, apiKey }` object atomically.
- The client sends only the current ephemeral provider object to `/api/edit`.
- The server creates a request-scoped provider, never stores the key, rejects
  BYO provider bodies in persistent mode, and never returns the key.

### H-02 — Rebased functionality baseline

- New branch base is exactly `e5fcd089…` from the remote functionality branch.
- Current modular `security/cors.ts`, exact Origin handling, CloudBase NoSQL
  adapter/probe, auth timeout code, and PR #5 UX files remain present.
- The old inline-CORS/deletion-based PR #6 entrypoint was not reused.

### M-01 — Explicit three-switch runtime

When `LUMEN_RUNTIME_MODE=ephemeral-demo`, both of these must be present and
exactly equal to `disabled`:

- `PERSISTENCE_BACKEND`
- `AUTH_MODE`

Missing, blank, and conflicting values fail closed with stable error codes. The
ephemeral entrypoint does not select persistence, call `ensureReady()`, create a
worker, create the durable throttle, or construct project/generation services.

### M-02 — Safe Provider URL download

`downloadImageUrl()` downloads through browser `fetch()` + `Blob` when CORS
allows it. A fetch/blob CORS-like failure opens the original URL in a new tab
with `noopener,noreferrer`. No arbitrary URL server proxy was added.

## Verification

| Gate | Result |
|---|---|
| Client tests | PASS — 15 files / 213 tests |
| Server tests | PASS — 46 files / 555 tests |
| Client build | PASS |
| Server build/typecheck | PASS |
| Client lint | PASS |
| H-01 settings/request regressions | PASS |
| M-01 strict env regressions | PASS |
| M-02 download success/fallback regressions | PASS |
| Collaboration check | PASS |
| Production deployment | NOT PERFORMED |

Detailed command evidence is in
`docs/lumen-v2/evidence/LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1/`.

## Review boundary / next action

Real Provider CDN behavior was not claimed as verified. The M-02 fallback is the
implemented safety alternative. GPT should review the final diff, collaboration
check, and Draft PR metadata. PR #6 must remain Draft or be marked superseded;
this task does not authorize merge or Production release.
