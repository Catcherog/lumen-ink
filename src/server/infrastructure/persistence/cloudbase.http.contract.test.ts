/**
 * PERSIST-001 P0-01B contract test: CloudBase PG Storage HTTP OpenAPI shape.
 *
 * Verifies the FIX_PACKET requirement:
 *  > PG Storage 请求 URL、方法、认证头、请求体和响应解析合同测试通过
 *
 * Uses a fetch mock to assert:
 *  - Upload:    POST  https://<envId>.api.tcloudbasegateway.com/v1/storages/object/<bucketId>/<objectName>
 *                Auth: Bearer <storageToken>
 *                Content-Type: <mimeType>
 *                Body: raw bytes
 *  - Download:  GET   same URL
 *                Auth: Bearer <storageToken>
 *                404 → OBJECT_NOT_FOUND
 *  - Delete:    DELETE same URL
 *                Auth: Bearer <storageToken>
 *                404 → no-op (success)
 *  - Exists:    HEAD  same URL
 *                Auth: Bearer <storageToken>
 *                200 → true; 404 → false
 *  - SignedURL: POST  https://<envId>.api.tcloudbasegateway.com/v1/storages/object/sign/<bucketId>/<objectName>
 *                Auth: Bearer <storageToken>
 *                Content-Type: application/json
 *                Body: {"expiresIn": <seconds>}
 *                Response body: {"signedURL": "...", "fullSignedURL": "..."}
 *
 * No real network calls are made. The mock records the URL, method, headers,
 * and body passed to each `fetch` invocation and the test asserts the shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCloudBasePersistence,
  putObject,
  getObject,
  deleteObject,
  objectExists,
  getSignedUrl,
  buildStorageBaseUrl,
  buildObjectUrl,
  buildSignedUrlEndpoint,
  type CloudBasePersistenceOptions,
} from './cloudbase.js';

const FIXED_OPTIONS: CloudBasePersistenceOptions = {
  postgresUrl: 'postgresql://user:pass@host:5432/db',
  envId: 'lumen-prod-env',
  bucketId: 'lumen-private-bucket',
  storageToken: 'test-service-role-token',
  signedUrlTtlSeconds: 900,
};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

let fetchCalls: FetchCall[] = [];
let fetchResponses: Map<string, Response> = new Map();

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  const init: ResponseInit = {
    status,
    headers,
  };
  if (typeof body === 'string') {
    return new Response(body, init);
  }
  if (body instanceof Uint8Array) {
    return new Response(body as BodyInit, init);
  }
  if (body !== undefined) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { ...init.headers, 'Content-Type': 'application/json' },
    });
  }
  return new Response(undefined, init);
}

function urlMatches(url: string, method: string): Response {
  // Find by exact URL + method match, fall back to method-only match.
  const key = `${method} ${url}`;
  let resp = fetchResponses.get(key);
  if (!resp) {
    // Default: 200 OK with empty body for HEAD/GET; 200 OK with empty JSON for others.
    if (method === 'HEAD') {
      resp = makeResponse(200, undefined);
    } else if (method === 'GET') {
      resp = makeResponse(200, new Uint8Array([1, 2, 3, 4]));
    } else {
      resp = makeResponse(200, {});
    }
  }
  return resp;
}

describe('PERSIST-001 P0-01B: CloudBase PG Storage HTTP OpenAPI shape', () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponses = new Map();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers: Record<string, string> = {};
      const initHeaders = init?.headers as Record<string, string> | undefined;
      if (initHeaders) {
        for (const [k, v] of Object.entries(initHeaders)) {
          headers[k] = v;
        }
      }
      let body: unknown;
      if (init?.body instanceof Uint8Array) {
        body = init.body;
      } else if (typeof init?.body === 'string') {
        body = init.body;
      } else if (init?.body) {
        body = init.body;
      }
      fetchCalls.push({ url: urlStr, method, headers, body });
      return urlMatches(urlStr, method);
    });
    void originalFetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('URL builder helpers', () => {
    it('buildStorageBaseUrl produces the official host', () => {
      expect(buildStorageBaseUrl('lumen-prod-env')).toBe(
        'https://lumen-prod-env.api.tcloudbasegateway.com'
      );
    });

    it('buildObjectUrl composes the object endpoint with literal path separators', () => {
      // Path segments remain literal between `/` (matching common object
      // storage convention); only individual segment contents are encoded.
      expect(buildObjectUrl('env-1', 'bucket-1', 'proj/asset/v1.png')).toBe(
        'https://env-1.api.tcloudbasegateway.com/v1/storages/object/bucket-1/proj/asset/v1.png'
      );
    });

    it('buildObjectUrl encodes reserved characters within a segment', () => {
      // A space inside a segment must be encoded to %20.
      expect(buildObjectUrl('env-1', 'bucket-1', 'my file.png')).toBe(
        'https://env-1.api.tcloudbasegateway.com/v1/storages/object/bucket-1/my%20file.png'
      );
    });

    it('buildSignedUrlEndpoint composes the sign endpoint with literal path separators', () => {
      expect(buildSignedUrlEndpoint('env-1', 'bucket-1', 'key/1')).toBe(
        'https://env-1.api.tcloudbasegateway.com/v1/storages/object/sign/bucket-1/key/1'
      );
    });
  });

  describe('putObject (upload)', () => {
    it('sends POST with Bearer auth, Content-Type, and raw body to the object URL', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      await putObject(FIXED_OPTIONS, 'proj/key.png', bytes, 'image/png');

      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0];
      expect(call.url).toBe(
        'https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/proj/key.png'
      );
      expect(call.method).toBe('POST');
      expect(call.headers['Authorization']).toBe(
        'Bearer test-service-role-token'
      );
      expect(call.headers['Content-Type']).toBe('image/png');
      // Body bytes match (Buffer is a Uint8Array subclass with identical contents).
      expect(call.body).toBeInstanceOf(Uint8Array);
      expect(Array.from(call.body as Uint8Array)).toEqual(Array.from(bytes));
    });

    it('throws OBJECT_PUT_FAILED on non-2xx response', async () => {
      fetchResponses.set(
        'POST https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/key',
        makeResponse(403, { error: 'forbidden' })
      );
      await expect(
        putObject(FIXED_OPTIONS, 'key', new Uint8Array([0]), 'image/png')
      ).rejects.toThrowError(/OBJECT_PUT_FAILED/);
    });
  });

  describe('getObject (download)', () => {
    it('sends GET with Bearer auth and returns bytes on 200', async () => {
      const bytes = new Uint8Array([10, 20, 30]);
      fetchResponses.set(
        'GET https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/key',
        makeResponse(200, bytes)
      );
      const out = await getObject(FIXED_OPTIONS, 'key');
      expect(out).toEqual(bytes);

      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0];
      expect(call.method).toBe('GET');
      expect(call.headers['Authorization']).toBe('Bearer test-service-role-token');
    });

    it('throws OBJECT_NOT_FOUND on 404', async () => {
      fetchResponses.set(
        'GET https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/missing',
        makeResponse(404, {})
      );
      await expect(getObject(FIXED_OPTIONS, 'missing')).rejects.toThrowError(
        /OBJECT_NOT_FOUND/
      );
    });
  });

  describe('deleteObject', () => {
    it('sends DELETE with Bearer auth', async () => {
      await deleteObject(FIXED_OPTIONS, 'key');
      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0];
      expect(call.method).toBe('DELETE');
      expect(call.headers['Authorization']).toBe('Bearer test-service-role-token');
    });

    it('404 is treated as success (idempotent delete)', async () => {
      fetchResponses.set(
        'DELETE https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/key',
        makeResponse(404, {})
      );
      await expect(deleteObject(FIXED_OPTIONS, 'key')).resolves.toBeUndefined();
    });

    it('non-2xx non-404 throws OBJECT_DELETE_FAILED', async () => {
      fetchResponses.set(
        'DELETE https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/key',
        makeResponse(500, {})
      );
      await expect(deleteObject(FIXED_OPTIONS, 'key')).rejects.toThrowError(
        /OBJECT_DELETE_FAILED/
      );
    });
  });

  describe('objectExists', () => {
    it('sends HEAD with Bearer auth; 200 → true', async () => {
      fetchResponses.set(
        'HEAD https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/key',
        makeResponse(200, undefined)
      );
      const exists = await objectExists(FIXED_OPTIONS, 'key');
      expect(exists).toBe(true);
      expect(fetchCalls[0].method).toBe('HEAD');
    });

    it('404 → false', async () => {
      fetchResponses.set(
        'HEAD https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/lumen-private-bucket/key',
        makeResponse(404, undefined)
      );
      const exists = await objectExists(FIXED_OPTIONS, 'key');
      expect(exists).toBe(false);
    });
  });

  describe('getSignedUrl', () => {
    it('sends POST with Bearer auth, JSON body {expiresIn}, and reads signedURL from response', async () => {
      fetchResponses.set(
        'POST https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/sign/lumen-private-bucket/key',
        makeResponse(200, {
          signedURL: 'https://signed.example.com/key?token=abc',
          fullSignedURL: 'https://signed.example.com/key?token=abc&full=1',
        })
      );
      const url = await getSignedUrl(FIXED_OPTIONS, 'key', 900);
      expect(url).toBe('https://signed.example.com/key?token=abc');

      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0];
      expect(call.method).toBe('POST');
      expect(call.headers['Authorization']).toBe('Bearer test-service-role-token');
      expect(call.headers['Content-Type']).toBe('application/json');
      // Body is a JSON string with {expiresIn: 900}.
      expect(typeof call.body).toBe('string');
      expect(JSON.parse(call.body as string)).toEqual({ expiresIn: 900 });
    });

    it('non-2xx throws SIGNED_URL_FAILED', async () => {
      fetchResponses.set(
        'POST https://lumen-prod-env.api.tcloudbasegateway.com/v1/storages/object/sign/lumen-private-bucket/key',
        makeResponse(401, {})
      );
      await expect(getSignedUrl(FIXED_OPTIONS, 'key', 900)).rejects.toThrowError(
        /SIGNED_URL_FAILED/
      );
    });
  });

  describe('ObjectStore surface (delegates to HTTP helpers)', () => {
    it('the adapter exposes put/get/getSignedUrl/delete/exists on the public surface', () => {
      // The HTTP call shape is verified by the per-method tests above.
      // Here we only verify the adapter exposes the methods on its public
      // ObjectStore surface — we don't invoke them, so ensureReady() is
      // not required.
      const deps = createCloudBasePersistence(FIXED_OPTIONS);
      expect(deps.objects.put).toBeDefined();
      expect(deps.objects.get).toBeDefined();
      expect(deps.objects.getSignedUrl).toBeDefined();
      expect(deps.objects.delete).toBeDefined();
      expect(deps.objects.exists).toBeDefined();
    });
  });
});
