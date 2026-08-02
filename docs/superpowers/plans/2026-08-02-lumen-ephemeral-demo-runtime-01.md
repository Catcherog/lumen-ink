# Lumen Ephemeral Demo Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit `ephemeral-demo` runtime that can serve the editor, accept a browser-provided BYO image-model key, call `/api/edit`, and download the result without initializing CloudBase, authentication persistence, project persistence, or CloudBase Storage.

**Architecture:** `LUMEN_RUNTIME_MODE=ephemeral-demo` is parsed before persistent secrets or adapters are required. The server exposes a public, redacted runtime descriptor, a fast structured disabled-auth response, and a public legacy `/api/edit` route that constructs a provider only from the current request. The client gates on the runtime descriptor, bypasses the password page only for this explicit mode, keeps the BYO key in tab memory, disables local history persistence, and uses browser Blob downloads for base64 or provider URLs. Persistent mode keeps its current CloudBase/JWT/project route wiring.

**Tech Stack:** Express 4, TypeScript, React 19, Axios, Vitest, Testing Library, Sharp, existing ProviderFactory/Provider implementations, Vercel Serverless.

## Global Constraints

- The mode must be explicit; database errors must never auto-enable anonymous access.
- In `ephemeral-demo`, no CloudBase PostgreSQL/NoSQL adapter, auth throttle repository, V2 worker, project route, or CloudBase Storage path may be initialized or called.
- `AUTH_MODE=disabled` and `PERSISTENCE_BACKEND=disabled` are accepted only together with `LUMEN_RUNTIME_MODE=ephemeral-demo`; contradictory values fail closed.
- CORS remains exact-origin allowlist based; never add `Access-Control-Allow-Origin: *`.
- BYO API keys may exist only in request memory and the browser's current tab memory; never persist, log, return, or commit them.
- Existing persistent mode routes and CloudBase adapter tests must remain green.
- Do not merge `region-switch-retest`, merge `main`, deploy Production, or repair CloudBase connectivity in this task.
- Every production-code change follows a red test, expected failure, minimal green implementation, and fresh regression run.

---

### Task 1: Explicit runtime configuration and public runtime contract

