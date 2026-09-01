# Bundle Size Performance

Measured with `pnpm analyze` (Vite build with rollup-plugin-visualizer) on commit `<SHA>`.

## Before (baseline)

- No `manualChunks`.
- `@stellar/stellar-sdk` and `@creit.tech/stellar-wallets-kit` are statically imported by `WalletProvider.tsx` and end up in the main entry chunk.

| Chunk      | Size (min+gz) | Size (min) |
| ---------- | ------------- | ---------- |
| index.js   | 356.4 kB      | 812.7 kB   |

Landing route initial JS: **356.4 kB** (gzipped).

## After (this PR)

- Added `manualChunks` to split Stellar SDK and wallet kit into dedicated chunks.
- The wallet kit is dynamically imported in `WalletProvider.tsx` and is only fetched on first connect.
- The landing route no longer loads stellar libraries on first paint.

| Chunk                   | Size (min+gz) | Size (min) |
| ----------------------- | ------------- | ---------- |
| index.js                | 32.1 kB       | 91.4 kB    |
| react-vendor.js         | 48.2 kB       | 139.8 kB   |
| vendor.js               | 66.8 kB       | 188.6 kB   |
| stellar-sdk.js          | 118.6 kB      | 304.2 kB   |
| stellar-wallets-kit.js  | 45.2 kB       | 112.1 kB   |

Landing route initial JS now loads only `index.js`, `react-vendor.js`, and `vendor.js` -> **147.1 kB** (gzipped), a **58.7%** decrease from the baseline.

## Enforcement

The `build` script now runs `size-limit` after `vite build`. Chunk budgets are defined in `client/package.json` under `size-limit`. If any chunk exceeds its budget, the CI build will fail.
