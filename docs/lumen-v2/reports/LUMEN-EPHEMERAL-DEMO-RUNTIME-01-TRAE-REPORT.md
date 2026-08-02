# LUMEN-EPHEMERAL-DEMO-RUNTIME-01 — Implementation Report

## Result

Implemented the explicit `ephemeral-demo` runtime on branch `codex/lumen-ephemeral-demo-runtime-01`. The branch is intentionally not merged or deployed. The checkout's frozen `STATE.json` still points to the unrelated CloudBase NoSQL task; this implementation is kept as an independent user-authorized task and does not advance or rewrite that state machine.

## Changed boundaries

- Runtime config now requires the explicit combination `ephemeral-demo` / `disabled` / `disabled` and exposes a secret-free `/api/runtime` descriptor.
- The server boot path skips persistence selection, CloudBase readiness, ProviderStore configuration, Worker creation, project/generation services, and auth throttle in ephemeral mode.
- `/api/auth` returns a structured disabled response; `/api/providers` returns `PERSISTENCE_DISABLED`; `/api/edit` is public and request-scoped.
- BYO Provider creation validates supported types/models and keeps the API Key only in the request-scoped provider object. Stable provider/edit errors are redacted.
- Upstream Provider error logs no longer print raw response bodies.
- CORS remains exact-origin allowlist based, with a structured rejection response; no wildcard origin was added.
- The browser has a fail-closed runtime gate, session-only BYO settings, no auth/history localStorage access in ephemeral mode, hidden persistent-project/history UI, and Blob-based downloads for Provider URLs.

## Verification

Detailed command output is recorded in `docs/lumen-v2/evidence/LUMEN-EPHEMERAL-DEMO-RUNTIME-01/gate-results.md`.

## Not verified

- No real Provider API call was made.
- No Vercel deployment, public HTTP check, DNS/TLS check, CloudBase connection, production write, merge, or push was performed as part of implementation.
- Browser E2E against a deployed public origin remains a follow-up acceptance boundary.
