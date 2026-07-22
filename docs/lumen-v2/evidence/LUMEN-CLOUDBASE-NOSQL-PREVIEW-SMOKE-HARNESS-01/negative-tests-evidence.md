# LUMEN-CLOUDBASE-NOSQL-PREVIEW-SMOKE-HARNESS-01 —Negative Test Evidence

> **Generated**: 2026-07-22
> **Branch**: lumen/cloudbase-nosql-preview-smoke-harness-01-trae
> **Commit**: 3a89866 (FIX: Layer 1 equality + Layer 2 prod substring)
> **Purpose**: GPT evidence review FIX_REQUIRED —verify fail-closed behavior for 6 negative scenarios without real credentials

## No-SDK-Init Verification

The smoke harness script dynamically imports `@cloudbase/node-sdk` only inside `ensureReady()` (adapter line 363), which is called only inside `runSmoke()` at Step 3. For all 6 negative tests, `resolveConfig()` returns `skipped` or `blocked` before `runSmoke()` is invoked, so `ensureReady()` is never called and `@cloudbase/node-sdk` is never imported. Verification: each test output contains only Step 1 (`config-fail-closed`) in `steps[]`; Step 3 (`sdk-init-ensureReady`) is absent.

## Summary Table

| # | Test | Expected Overall | Actual Overall | Expected Exit | Actual Exit | Steps Present | No SDK Init | Pass |
|---|------|-----------------|----------------|--------------|-------------|---------------|-------------|------|
| 1 | test1-gate-missing | skipped | skipped | 0 | 0 | config-fail-closed | True | True |
| 2 | test2-runid-missing | blocked | blocked | 2 | 2 | config-fail-closed | True | True |
| 3 | test3-namespace-missing | blocked | blocked | 2 | 2 | config-fail-closed | True | True |
| 4 | test4-namespace-contains-prod | blocked | blocked | 2 | 2 | config-fail-closed | True | True |
| 5 | test5-namespace-equals-production | blocked | blocked | 2 | 2 | config-fail-closed | True | True |
| 6 | test6-storage-prefix-contains-prod | blocked | blocked | 2 | 2 | config-fail-closed | True | True |

## Detailed Outputs

### Test 1: test1-gate-missing

**Description**: gate missing (ALLOW_CLOUDBASE_PREVIEW_SMOKE not set)
**Exit code**: 0 (expected: 0) —match: True
**Overall**: skipped (expected: skipped) —match: True
**Steps present**: config-fail-closed (count: 1)
**No SDK init / no network**: True (only config step: True)
**Block reason**: ALLOW_CLOUDBASE_PREVIEW_SMOKE is not "true"; smoke harness defaults to no-write.

```json
{
  "smokeRunId": null,
  "namespace": null,
  "storagePrefix": null,
  "envIdMasked": null,
  "startedAt": "2026-07-22T05:38:23.630Z",
  "finishedAt": "2026-07-22T05:38:23.631Z",
  "overall": "skipped",
  "blockReason": "ALLOW_CLOUDBASE_PREVIEW_SMOKE is not \"true\"; smoke harness defaults to no-write.",
  "steps": [
    {
      "step": 1,
      "name": "config-fail-closed",
      "status": "skip"
    }
  ],
  "cleanupFailures": [],
  "redacted": true
}
```

### Test 2: test2-runid-missing

**Description**: run ID missing (SMOKE_RUN_ID empty)
**Exit code**: 2 (expected: 2) —match: True
**Overall**: blocked (expected: blocked) —match: True
**Steps present**: config-fail-closed (count: 1)
**No SDK init / no network**: True (only config step: True)
**Block reason**: SMOKE_RUN_ID is missing or empty.

```json
{
  "smokeRunId": null,
  "namespace": null,
  "storagePrefix": null,
  "envIdMasked": null,
  "startedAt": "2026-07-22T05:38:24.672Z",
  "finishedAt": "2026-07-22T05:38:24.672Z",
  "overall": "blocked",
  "blockReason": "SMOKE_RUN_ID is missing or empty.",
  "steps": [
    {
      "step": 1,
      "name": "config-fail-closed",
      "status": "fail",
      "error": "SMOKE_RUN_ID is missing or empty."
    }
  ],
  "cleanupFailures": [],
  "redacted": true
}
```

### Test 3: test3-namespace-missing

