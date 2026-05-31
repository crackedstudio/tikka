# External Contracts — Integration Boundary

Status: Draft

Purpose
-------
This document defines the precise integration boundary with external smart contracts used by this repository. It lists required contract IDs (addresses), the methods and events the code depends on, required schema / ABI versions, network configuration expectations, and the verification checklist for contract upgrades.

Scope
-----
- Packages affected: `sdk`, `indexer`, `oracle`, `backend`, `client`.
- Location: docs/contracts — keep related tests and examples beside this package.

What belongs in the boundary
---------------------------
- Contract IDs / addresses: the canonical identifier used by runtime configuration. Use a stable name (e.g. `TokenBridgeV1`) and provide per-network addresses.
- Public methods: list of contract function signatures that are called by the SDK, backend, or oracle.
- Events: event names and the exact indexed/non-indexed argument types that the indexer/parser subscribes to.
- Schema / ABI version: the ABI or JSON schema version expected. Any ABI changes must be recorded here.
- Network config: expected chain IDs, RPC endpoints (read-only), confirmation requirements for finality, and any gas- or block-time assumptions.

Template: Contract entry
------------------------
For each external contract include a section like:

- Name: TokenBridgeV1
- Logical ID: `token_bridge_v1`
- Networks / addresses:
  - mainnet: 0x...
  - testnet: 0x...
- Required ABI/schema version: v1 (sha256:... or tag)
- Methods used (signature + short purpose):
  - `transfer(address,uint256)` — used by `sdk.transfer()` for outgoing transfers
  - `getBalance(address) view returns (uint256)` — used by backend reconciliation
- Events parsed (name + parameter types + indexed flags):
  - `Transfer(address indexed from, address indexed to, uint256 value)` — indexer relies on `from` and `to` as indexed
  - `BridgeDeposit(address indexed user, uint256 amount, bytes meta)` — oracle listens for `BridgeDeposit`
- Compatibility notes (breaking vs non-breaking changes):
  - Adding new optional fields to events is non-breaking only if parser code tolerates extra fields.
  - Renaming events or changing indexed flags is breaking.

Linking expectations
--------------------
- SDK bindings: the SDK should export typed bindings for all contract methods used by the client/backend. Ensure the generated SDK binding version matches the ABI version above.
- Indexer parser: the indexer expects event names, indexed positions, and types to match exactly. Any change to event parameter order, type, or indexed status must be treated as a breaking change and listed here.
- Oracle listener: the oracle expects method outputs and event payload formats used for triggering off-chain actions (e.g., `BridgeDeposit`) to remain stable. The oracle will use the ABI described here to decode events.

Contract upgrade checklist
--------------------------
Before performing any contract upgrade (new deployment, ABI change, or migration), complete this checklist. Each item must be verified and signed off.

1. SDK
   - Update generated bindings to new ABI.
   - Run `cd sdk && pnpm test` (or package's test script). Confirm no regressions.
   - Update SDK version in release notes.

2. Indexer
   - Update parser definitions for events (names, types, indexed flags).
   - Run indexer parser unit tests: `cd indexer && pnpm test`.
   - Run a local reindex (or replay) in a staging environment to confirm events decode as expected.

3. Oracle
   - Update any event decoding and handler logic in `oracle` package.
   - Run oracle integration tests: `cd oracle && pnpm test`.
   - Verify off-chain side-effects in staging (mock or staging RPC) before mainnet deploy.

4. Backend
   - Update any contract-derived business logic (e.g., reconciliation, balance checks).
   - Run backend tests: `cd backend && pnpm test`.
   - Confirm migrations (if any) and DB schema changes are backward compatible or guarded.

5. Client
   - Update UI and client SDK usage for any behavioral changes.
   - Run client tests: `cd client && pnpm test` and smoke the main flows in a staging environment.

6. Cross-package verification
   - Run package-specific checks listed above for all affected packages.
   - Run the root build: `pnpm -w build` (or `pnpm -w -s build`) and any CI scripts used by the repo.

Compatibility assumptions — quick verification
-------------------------------------------
- ABI backward-compatibility: we assume functions keep the same names, parameter types, and order. Quick check: compare old vs new ABI JSON; ensure all required function/event signatures still exist.
- Event schema stability: we assume indexed fields and parameter order do not change. Quick check: run the indexer parser in dry-run against a block range containing the events and ensure no decode errors.
- Network config: we assume the same chain ID and RPC semantics. Quick check: validate `chainId` and confirm RPC responds with expected block finality characteristics.

How to record an upgrade
-------------------------
- Add an entry to this document with the new contract address and ABI SHA or tag.
- Create a PR that includes:
  - Updated SDK bindings (or a link to the generated binding commit)
  - Indexer parser changes and a small reindex report (staging results)
  - Oracle handler changes and test outputs
  - Backend & client test runs
  - Checklist sign-offs from owners of `sdk`, `indexer`, `oracle`, `backend`, and `client`

Appendix: verification commands (examples)
-----------------------------------------
- SDK tests: `cd sdk && pnpm test`
- Indexer tests: `cd indexer && pnpm test`
- Oracle tests: `cd oracle && pnpm test`
- Backend tests: `cd backend && pnpm test`
- Client tests: `cd client && pnpm test`
- Root build: `pnpm -w build`

Notes and conventions
---------------------
- Use semantic ABI tags (e.g., `v1`, `v2`) and include a checksum of the ABI JSON in this doc.
- When in doubt about a change's compatibility, treat it as breaking and follow the full checklist.

Contact / Owners
----------------
- SDK owner: @team-sdk
- Indexer owner: @team-indexer
- Oracle owner: @team-oracle
- Backend owner: @team-backend
- Client owner: @team-client
