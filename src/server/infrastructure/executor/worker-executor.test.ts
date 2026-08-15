/**
 * BUSOS-P5-X01 regression test — worker executor enqueue MUST execute the
 * Job to a terminal state synchronously (within the caller's invocation).
 *
 * Root cause being locked in: on Vercel serverless the in-process setInterval
 * poll loop (`start()`) is frozen after the HTTP response is sent, so a
 * fire-and-forget `processQueue()` never completed and queued Jobs were never
 * executed within the BUSOS poll window — surfacing as `GENERATION_FAILED`.
 *
 * This test pins the contract that `executor.enqueue` drives the Job to a
 * terminal state before returning, using the REAL executor + REAL local
 * persistence and only faking the image provider (which is the legitimate
 * external boundary per §19).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLocalPersistence } from '../persistence/local.js';
import { createWorkerJobExecutor } from './index.js';
import { GenerationService } from '../../services/GenerationService.js';
import type { PersistenceDependencies } from '../../domain/persistence.js';

function withDeps(): PersistenceDependencies {
  const root = mkdtempSync(path.join(tmpdir(), 'lumen-exec-'));
  return createLocalPersistence({ rootDir: root });
}

async function seedProject(
  deps: PersistenceDependencies,
  projectId: string,
  inputAssetId: string,
  inputVersionId: string,
): Promise<string> {
  await deps.projects.create({
    id: projectId,
    name: 'regression',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const inputStorageKey = `projects/${projectId}/original/${inputAssetId}.bin`;
  await deps.assets.create({
    id: inputAssetId,
    projectId,
    storageKey: inputStorageKey,
    mimeType: 'image/png',
    sizeBytes: 4,
    createdAt: new Date().toISOString(),
  });
  await deps.versions.create({
    id: inputVersionId,
    projectId,
    assetId: inputAssetId,
    label: 'v0',
    createdAt: new Date().toISOString(),
  });
  await deps.projects.updatePointers(projectId, { activeVersionId: inputVersionId });
  await deps.objects.put(inputStorageKey, new Uint8Array([1, 2, 3, 4]), 'image/png');
  return inputStorageKey;
}

describe('BUSOS-P5-X01 — worker executor enqueue executes synchronously', () => {
  it('drives a queued Job to succeeded within createJob (serverless-safe)', async () => {
    const deps = withDeps();
    const projectId = 'proj_succ';
    const inputVersionId = 'ver_succ';
    await seedProject(deps, projectId, 'asset_succ', inputVersionId);

    const fakeBytes = new Uint8Array([9, 9, 9, 9, 9, 9]);
    const providerFactory = async () => ({ bytes: fakeBytes, mimeType: 'image/png' });

    // Do NOT call start() — exercises the enqueue path directly (no interval).
    const worker = createWorkerJobExecutor({ deps, providerFactory, pollIntervalMs: 50, leaseSeconds: 60 });
    const generationService = new GenerationService(deps, worker.executor);

    const job = await generationService.createJob({
      projectId,
      prompt: 'make it blue',
      inputVersionId,
      idempotencyKey: 'idem_succ',
    });
    expect(job.status).toBe('queued');

    // After createJob returns, the Job MUST already be terminal (synchronous enqueue).
    const terminal = await generationService.getJob(job.id);
    expect(terminal).not.toBeNull();
    expect(terminal!.status).toBe('succeeded');
    expect(terminal!.resultVersionId).toBeTruthy();

    // Result asset bytes are exactly the (faked) provider output.
    const resultVersion = await deps.versions.get(terminal!.resultVersionId!);
    expect(resultVersion).not.toBeNull();
    const resultAsset = await deps.assets.get(resultVersion!.assetId);
    expect(resultAsset).not.toBeNull();
    const resultBytes = await deps.objects.get(resultAsset!.storageKey);
    expect(Array.from(resultBytes)).toEqual(Array.from(fakeBytes));
  });

  it('records a real errorCode (never a silent null) when the provider fails', async () => {
    const deps = withDeps();
    const projectId = 'proj_fail';
    const inputVersionId = 'ver_fail';
    await seedProject(deps, projectId, 'asset_fail', inputVersionId);

    const providerFactory = async () => {
      throw new Error('PROVIDER boom');
    };
    const worker = createWorkerJobExecutor({ deps, providerFactory, pollIntervalMs: 50, leaseSeconds: 60 });
    const generationService = new GenerationService(deps, worker.executor);

    const job = await generationService.createJob({
      projectId,
      prompt: 'x',
      inputVersionId,
      idempotencyKey: 'idem_fail',
    });
    const terminal = await generationService.getJob(job.id);
    expect(terminal!.status).toBe('failed');
    // Crucial: the failure carries a real, classified errorCode — NOT null
    // (null is what the BUSOS adapter mislabeled as GENERATION_FAILED).
    expect(terminal!.errorCode).toBeTruthy();
    expect(terminal!.errorCode).not.toBe('GENERATION_FAILED');
  });
});