**Description**: namespace missing (CLOUDBASE_DATA_NAMESPACE empty)
**Exit code**: 2 (expected: 2) —match: True
**Overall**: blocked (expected: blocked) —match: True
**Steps present**: config-fail-closed (count: 1)
**No SDK init / no network**: True (only config step: True)
**Block reason**: CLOUDBASE_DATA_NAMESPACE is missing or empty.

```json
{
  "smokeRunId": null,
  "namespace": null,
  "storagePrefix": null,
  "envIdMasked": null,
  "startedAt": "2026-07-22T05:38:25.619Z",
  "finishedAt": "2026-07-22T05:38:25.619Z",
  "overall": "blocked",
  "blockReason": "CLOUDBASE_DATA_NAMESPACE is missing or empty.",
  "steps": [
    {
      "step": 1,
      "name": "config-fail-closed",
      "status": "fail",
      "error": "CLOUDBASE_DATA_NAMESPACE is missing or empty."
    }
  ],
  "cleanupFailures": [],
  "redacted": true
}
```

### Test 4: test4-namespace-contains-prod

**Description**: namespace contains "prod" (Layer 2 defensive)
**Exit code**: 2 (expected: 2) —match: True
**Overall**: blocked (expected: blocked) —match: True
**Steps present**: config-fail-closed (count: 1)
**No SDK init / no network**: True (only config step: True)
**Block reason**: CLOUDBASE_DATA_NAMESPACE "prod-preview" contains "prod"; refusing to target production.

```json
{
  "smokeRunId": null,
  "namespace": null,
  "storagePrefix": null,
  "envIdMasked": null,
  "startedAt": "2026-07-22T05:38:26.571Z",
  "finishedAt": "2026-07-22T05:38:26.572Z",
  "overall": "blocked",
  "blockReason": "CLOUDBASE_DATA_NAMESPACE \"prod-preview\" contains \"prod\"; refusing to target production.",
  "steps": [
    {
      "step": 1,
      "name": "config-fail-closed",
      "status": "fail",
      "error": "CLOUDBASE_DATA_NAMESPACE \"prod-preview\" contains \"prod\"; refusing to target production."
    }
  ],
  "cleanupFailures": [],
  "redacted": true
}
```

### Test 5: test5-namespace-equals-production

**Description**: namespace equals non-prod Production namespace (Layer 1 equality)
**Exit code**: 2 (expected: 2) —match: True
**Overall**: blocked (expected: blocked) —match: True
**Steps present**: config-fail-closed (count: 1)
**No SDK init / no network**: True (only config step: True)
**Block reason**: CLOUDBASE_DATA_NAMESPACE "lumen" equals declared Production namespace "lumen"; refusing to target production.

```json
{
  "smokeRunId": null,
  "namespace": null,
  "storagePrefix": null,
  "envIdMasked": null,
  "startedAt": "2026-07-22T05:38:27.482Z",
  "finishedAt": "2026-07-22T05:38:27.483Z",
  "overall": "blocked",
  "blockReason": "CLOUDBASE_DATA_NAMESPACE \"lumen\" equals declared Production namespace \"lumen\"; refusing to target production.",
  "steps": [
    {
      "step": 1,
      "name": "config-fail-closed",
      "status": "fail",
      "error": "CLOUDBASE_DATA_NAMESPACE \"lumen\" equals declared Production namespace \"lumen\"; refusing to target production."
    }
  ],
  "cleanupFailures": [],
  "redacted": true
}
```

### Test 6: test6-storage-prefix-contains-prod

**Description**: storage prefix contains "prod" (Layer 2 defensive)
**Exit code**: 2 (expected: 2) —match: True
**Overall**: blocked (expected: blocked) —match: True
**Steps present**: config-fail-closed (count: 1)
**No SDK init / no network**: True (only config step: True)
**Block reason**: CLOUDBASE_STORAGE_PREFIX "prod-data/" contains "prod"; refusing to target production.

```json
{
  "smokeRunId": null,
  "namespace": null,
  "storagePrefix": null,
  "envIdMasked": null,
  "startedAt": "2026-07-22T05:38:28.540Z",
  "finishedAt": "2026-07-22T05:38:28.541Z",
  "overall": "blocked",
  "blockReason": "CLOUDBASE_STORAGE_PREFIX \"prod-data/\" contains \"prod\"; refusing to target production.",
  "steps": [
    {
      "step": 1,
      "name": "config-fail-closed",
      "status": "fail",
      "error": "CLOUDBASE_STORAGE_PREFIX \"prod-data/\" contains \"prod\"; refusing to target production."
    }
  ],
  "cleanupFailures": [],
  "redacted": true
}
```

