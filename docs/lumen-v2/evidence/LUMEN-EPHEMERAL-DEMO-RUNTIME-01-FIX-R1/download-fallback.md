# Provider URL Download Fallback Evidence

`src/client/src/utils/image.test.ts` verifies:

- successful Provider `fetch()` + `Blob` uses a browser-owned object URL and
  anchor download;
- a fetch rejection opens the original Provider URL with
  `noopener,noreferrer` in a new tab;
- an explicit upstream HTTP failure remains a download error and does not
  open an arbitrary URL;
- no server-side URL proxy exists in the implementation.
