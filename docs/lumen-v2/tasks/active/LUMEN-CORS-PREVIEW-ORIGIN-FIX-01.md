# LUMEN-CORS-PREVIEW-ORIGIN-FIX-01

> State-only task synchronization for the CORS-only replacement PR. The mixed UX/CORS PR #3 is not merged.

| Field | Value |
|-------|-------|
| Project ID | picture-edit / lumen-ink |
| Task ID | LUMEN-CORS-PREVIEW-ORIGIN-FIX-01 |
| Risk Level | MEDIUM |
| Status | implementation_complete_awaiting_merge |
| Next Actor | codex |
| CORS implementation SHA | `70249e954f0bba729fffc899da1b8fb7bb167d5e` |
| Replacement base SHA | `f41f1f26f54e7a0d258cee014f2df8121a153d24` |
| Replacement branch | `lumen/lumen-cors-preview-origin-fix-01-codex` |
| PR #3 status | SUPERSEDED_PENDING_REPLACEMENT |

## Evidence state

- `PREVIEW_CORS_VERIFICATION`: `PASS`
- `AUTH_FUNCTIONAL_VERIFICATION`: `BLOCKED_EXTERNAL_NETWORK`
- `PRODUCTION_ALIAS_MODIFIED`: `false`
- The Preview OPTIONS request returned `204` with the exact Preview origin.
- An unknown Origin returned structured `403 {"error":"CORS_ORIGIN_NOT_ALLOWED"}`.
- A valid Preview Origin reached `/api/auth` and retained CORS headers; the downstream `503` was caused by CloudBase `connect timeout`, not CORS.

## Replacement PR boundary

The replacement branch must be based on the exact replacement base SHA and must contain no UX files. Production code changes are limited to:

- `src/server/security/cors.ts`
- `src/server/security/cors.test.ts`
- `src/server/index.ts`

The 16 UX files remain intentionally excluded and require a separate task and review. Do not merge PR #3 or change the Production Alias. Do not modify auth, throttle, or CloudBase behavior to remove the external timeout.
