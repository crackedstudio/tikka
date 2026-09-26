---
'@tikka/sdk': minor
---

Cap `any` usage with a ratcheting CI budget and clear `sdk/src/contract/`.

`@typescript-eslint/no-explicit-any` is now reported as a warning instead of
being disabled outright, and a new `any` budget gate fails the SDK CI job when
the count rises. The committed cap lives in `sdk/any-budget.json` and is split
per `src/` area so each directory owns its debt:

- `pnpm lint:any-budget` — fails if the total or any area exceeds its cap
- `pnpm lint:any-budget:update` — ratchets the caps down to the current count
  and refuses to raise one, so the total can only ever fall

`sdk/src/contract/` is cleared to zero, taking the total from 354 to 245.
`ContractService`, `TransactionLifecycle`, and the response wrappers now take
`unknown` parameters and narrow at the boundary instead of `any`:

- contract parameters are `unknown[]` and are narrowed inside `toScVal`
- Soroban RPC failures use the SDK's own response types
  (`SimulateTransactionErrorResponse`, `GetFailedTransactionResponse`,
  `RawSendTransactionResponse`) instead of `as any` casts
- account fallbacks implement `TransactionSource`
- `ContractResponse<T>` and friends default to `unknown` rather than `any`

Poll failures are also reported with the failed transaction's XDR stringified
before parsing, so a real `xdr.TransactionResult` no longer trips the error
parser.