**Files:**
- Modify: `src/server/config/runtime.ts`
- Test: `src/server/config/runtime.test.ts`
- Create: `src/server/routes/runtime.ts`
- Test: `src/server/routes/runtime.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- `RuntimeConfig.runtimeMode: 'persistent' | 'ephemeral-demo'`
- `RuntimeConfig.persistence: 'enabled' | 'disabled'`
- `RuntimeConfig.authMode: 'password' | 'disabled'`
- `toPublicRuntimeConfig(config): PublicRuntimeConfig`
- `GET /api/runtime` returns only `runtimeMode`, `persistence`, `auth`, and feature booleans.

- [ ] **Step 1: Write failing configuration tests.** Add cases asserting that `LUMEN_RUNTIME_MODE=ephemeral-demo` with an allowlist succeeds without `AUTH_PASSWORD`, `JWT_SECRET`, `PROVIDER_ENCRYPTION_KEY`, provider environment keys, or CloudBase variables; contradictory `PERSISTENCE_BACKEND=cloudbase-nosql` or `AUTH_MODE=password` throws a stable error; persistent mode keeps the existing required-secret behavior.

```ts
it('loads ephemeral-demo without persistent secrets or CloudBase config', () => {
  const config = loadRuntimeConfig({
    VERCEL: '1',
    VERCEL_ENV: 'production',
    LUMEN_RUNTIME_MODE: 'ephemeral-demo',
    PERSISTENCE_BACKEND: 'disabled',
    AUTH_MODE: 'disabled',
    CORS_ALLOWLIST: 'https://lumen-ink.vercel.app',
  });

  expect(config).toMatchObject({
    runtimeMode: 'ephemeral-demo',
    persistence: 'disabled',
    authMode: 'disabled',
    isDeployed: true,
  });
});
```

- [ ] **Step 2: Run the configuration tests and verify the new test fails for the missing runtime mode contract.**

Run: `npm run test --prefix src/server -- config/runtime.test.ts`

Expected: FAIL because the current loader has no `runtimeMode`, does not accept the explicit disabled backends, and still requires persistent secrets.

- [ ] **Step 3: Implement the smallest explicit mode parser.** Parse `LUMEN_RUNTIME_MODE` before deployed persistent validation. In ephemeral mode require exact-origin CORS in deployed environments, accept only `PERSISTENCE_BACKEND` absent/`disabled` and `AUTH_MODE` absent/`disabled`, and return empty internal secret fields that are never used by the ephemeral wiring. Keep the existing persistent branch unchanged except for adding the new descriptor fields.

- [ ] **Step 4: Write failing public-contract tests.** Assert `toPublicRuntimeConfig` and `GET /api/runtime` never expose environment IDs, provider keys, connection URLs, or secret fields, and that ephemeral mode reports `runtimeMode=ephemeral-demo`, `persistence=disabled`, `auth=disabled`, `authentication=false`, `persistence=false`, `cloudHistory=false`, and `manualDownload=true`.

- [ ] **Step 5: Run the route tests to verify the expected failure, then add the route and mount it before auth/persistence routes.** The route must be public and read-only.

Run: `npm run test --prefix src/server -- routes/runtime.test.ts`

Expected before implementation: FAIL because `/api/runtime` is not mounted and the public response helper does not exist.

- [ ] **Step 6: Run the full configuration and runtime route tests.**

Run: `npm run test --prefix src/server -- config/runtime.test.ts routes/runtime.test.ts`

Expected: PASS with zero failures.

---

### Task 2: Request-scoped BYO Provider and structured edit errors

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/server/services/providers/ProviderFactory.ts`
- Create: `src/server/services/providers/ephemeral.ts`
- Test: `src/server/services/providers/ephemeral.test.ts`
- Modify: `src/server/routes/edit.ts`
- Test: `src/server/routes/edit.ephemeral.test.ts`
- Modify: `src/server/security/redaction.ts`
- Modify: `src/server/services/providers/SeedreamProvider.ts`
- Modify: `src/server/services/providers/OpenAIProvider.ts`
- Modify: `src/server/services/providers/GLMProvider.ts`
- Modify: `src/server/services/providers/GeminiProvider.ts`

**Interfaces:**
- `EphemeralProviderConfig` contains only provider type, model, optional display name/base URL, and the current request's `apiKey`.
- `createProvider(config: ProviderConfig): ImageProvider` is exported for request-scoped construction; existing `getProvider()` continues to use `ProviderStore` in persistent mode.
- `createEphemeralProvider(input: unknown): { config: ProviderConfig; provider: ImageProvider } | { errorCode: string; status: number }` validates a non-empty key, implemented provider type, and allowed model before constructing the provider.
- `createEditRouter(generationService?: GenerationService, options?: { runtimeMode?: RuntimeMode })` supports the existing persistent tests and the new public ephemeral legacy path.

- [ ] **Step 1: Write failing provider-normalization tests.** Cover missing/blank API key (`PROVIDER_KEY_MISSING`), unsupported provider type, allowed Seedream model, key not copied into a sanitized/loggable response, and construction without reading `ProviderStore` or persistence.

- [ ] **Step 2: Run the provider tests and confirm they fail because request-scoped construction is absent.**

Run: `npm run test --prefix src/server -- services/providers/ephemeral.test.ts`

Expected: FAIL with missing module/function or missing validation behavior.

- [ ] **Step 3: Export the existing ProviderFactory constructor and implement request-scoped validation.** Use stable IDs and metadata only in memory; never write to `ProviderStore`. Restrict models using `PROVIDER_MODELS` for the supplied provider type. Do not include `apiKey` in any returned DTO.

