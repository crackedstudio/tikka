# Multi-Oracle Quorum Policy

This document is the authoritative reference for how the `multi-oracle` package
decides **registry membership**, **quorum**, **conflict resolution**, and
**degraded operation**. It is written for operators who configure oracle
deployments and for engineers maintaining the coordinator.

Code lives in [`oracle/src/multi-oracle`](.):

| File | Responsibility |
|------|----------------|
| [`oracle-registry.service.ts`](./oracle-registry.service.ts) | Who the oracles/peers are, threshold, audit log |
| [`multi-oracle-coordinator.service.ts`](./multi-oracle-coordinator.service.ts) | Collecting peer responses and computing the aggregate |
| [`multi-oracle.types.ts`](./multi-oracle.types.ts) | Shared types |

> For the broader architecture and the on-chain (Soroban) side, see
> [`oracle/MULTI_ORACLE.md`](../../MULTI_ORACLE.md). This file focuses narrowly on
> the quorum rules the coordinator enforces.

---

## 1. Registry membership

The registry is built once at boot in `OracleRegistryService.onModuleInit()` from
environment variables. Two distinct collections are maintained:

- **Oracles** — every oracle that participates in quorum, including this node.
  Each has an `id`, `publicKey`, `weight`, and an `isActive` flag.
- **Peers** — the *remote* oracles' HTTP endpoints this node calls to collect
  responses. Peers are the oracles **other than** the local one.

### 1.1 Mode selection

```
ORACLE_MODE=single | multi          # preferred
MULTI_ORACLE_ENABLED=true | false   # legacy alias for ORACLE_MODE=multi
```

If neither selects multi-oracle, the node runs in **single-oracle mode**: one
oracle (`oracle-001`), threshold `1`, no peers.

If multi-oracle is selected but `ORACLE_REGISTRY` is empty, the node logs a
warning and **falls back to single-oracle mode** rather than crashing.

### 1.2 Configuring registry entries (operator guide)

Set these variables to stand up a multi-oracle node:

```bash
ORACLE_MODE=multi
LOCAL_ORACLE_ID=oracle-001

# Registry: comma-separated  id:publicKey:weight[:local]
ORACLE_REGISTRY=oracle-001:GAAA...:1:local,oracle-002:GBBB...:1,oracle-003:GCCC...:1

# Peer endpoints: comma-separated  id:url:publicKey
# (the local oracle is ignored if listed here)
ORACLE_PEERS=oracle-002:https://oracle2.example.com:4000:GBBB...,oracle-003:https://oracle3.example.com:4000:GCCC...

# Optional explicit threshold (see §2). Defaults to ceil(N/2)+1.
MULTI_ORACLE_THRESHOLD=2

# Local signing secret(s):  id:secret[:local]
ORACLE_SECRETS=oracle-001:SAAA...:local
```

**`ORACLE_REGISTRY` entry format** — `id:publicKey:weight[:local]`

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Unique oracle identifier, e.g. `oracle-001`. |
| `publicKey` | yes | Stellar `G...` public key. Validated with `Keypair.fromPublicKey`. |
| `weight` | yes | Integer voting weight; non-numeric falls back to `1`. |
| `local` | no | Marks this entry as the local oracle. Alternatively, the entry whose `id` equals `LOCAL_ORACLE_ID` is treated as local. |

Entries with fewer than three colon-separated fields are skipped with a warning.
If no entry is marked local (neither the `:local` flag nor a matching
`LOCAL_ORACLE_ID`), boot fails with
`LOCAL_ORACLE_ID must be set in multi-oracle mode`.

**`ORACLE_PEERS` entry format** — `id:url:publicKey`

The URL may itself contain colons (`https://host:port`); the parser treats the
**last** field as the public key and rejoins everything between the id and the
public key as the URL. The entry matching `LOCAL_ORACLE_ID` is skipped so a node
never calls itself.

### 1.3 Runtime mutations

The registry can be changed at runtime through audited methods. Every mutation
appends an immutable `OracleAuditEntry` (`getAuditLog()` returns it
most-recent-first):

| Method | Effect | Guards |
|--------|--------|--------|
| `addOracle(config, actor?)` | Add an oracle | Rejects invalid public key, duplicate id, duplicate public key |
| `removeOracle(id, actor?)` | Remove an oracle | Cannot remove the local oracle in multi mode |
| `setOracleActive(id, active, actor?)` | Enable/disable | Throws if id unknown; same-state is a no-op (no audit entry) |
| `addPeer(peer, actor?)` | Register a peer endpoint | Rejects malformed/invalid key, duplicate id/key, or the local id |
| `removePeer(id, actor?)` | Drop a peer endpoint | Returns `false` if absent |

