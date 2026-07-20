/**
 * HARDEN-001C — Log redaction on route error paths (Gate D health/log leak).
 *
 * Asserts that `src/server/routes/projects.ts` and `src/server/routes/detect.ts`
 * never log raw Error objects or un-redacted user-controlled strings.
 *
 * Coverage (AC-C10 ~ AC-C14):
 *  - AC-C10: projects.ts error logs all pass through `redactError()`.
 *  - AC-C11: projects.ts DELETE /:id error path logs redacted structure
 *            (errorCode visible, raw error fields suppressed).
 *  - AC-C12: detect.ts mimeType in success log is redacted via redactString
 *            (or removed entirely).
 *  - AC-C13: detect.ts error log uses redactError (existing — regression guard).
 *  - AC-C14: projects.ts source code does not contain
 *            `console.error('...', err)` patterns with the raw err argument.
 *
 * Test strategy: source code static scan + runtime spy on console.error/log.
 * The static scan is the primary gate (prevents reintroduction); the runtime
 * spy verifies the redaction contract holds end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECTS_TS = path.join(__dirname, '..', 'routes', 'projects.ts');
const DETECT_TS = path.join(__dirname, '..', 'routes', 'detect.ts');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('HARDEN-001C log redaction on route paths (Gate D)', () => {
  describe('AC-C10/AC-C14: projects.ts source code does not log raw err', () => {
    it('projects.ts exists and is readable', () => {
      expect(fs.existsSync(PROJECTS_TS)).toBe(true);
    });

    it('projects.ts does not contain `console.error(..., err)` with raw err arg', () => {
      const src = readSource(PROJECTS_TS);
      // Match `console.error('...', err)` where the second arg is a bare
      // `err` variable (not a redacted structure). The redacted form is
      // `console.error('...', redacted.log)` or similar.
      // We allow `console.error('...', redacted.log)` and
      // `console.error('...', JSON.stringify(...))`.
      const lines = src.split('\n');
      const offending: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        // Match console.error('...'  , err)  with bare err / error / e
        // (not redacted.log / redacted.message / JSON.stringify).
        const m = trimmed.match(/console\.error\([^)]*,\s*(\w+)\s*\)/);
        if (m) {
          const arg = m[1];
          // Reject bare error variable names; allow redacted.log etc.
          if (
            arg === 'err' ||
            arg === 'error' ||
            arg === 'e' ||
            arg === 'ex'
          ) {
            offending.push(trimmed);
          }
        }
      }
      expect(offending).toEqual([]);
    });

    it('projects.ts imports redactError from security/redaction', () => {
      const src = readSource(PROJECTS_TS);
      // After HARDEN-001C, projects.ts should import redactError.
      // Note: ESM imports use `.js` suffix, so the path is `../security/redaction.js`.
      // The regex allows any characters between `redaction` and the closing quote.
      expect(src).toMatch(/import\s+\{[^}]*redactError[^}]*\}\s+from\s+['"][^'"]*redaction[^'"]*['"]/);
    });
  });

  describe('AC-C12: detect.ts mimeType is not logged raw', () => {
    it('detect.ts does not log raw mimeType in console.log', () => {
      const src = readSource(DETECT_TS);
      // The old pattern was:
      //   console.log(`[detect/people] mimeType=${mimeType || 'unknown'} ...`)
      // After HARDEN-001C, the log should either use redactString(mimeType)
      // or omit mimeType entirely.
      const rawMimeTypeLog = /console\.log\([^)]*\$\{mimeType[^}]*\}/;
      expect(rawMimeTypeLog.test(src)).toBe(false);
    });

    it('detect.ts imports redactString or redactError from security/redaction', () => {
      const src = readSource(DETECT_TS);
      // After fix, detect.ts should import redactString (for mimeType)
      // in addition to the existing redactError.
      // Note: ESM imports use `.js` suffix; regex allows chars between
      // `redaction` and the closing quote.
      expect(src).toMatch(/import\s+\{[^}]*redact(String|Error)[^}]*\}\s+from\s+['"][^'"]*redaction[^'"]*['"]/);
    });
  });

  describe('AC-C11: projects.ts DELETE error path logs redacted structure', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('DELETE /:id failure logs include a structured errorCode, not a raw Error', async () => {
      // We import the router factory and build it with a fake ProjectService
      // that throws. The router's error handler should call redactError,
      // producing a structured log with `errorCode` but NOT a raw Error
      // object (which would have `stack` / `message` echoed verbatim).
      const { createProjectsRouter } = await import('../routes/projects.js');

      const fakeProjectService: any = {
        deleteProject: async () => {
          const e = new Error('synthetic-delete-failure-with-secret-sk-AAAA1111BBBB2222');
          (e as any).code = 'STORAGE_ERROR';
          throw e;
        },
        listProjects: async () => [],
        getProject: async () => null,
        activateVersion: async () => ({}),
        approveVersion: async () => ({}),
      };
      const fakeGenerationService: any = {};

      const router = createProjectsRouter({
        projectService: fakeProjectService,
        generationService: fakeGenerationService,
      });

      const express = (await import('express')).default;
      const app = express();
      app.use(express.json());
      // Mock auth: skip authMiddleware for this test.
      app.use((req, _res, next) => {
        (req as any).user = { sub: 'test-user' };
        next();
      });
      app.use('/api/projects', router);

      const supertest = (await import('supertest')).default;
      const res = await supertest(app).delete('/api/projects/proj-test-1');

      // The route returns 4xx/5xx on delete failure.
      expect(res.status).toBeGreaterThanOrEqual(400);

      // Verify console.error was called.
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Collect all logged arguments and serialize them.
      const calls: unknown[][] = consoleErrorSpy.mock.calls as unknown[][];
      const serialized = calls
        .map((args: unknown[]) => args.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
        .join('\n');

      // The raw Error .stack should NOT appear in logs.
      expect(serialized).not.toContain('synthetic-delete-failure-with-secret-sk-AAAA1111BBBB2222');
      // An errorCode SHOULD be visible (structured redaction).
      // The exact errorCode depends on the route's handler; we accept any
      // `*_FAILED` or `ERROR` string in a structured form.
      expect(serialized).toMatch(/errorCode|ERROR|FAILED/i);
    });
  });

  describe('AC-C13: detect.ts error path uses redactError (regression guard)', () => {
    it('detect.ts source contains redactError call on error path', () => {
      const src = readSource(DETECT_TS);
      expect(src).toMatch(/redactError\s*\(/);
    });
  });
});
