# Runtime contract evidence

## Server-side contract

- `src/server/config/runtime.ts` parses `LUMEN_RUNTIME_MODE` and rejects non-disabled persistence/auth settings in `ephemeral-demo`.
- `src/server/index.ts` gates persistence selection and auth throttle construction behind `runtimeConfig.persistence === 'enabled'`.
- `src/server/index.ephemeral.test.ts` imports the real server entrypoint with deployed-mode ephemeral env and verifies boot, health/runtime descriptors, disabled auth, disabled Provider routes, and exact-origin CORS.

## Request-scoped editing contract

- `src/server/services/providers/ephemeral.ts` validates the request-level Provider type, model, and non-empty key.
- `src/server/routes/edit.ephemeral.test.ts` verifies missing-key failure, request-scoped provider execution, absence of the key from the response, and persistence-shaped request rejection.
- `src/server/services/providers/provider.logging.test.ts` verifies an upstream body that echoes the request key is not printed to logs.

## Client-side contract

- `src/client/src/runtime.ts` validates the public descriptor before rendering either editor.
- `src/client/src/components/EphemeralProviderSettings.tsx` holds the typed Key in component state only and never pre-fills it into the password input.
- `useEditor({ persistHistory: false, ephemeralProvider })` disables local history storage and adds only the request-scoped provider payload.
- `downloadImageUrl` fetches a Provider URL into a browser-owned Blob and revokes the object URL after download.
