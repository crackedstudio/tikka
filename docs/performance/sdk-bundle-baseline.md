# SDK Bundle Size Baseline

Baseline recorded on 2026-09-29 with the SDK's `size-limit` checks. Values are
minified, bundled, and gzipped bytes; Node built-ins are external to the
measurement. The entries map to `@tikka/sdk`, `@tikka/sdk/light`, and
`@tikka/sdk/network`.

| Entry       |  Baseline |    Budget | Remaining |
| ----------- | --------: | --------: | --------: |
| `.`         | 395,610 B | 420,000 B |  24,390 B |
| `./light`   | 104,903 B | 115,000 B |  10,097 B |
| `./network` |     581 B |     750 B |     169 B |

The light entry is 26.5% of the main entry's gzipped size. CI enforces all three
budgets and fails if the light entry is no longer smaller than the main entry.
It also bundles the complete light source entry and fails if any `@nestjs/*`
package appears in its dependency graph.

Reproduce with `pnpm exec size-limit` from `sdk/` and
`pnpm run analyze:light` from `sdk/`.
