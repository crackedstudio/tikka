---
'@tikka/sdk': patch
---

Publish a migration guide for consumers moving off direct `stellar-sdk` use.

Adds `docs/sdk/migration.md`, derived from the client's own migration in #1434
(which replaced a 708-line direct-`@stellar/stellar-sdk` `contractService.ts`
with an `@tikka/sdk`-backed `sdkClient.ts`). It covers:

- An operation-by-operation mapping from direct `Contract` / `rpc.Server` /
  `TransactionBuilder` / `nativeToScVal` / `rpc.assembleTransaction` usage onto
  the SDK's `RpcService`, `HorizonService`, `ContractService`,
  `FeeEstimatorService`, `TransactionLifecycle`, and the `RaffleService` /
  `TicketService` / `UserService` / `AdminService` domain services, with
  before/after code for reads, writes, fee estimation, error handling, and
  offline signing.
- The `@stellar/stellar-sdk@^16.1.0` dependency constraint, why the
  `pnpm.overrides` pin matters (Stellar SDK types cross the SDK boundary, so a
  mismatched major means two copies in the tree), and what actually breaks when
  coming from v14 — the Node 22 engine requirement, dual ESM/CJS layout, the
  ESM-only transitive deps that need a Jest `transformIgnorePatterns`
  allow-list, and `@stellar/stellar-base` being folded into the SDK.
- The wallet adapter story: when a built-in `WalletAdapter` is enough, when a
  wallet kit is warranted, and how to bridge a kit behind `WalletAdapter` so
  the wallet only ever signs XDR.
- Unit pitfalls (`RaffleParams.ticketPrice` in XLM, `endTime` in milliseconds,
  `maxPricePerTicket` in stroops), a testing section using `MockWalletAdapter`
  and `MockRpcService`, and a migration checklist.

Linked from the SDK README (which is the TypeDoc landing page) and the repo
docs index. Documentation-only — no public API surface change, so
`etc/*.api.md` is unchanged and the bump is a patch.
