# LUMEN-EPHEMERAL-DEMO-RUNTIME-01 — Gate results

No real Provider or production service write is part of these gates.

## Final local gates

| Gate | Result |
| --- | --- |
| `npm test --prefix src/client` | PASS — 11 files, 198 tests |
| `npm test --prefix src/server` | PASS — 36 files, 306 tests |
| `npm run build --prefix src/client` | PASS — TypeScript + Vite production bundle |
| `npm run build --prefix src/server` | PASS — TypeScript compile |
| `node scripts/check-lumen-collab.mjs` | PASS — state/public-repo safety scan |
| `git diff --check` | PASS — no whitespace errors |

## Targeted contract evidence

- `index.ephemeral.test.ts`: real entrypoint boots in deployed ephemeral mode without CloudBase config, returns runtime descriptor, disables auth/Provider persistence routes, and rejects non-allowlisted origins.
- `routes/auth.ephemeral.test.ts`: disabled auth returns HTTP 409 without invoking a throttle.
- `routes/edit.ephemeral.test.ts`: request-scoped BYO edit path, missing key, response redaction, and persistence-shaped rejection.
- `services/providers/ephemeral.test.ts`: supported type/model validation.
- `services/providers/provider.logging.test.ts`: upstream body is not printed with a request-scoped key.
- `runtime.test.ts` and `utils/image.test.ts`: client runtime descriptor validation and Provider URL download/revocation.

## Boundary notes

- The frozen repository `STATE.json` still tracks `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01`; this branch adds an independent task card and does not alter that task's state machine.
- No Vercel deployment, public URL, real Provider request, CloudBase connection, merge, or push was performed.
