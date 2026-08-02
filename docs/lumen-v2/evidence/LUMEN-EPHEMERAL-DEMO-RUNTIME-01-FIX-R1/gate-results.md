# Gate Results — LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1

Evidence is local to the exact rebased worktree. It is not production or real
Provider accuracy evidence.

## Baseline

- Remote functionality branch: `lumen/lumen-auth-throttle-id-fix-01-trae`
- Base SHA: `e5fcd089d03fd9d4975cfaf3e85f1d5db9cb3392`
- Worktree HEAD before implementation: exact base SHA
- Old PR #6 HEAD: `061b667`; it was not cherry-picked wholesale because its
  diff deleted newer CORS, NoSQL, probe, authentication, and UX files.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| Client tests | PASS — 15 files / 213 tests | `npm test` in `src/client` |
| Server tests | PASS — 46 files / 555 tests | `npm test` in `src/server` |
| Client build | PASS | `npm run build --prefix src/client` |
| Server build/typecheck | PASS | `npm run build --prefix src/server` |
| Client lint | PASS | `npm run lint --prefix src/client` |
| `git diff --check` | PASS | clean output (only CRLF normalization warnings) |
| Collaboration check | PASS | `node scripts/check-lumen-collab.mjs` |

## Boundary

No real Provider result was requested or verified from Preview. The download
fallback is verified by browser-environment unit tests for successful fetch/blob
download, CORS-like fetch rejection, safe window features, and HTTP failure.
