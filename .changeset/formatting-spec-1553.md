---
'@tikka/sdk': patch
---

Add `formatting.spec.ts`: precision tests for stroop/XLM conversion (#1553).

`sdk/src/utils/formatting.ts` — the SDK's stroop↔XLM conversion layer, consumed
by both transaction building and the client display layer — was the largest
untested file in the package. The new spec locks down its precision contract:

- Table-driven boundaries for `xlmToStroops` / `stroopsToXlm`: zero, one stroop,
  one XLM, trailing zeros, values far above `Number.MAX_SAFE_INTEGER`, and
  malformed inputs.
- Exact round-trips: `toStroops(toXlm(x)) === x` via a BigInt reference
  implementation (exhaustive below 0.01 XLM, ±1 stroop around every power of
  ten up to 10^18 stroops, plus 5,000-run fast-check properties in both
  directions).
- Static source assertions that no conversion path routes a stroop string
  through `Number()`, `parseFloat`, or unary `+`.
- Cross-checks against the tested client formatter
  (`client/src/utils/formatters.ts`): both agree on every shared value.
- Coverage of `formatting.ts` rises to ~98% lines / ~98% branches / 100%
  functions.

Also fixes a latent error-contract bug the new tests caught:
`formatContractResponse` now maps bignumber.js v11's thrown `BigNumber Error`
into the documented `TikkaSdkError` (`ValidationError`) instead of leaking the
raw library error to callers.

Finally, repairs `sdk/jest.config.cjs`, which was committed with corrupted
string literals and could not be parsed by Node at all — restoring a runnable
SDK test suite.