- [ ] **Step 4: Write failing ephemeral edit route tests.** Build an Express app with `createEditRouter(undefined, { runtimeMode: 'ephemeral-demo' })` and a stub request-scoped provider. Assert missing key returns a fast structured `PROVIDER_KEY_MISSING`, valid input reaches the provider and returns an edit result, `projectId` returns `PERSISTENCE_DISABLED`, and provider statuses map to `PROVIDER_AUTH_FAILED`, `PROVIDER_MODEL_FORBIDDEN`, `PROVIDER_RATE_LIMITED`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, or `PROVIDER_NETWORK` with a request ID and no key/base64 in the body.

- [ ] **Step 5: Run the route tests to observe the expected failures.**

Run: `npm run test --prefix src/server -- routes/edit.ephemeral.test.ts`

Expected: FAIL because the current route always uses `ProviderStore`, requires a generation service for V2 discrimination, and returns legacy free-form errors.

- [ ] **Step 6: Add the ephemeral branch without changing the persistent branch's request contract.** For `runtimeMode=ephemeral-demo`, reject V2/project-shaped requests with `PERSISTENCE_DISABLED`, validate `body.provider`, construct the provider only for that request, validate the image with the existing Sharp-based validator, call `generate/edit/chat`, reject empty provider responses as `EDIT_RESPONSE_INVALID`, and return `{ success, errorCode, message, requestId }` on failures. Preserve the current persistent legacy/V2 behavior for all other modes.

- [ ] **Step 7: Make provider upstream logs safe.** Replace raw `errorText` logging in each provider with `redactString` output so Authorization-like strings, API-key patterns, data URIs, and long base64 payloads cannot enter logs. Extend public-message mappings for the new stable error codes.

- [ ] **Step 8: Run the provider and ephemeral route tests again, then run existing edit compatibility tests.**

Run: `npm run test --prefix src/server -- services/providers/ephemeral.test.ts routes/edit.ephemeral.test.ts routes/edit.compat.test.ts`

Expected: PASS with zero failures.

---

### Task 3: Auth and persistence route gating without CloudBase initialization

**Files:**
- Modify: `src/server/routes/auth.ts`
- Test: `src/server/routes/auth.ephemeral.test.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/security/redaction.ts`
- Test: `src/server/routes/runtime.ephemeral.integration.test.ts`

**Interfaces:**
- `createAuthRouter({ config, throttle?, authMode? })` returns a fast structured disabled response in `authMode=disabled`.
- Persistent mode still creates `AuthThrottle` from the selected persistence adapter and mounts JWT middleware on protected routes.
- Ephemeral mode mounts only `/api/runtime`, `/api/health`, `/api/auth` disabled response, and public `/api/edit`; persistence/project/job/worker/detect routes are absent or return `PERSISTENCE_DISABLED` without touching CloudBase.

