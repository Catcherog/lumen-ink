# Runtime Contract Evidence

`src/server/config/runtime.ephemeral.strict.test.ts` covers:

- complete explicit triple: `LUMEN_RUNTIME_MODE=ephemeral-demo`,
  `PERSISTENCE_BACKEND=disabled`, `AUTH_MODE=disabled`;
- missing `PERSISTENCE_BACKEND` → `EPHEMERAL_PERSISTENCE_BACKEND_REQUIRED`;
- missing `AUTH_MODE` → `EPHEMERAL_AUTH_MODE_REQUIRED`;
- blank values → the corresponding required error;
- non-disabled values → stable `*_MUST_BE_DISABLED` errors.

`src/server/index.ephemeral.test.ts` imports the real entrypoint with the
explicit triple and verifies health, redacted runtime discovery, exact Origin
CORS behavior, disabled auth, and disabled persistence routes. With the
ephemeral branch active, missing CloudBase/Provider persistence configuration
does not cause adapter selection or `ensureReady()` to run.
