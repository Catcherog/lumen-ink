# LUMEN-CORS-PREVIEW-ORIGIN-FIX-01

> State-only task synchronization for the CORS-only replacement PR. The mixed UX/CORS PR #3 is not merged.

| Field | Value |
|-------|-------|
| Project ID | picture-edit / lumen-ink |
| Task ID | LUMEN-CORS-PREVIEW-ORIGIN-FIX-01 |
| Risk Level | MEDIUM |
| Status | open_draft_awaiting_gpt_acceptance |
| Next Actor | gpt |
| CORS implementation SHA | `70249e954f0bba729fffc899da1b8fb7bb167d5e` |
| Replacement base SHA | `f41f1f26f54e7a0d258cee014f2df8121a153d24` |
| Replacement branch | `lumen/lumen-cors-preview-origin-fix-01-codex` |
| Replacement PR | `#4` — Open / Draft / awaiting GPT acceptance |
| Replacement PR Head | `515e5708eb3a6673782982ba7a7b415e8d8bc25b` |
| Preview URL | `https://lumen-cjiuzclxy-catcher1.vercel.app` |
| Preview Deployment ID | `dpl_C3T44QsLHtHEBYaFGPVEUwuzX8BF` |
| PR #3 status | OPEN_SUPERSEDED_BY_PR_4 |

## Evidence state

- `PREVIEW_CORS_VERIFICATION`: `PASS`
- `AUTH_FUNCTIONAL_VERIFICATION`: `PARTIAL_PASS_INVALID_PASSWORD_PATH`
- `CLOUDBASE_CONNECTIVITY_STATUS`: `PASS_FOR_CURRENT_PREVIEW_REQUEST_NOT_STABILITY_VERIFIED`
- `PRODUCTION_ALIAS_MODIFIED`: `false`
- The Preview OPTIONS request returned `204` with the exact Preview origin.
- An unknown Origin returned structured `403 {"error":"CORS_ORIGIN_NOT_ALLOWED"}`.
- The current PR #4 Preview valid Origin reached `/api/auth` and returned `401 {"error":"密码错误"}` with the correct CORS header.
- That `401` proves the invalid-password auth path and confirms both `throttle.isBlocked` and `throttle.recordFailure` completed for this request.
- Historical boundary: an earlier Preview deployment returned CloudBase `connect timeout` `503`; that older result is retained as history and does not describe PR #4's current Preview response.
- Not yet verified: successful-password login and long-term CloudBase connectivity stability.

## Replacement PR boundary

The replacement branch must be based on the exact replacement base SHA and must contain no UX files. Production code changes are limited to:

- `src/server/security/cors.ts`
- `src/server/security/cors.test.ts`
- `src/server/index.ts`

The 16 UX files remain intentionally excluded and require a separate task and review. Do not merge PR #3 or change the Production Alias. Do not modify auth, throttle, or CloudBase behavior to remove the external timeout.