Disabling an oracle (`setOracleActive(id, false)`) keeps it in the registry but
marks it `isActive: false`. See §4 for how disabled/unreachable peers affect
quorum.

---

## 2. Quorum policy

**Threshold (`T`)** is the minimum number of oracle responses — *including the
local oracle's own* — required to produce an aggregated result.

```
N = total registered oracles (local + peers)
T = MULTI_ORACLE_THRESHOLD            if set
  = ceil(N / 2) + 1                   otherwise   (strict majority)
```

The default is a **strict majority** so the system tolerates `f` faulty oracles
where `T > N/2`. Examples:

| N | Default T | Byzantine tolerance `f` |
|---|-----------|-------------------------|
| 3 | 2         | 1 |
| 5 | 3         | 2 |
| 7 | 4         | 3 |

Operators may override `T` with `MULTI_ORACLE_THRESHOLD`, but setting it at or
below `N/2` weakens the safety guarantee and is discouraged.

The coordinator counts quorum as:

```
responders = { local } ∪ { peers that returned a valid response }
quorumMet  = responders.size >= T
```

A peer response is **valid** only if the HTTP call returns `200` and the body
parses to an object with both `seed` and `proof` (see `fetchFromPeer`).

---

## 3. Conflict resolution

Oracles intentionally produce **different** seeds — that is the source of
unpredictability — so "conflict" here means *divergent responses*, not an error.
The coordinator resolves them **deterministically** so every honest node computes
the same aggregate:

1. Collect `responders` and sort them by oracle `id` (`localeCompare`).
2. Take the first `T` of the sorted list (`selected`). Selection is independent
   of arrival order, so it is stable across nodes and retries.
3. Aggregate:
   - `seed  = XOR(selected.seeds)` — commutative and order-independent.
   - `proof = SHA-512(concat(selected.proofs))`.

Because both the selection and the aggregation are order-independent over a
deterministic set, two runs over the same responses yield an identical seed and
proof. The aggregated seed is unpredictable as long as **at least one** selected
oracle is honest.

> Note: the coordinator does **not** try to detect a "correct" seed by majority
> vote — seeds are expected to differ. Integrity comes from each peer's verifiable
> VRF proof, checked on-chain, not from response equality.

---

## 4. Degraded operation

The coordinator never blocks raffle finalization on unreachable peers. It returns
`{ aggregated, usedOracles, fellBack }`; `fellBack === true` means it produced a
**local-only** result instead of an aggregated quorum result.

Fallback to local-only happens when:

| Situation | Behaviour |
|-----------|-----------|
| No peers configured (`getPeerEndpoints()` empty) | Use local result, `fellBack: true`, `usedOracles: [local]` |
| Peers fail/time out / are disabled, dropping responders below `T` | Use local result, `fellBack: true`, `usedOracles: [local]` |
| Responders ≥ `T` | Aggregate the selected set, `fellBack: false` |

A **disabled or unreachable peer** is simply excluded from `responders`: its
fetch rejects (timeout, connection error, non-200, or malformed body) and is
filtered out in `fetchFromPeers`. If enough peers remain to reach `T`, quorum
still succeeds; otherwise the node degrades to local-only.

Per-peer call timeout is `ORACLE_MULTI_TIMEOUT_MS` (default `10000` ms).

---

## 5. Health & monitoring

`getPendingTrackers()` exposes in-flight submission trackers (raffleId,
requestId, submissions collected, threshold) for the health endpoint. Alert when
a tracker stays below its threshold for longer than the submission timeout
(`SUBMISSION_TIMEOUT_MS`, 5 minutes), which indicates peers are persistently
missing or disabled.

---

## 6. Tested scenarios

The acceptance scenarios are covered in
[`multi-oracle-coordinator.service.spec.ts`](./multi-oracle-coordinator.service.spec.ts)
and [`oracle-registry.service.spec.ts`](./oracle-registry.service.spec.ts):

- **Quorum success** — responders ≥ `T`, deterministic XOR aggregate, `fellBack: false`.
- **Insufficient quorum** — responders < `T`, local-only fallback, `fellBack: true`.
- **Conflicting results** — divergent seeds aggregate deterministically across runs.
- **Disabled / missing peer** — failed peer excluded; quorum still met when others
  suffice, otherwise fallback. Registry-level disable is audited.
