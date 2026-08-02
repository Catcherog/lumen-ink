# LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1

- Status: `awaiting_gpt_acceptance`
- Next actor: `gpt`
- Risk: `HIGH`
- Owner: `Codex`
- Branch: `codex/lumen-ephemeral-demo-runtime-01-fix-r1`
- Exact base: `origin/lumen/lumen-auth-throttle-id-fix-01-trae@e5fcd089d03fd9d4975cfaf3e85f1d5db9cb3392`
- Previous implementation: PR #6, kept Draft and superseded by this task
- Report: `docs/lumen-v2/reports/LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1-CODEX-REPORT.md`
- Evidence: `docs/lumen-v2/evidence/LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1/`

## Objective

Rebuild the ephemeral-demo runtime on the latest functionality baseline while
preserving the modular CORS policy, CloudBase NoSQL adapter/probe, authentication
hardening, timeout behavior, and PR #5 UX merge.

## Scope delivered

1. Request-scoped BYO Provider validation and routing for ephemeral `/api/edit`.
2. Full local Provider settings draft: switching Provider clears the draft key;
   Cancel does not call the parent commit; Save commits one complete value.
3. Strict `LUMEN_RUNTIME_MODE=ephemeral-demo` contract requiring both
   `PERSISTENCE_BACKEND=disabled` and `AUTH_MODE=disabled`, including missing and
   blank-value fail-closed errors.
4. Ephemeral boot branch that does not select persistence, call `ensureReady()`,
   create Worker/Throttle/ProjectService/GenerationService, or mount JWT-gated
   persistent routes.
5. Browser URL download fallback using `window.open(url, '_blank',
   'noopener,noreferrer')`; no URL proxy was added.
6. Public redacted `/api/runtime` descriptor and anonymous UI runtime gate;
   ephemeral UI hides login, project, history, and persistent controls.

## Acceptance status

Local implementation gates are recorded in the report and evidence directory.
Formal GPT acceptance, real Provider Preview verification, merge, and production
release remain pending. No production alias or production data was changed.

The frozen baseline state still contained the earlier CORS task as its active
task while this user-authorized fix was issued. This task supersedes that stale
active pointer for this implementation branch; the earlier task files remain
untouched for auditability.
