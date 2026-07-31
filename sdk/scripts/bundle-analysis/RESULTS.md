# Light entry tree-shaking analysis (issue #1108)

## What was checked

1. `package.json` had no `sideEffects` field, so bundlers default to assuming
   every module may have side effects and are conservative about dropping
   unused code. All modules reachable from `src/index.light.ts` are plain
   declarations (types, classes, pure functions) with no top-level side
   effects, so `"sideEffects": false` was added.
2. The `exports` map had no `"./light"` entry, so `import ... from
   '@tikka/sdk/light'` could not resolve at all under Node's ESM resolution
   or bundler `exports`-aware resolution. Added it alongside the existing
   `.`, `./read`, and `./write` entries.
3. A fixture (`fixture.light.ts`) imports a single helper,
   `resolveNetworkConfig`, from the light entry and is bundled with esbuild
   (`analyze.mjs`) to measure what actually lands in the output.

## Fixture

```ts
import { resolveNetworkConfig } from '../../dist/light/index.light.js';

const config = resolveNetworkConfig('testnet');
console.log(config.rpcUrl);
```

Run with `npm run build:light && npm run analyze:light`.

## Result

| Metric | Value |
|---|---|
| Raw bundle size | 168,163 bytes (164.2 kB) |
| Gzipped size | 37,909 bytes |

Module breakdown (esbuild `--metafile` analysis) confirms **only the code
`resolveNetworkConfig` actually depends on is included** from `@tikka/sdk`
itself:

- `dist/light/network/network.config.js` (1.7 kB)
- `dist/light/network/network-config.error.js` (360 B)

`dist/light/light/rpc.service.js` (the `RpcService` class, unused by the
fixture) is **not** present in the bundle — the light entry is
tree-shakeable at the `@tikka/sdk` level, and the `"./light"` export/`
sideEffects` fix does not regress that.

## Where the size actually comes from

The bundle is dominated by `@stellar/stellar-sdk` (~111 kB of the 164 kB),
because `resolveNetworkConfig` needs the `Networks` passphrase constants,
which are exported from the same module graph as `@stellar/stellar-sdk`'s
generated XDR codec (`curr_generated.js`, 98.5 kB) and its `buffer` polyfill
(24.6 kB). This is the fixture's real dependency graph, not dead code from
`@tikka/sdk` — but it means any consumer of the light entry pays this cost
even for a single passphrase constant, since it is inherited from how
`@stellar/stellar-sdk` itself is packaged, not from anything in this repo.

## Measured effect of `sideEffects: false`

Re-running the same fixture with the field temporarily removed from
`package.json`:

| | Raw | Gzipped |
|---|---|---|
| Without `sideEffects: false` | 169,107 bytes | 38,353 bytes |
| With `sideEffects: false` | 168,163 bytes | 37,909 bytes |

The difference (944 bytes raw / 444 bytes gzipped) is `dist/light/utils/errors.js`,
which esbuild could only drop once it was told the module graph has no
side effects — without the flag it stayed in the bundle as a transitive,
unused dependency of the (already-excluded) `RpcService` export.

## Conclusion

- Acceptance criterion met: importing a single helper from the light entry
  pulls in only its own dependency graph — verified by absence of
  `rpc.service.js` and other unused light-entry code in the bundle.
- The dominant cost for any light-entry consumer is `@stellar/stellar-sdk`
  itself, not `@tikka/sdk` — worth tracking separately if the <50 kB target
  in `LIGHT_VERSION.md` needs to hold for real-world imports rather than
  just the light entry's own code.
