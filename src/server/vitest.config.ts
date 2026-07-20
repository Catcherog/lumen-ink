import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the server package.
 *
 * HARDEN-001B (DEBT-HARDEN-001A-04 root-cause fix): exclude `dist/` so the
 * test runner does not pick up compiled `*.test.js` artifacts alongside the
 * source `*.test.ts` files. Without this exclusion, every test is collected
 * twice (once from source, once from dist), which inflates the reported test
 * count and can cause false failures when dist tests resolve paths relative
 * to `__dirname` inside `dist/`.
 */
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
    ],
  },
});