- [ ] **Step 1: Write failing auth tests.** Assert POST `/api/auth` in disabled mode returns a 409 (or the repository's chosen stable non-auth status) with `AUTH_DISABLED_IN_EPHEMERAL_MODE` in under the route handler's normal synchronous path, and that the injected throttle's methods are not called.

- [ ] **Step 2: Run the auth tests and verify they fail because the current route always calls the throttle.**

Run: `npm run test --prefix src/server -- routes/auth.ephemeral.test.ts`

Expected: FAIL because no disabled auth mode exists.

- [ ] **Step 3: Implement the explicit disabled branch and add the public persistence-disabled response.** Do not catch CloudBase errors and downgrade auth; branch solely on `runtimeConfig.authMode` / `runtimeConfig.runtimeMode`.

- [ ] **Step 4: Write an integration test around the real `src/server/index.ts` import path with CloudBase variables absent.** Set ephemeral env values, assert app import succeeds, `GET /api/health` returns the four-field runtime descriptor, `GET /api/runtime` is redacted, `POST /api/auth` is fast/structured, `/api/providers` and `/api/projects` do not initialize a persistence adapter, and `/api/probe` is not exposed in ephemeral mode.

- [ ] **Step 5: Refactor server startup by mode.** Load runtime config first; configure `ProviderStore`, call `selectPersistenceByEnv`, initialize CloudBase, create the worker, create the throttle, and construct `ProjectService`/`GenerationService` only inside the persistent branch. In ephemeral mode skip all of those and mount the request-scoped public edit router. Keep the existing persistent route graph unchanged. Add structured 403 handling for disallowed CORS origins and 413 handling for oversized JSON bodies.

- [ ] **Step 6: Run the integration and existing security/persistence selection tests.**

Run: `npm run test --prefix src/server -- routes/auth.ephemeral.test.ts routes/runtime.ephemeral.integration.test.ts security/security.integration.test.ts infrastructure/persistence/select.test.ts`

Expected: PASS with zero failures; no CloudBase connection attempt is made by the ephemeral tests.

---

### Task 4: Browser runtime gate, in-memory BYO settings, session-only editor, and download

**Files:**
- Modify: `src/client/src/main.tsx`
- Create: `src/client/src/runtime.ts`
- Test: `src/client/src/runtime.test.ts`
- Create: `src/client/src/components/EphemeralProviderSettings.tsx`
- Test: `src/client/src/components/EphemeralProviderSettings.test.tsx`
- Modify: `src/client/src/hooks/useEditor.ts`
- Test: `src/client/src/hooks/useEditor.test.ts`
- Modify: `src/client/src/App.tsx`
- Modify: `src/client/src/AppV2.tsx`
- Modify: `src/client/src/components/v2/EditorHeader.tsx`
- Modify: `src/client/src/components/ResultViewer.tsx`
- Modify: `src/client/src/utils/image.ts`
- Test: `src/client/src/utils/image.test.ts`
- Modify: `src/client/src/index.css`

**Interfaces:**
- `ClientRuntimeConfig` matches the public server descriptor and is loaded from `/api/runtime` before either app is rendered.
- `useEditor({ persistHistory?: boolean; ephemeralProvider?: EphemeralProviderConfig })` keeps the existing default behavior and omits local history load/save when persistence is disabled; ephemeral `/api/edit` requests include the current request-scoped provider config.
- `EphemeralProviderSettings` receives `value`/`onChange`, never renders the key value, and exposes Seedream/OpenAI model selection, masked key state, clear, and session-only explanatory copy.
- `downloadImageUrl(url, filename)` fetches the provider result, creates a Blob URL, clicks a download anchor, and revokes the URL; errors are surfaced to the editor.

- [ ] **Step 1: Write failing client runtime tests.** Assert the runtime loader requests `/api/runtime`, the gate distinguishes ephemeral from persistent mode, and an unavailable runtime descriptor does not silently render the editor anonymously.

- [ ] **Step 2: Run the client runtime tests to observe the expected failures.**

Run: `npm run test --prefix src/client -- runtime.test.ts`

Expected: FAIL because no public runtime loader/gate exists.

- [ ] **Step 3: Implement `RuntimeGate` in `main.tsx`.** Render a small loading state while fetching the descriptor, render a fail-closed error state on failure, and pass the descriptor to `App` or `AppV2`. In persistent mode keep token/login behavior; in ephemeral mode do not read or write `auth_token`, do not show `LoginPage`, and do not register an auth interceptor that can call `/api/auth`.

- [ ] **Step 4: Write failing settings tests.** Assert a configured key shows only a masked/boolean status, saving changes local React state without calling Axios, clearing removes it, and the component explains that refresh clears the key and no project/history/image is uploaded for persistence.

- [ ] **Step 5: Implement session-only provider settings and wire both `App` and `AppV2`.** Derive a synthetic `ephemeral-byo` provider metadata entry for the model selector; never fetch `/api/providers` in ephemeral mode. Hide/disable project persistence, legacy-history import, and logout controls in ephemeral mode; show a visible temporary-session banner. In `AppV2`, bypass `useProject.upload/generate` and use the legacy synchronous `/api/edit` path so no `/api/projects` request is made.

- [ ] **Step 6: Write failing editor/download tests.** Assert `useEditor` omits `edit_history` reads/writes when `persistHistory=false`, includes the provider config only in the edit request, maps stable provider error codes to distinct user messages, and `downloadImageUrl` fetches/blobs/revokes instead of calling `window.open`.

- [ ] **Step 7: Implement the session-only hook behavior and Blob URL download.** Keep base64 result downloads local; for URL results fetch the URL, create a temporary object URL, trigger an anchor download, and always revoke it. Do not add a server download route or CloudBase Storage dependency.

- [ ] **Step 8: Run focused client tests and both existing app/editor suites.**

Run: `npm run test --prefix src/client -- runtime.test.ts components/EphemeralProviderSettings.test.tsx hooks/useEditor.test.ts utils/image.test.ts`

Expected: PASS with zero failures.

---

### Task 5: Documentation, environment contract, full gates, and Draft PR package

**Files:**
- Modify: `.env.example`
- Modify: `src/server/.env.example`
- Modify: `README.md`
- Create: `docs/lumen-v2/tasks/active/LUMEN-EPHEMERAL-DEMO-RUNTIME-01.md`
- Create: `docs/lumen-v2/reports/LUMEN-EPHEMERAL-DEMO-RUNTIME-01-CODEX-REPORT.md`
- Create: `docs/lumen-v2/evidence/LUMEN-EPHEMERAL-DEMO-RUNTIME-01/`

- [ ] **Step 1: Document the exact environment contract.** Show `LUMEN_RUNTIME_MODE=ephemeral-demo`, `PERSISTENCE_BACKEND=disabled`, `AUTH_MODE=disabled`, and a concrete exact-origin `CORS_ALLOWLIST` example. State that BYO keys are transient, refresh clears them, results/history may disappear, and no Production deployment is implied.

- [ ] **Step 2: Run focused tests, then the full client/server test suites.**

Run: `npm test`

Expected: all pre-existing tests plus new tests pass with zero failures.

- [ ] **Step 3: Run typecheck/lint/build/diff/security gates from a clean feature worktree.**

Run: `npm run lint --prefix src/client`; `npm run build`; `node scripts/check-lumen-collab.mjs`; `git diff --check`

Expected: exit code 0 for each command, no key/base64/token findings, and no changes outside the task allowlist.

- [ ] **Step 4: Run the mode matrix without credentials.** Start/import the server with ephemeral env and absent CloudBase/auth/provider env vars; verify health/runtime/auth-disabled/CORS behavior locally. Use a stubbed provider test for the route contract. If no real Seedream response is available, record `NEEDS_RUNTIME_EVIDENCE` and do not claim online editing was verified.

- [ ] **Step 5: Capture the completion package.** Record baseline and final HEAD, branch, full status, changed files, test outputs, environment names without values, unverified runtime items, and the fact that `region-switch-retest` was not merged.

- [ ] **Step 6: Commit only the feature worktree changes, push `codex/lumen-ephemeral-demo-runtime-01`, and create a Draft PR.** Do not merge, deploy Production, or edit the shared dirty worktree. Include no secrets in commit messages, PR body, evidence, or screenshots.

---

## Self-review checklist

- [ ] Runtime mode and health contract cover AC-01–AC-03.
- [ ] Auth bypass is explicit and local to ephemeral mode; persistent auth remains fail-closed.
- [ ] No CloudBase adapter/throttle/worker/project route is constructed in ephemeral mode.
- [ ] BYO key lifecycle, masking, refresh behavior, and log redaction cover AC-08–AC-12 and AC-23.
- [ ] `/api/edit` provider result/error mapping and browser download cover AC-13–AC-18.
- [ ] Exact-origin CORS, upload/body limits, and image validation cover AC-19–AC-23.
- [ ] Existing persistent tests plus all required quality gates cover AC-25–AC-29.
- [ ] No placeholders or unverified online claims appear in the report.
