# Tikka Threat Model — Raffle Lifecycle

> Version: 1.0 · Date: 2026-05-28 · Issue: #621

This document covers assets, actors, trust boundaries, and attack scenarios for the Tikka raffle platform. Each threat maps to a mitigation and a source directory so security issues can reference specific threats by ID.

---

## 1. Assets

| ID | Asset | Value | Location |
|----|-------|-------|----------|
| A1 | Prize funds (XLM / tokens) | High — direct financial loss | Soroban contract |
| A2 | Oracle Ed25519 private key | Critical — controls winner selection | `oracle/src/keys/` |
| A3 | Admin bearer token | High — controls protocol parameters | `backend/.env` / K8s secret |
| A4 | JWT secret | High — forged tokens bypass auth | `backend/.env` / K8s secret |
| A5 | Supabase service role key | High — full DB read/write | `backend/.env` / K8s secret |
| A6 | Raffle metadata (title, image, description) | Medium — reputational / UX | Supabase Storage + IPFS |
| A7 | User wallet addresses | Low-Medium — privacy, targeted phishing | Supabase `siws_nonces`, `refresh_tokens` |
| A8 | Webhook target URLs | Low — SSRF pivot, data exfiltration | Supabase (backend webhook table) |
| A9 | Indexed raffle/ticket state | Medium — incorrect state misleads users | PostgreSQL (indexer) |
| A10 | Stellar secret key (oracle submitter) | High — unauthorized contract calls | `oracle/src/keys/` |

---

## 2. Actors

| Actor | Trust Level | Description |
|-------|-------------|-------------|
| Raffle participant | Untrusted | Any wallet holder; buys tickets, claims prizes |
| Raffle creator | Low trust | Authenticated user; creates raffles, uploads metadata |
| Oracle service | High trust | Computes and submits VRF randomness to contract |
| Admin | Highest trust | Controls protocol fee, oracle address, pause state |
| Indexer | Internal | Reads Horizon, writes PostgreSQL; no external auth |
| Webhook consumer | Untrusted | Third-party HTTP endpoint registered by a user |
| Stellar network / Horizon | External | Source of truth for ledger state |
| Attacker (external) | Hostile | No credentials; network access only |
| Attacker (insider) | Hostile | Compromised service account or admin token |

---

## 3. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  PUBLIC INTERNET                                                    │
│                                                                     │
│  Browser / Wallet ──HTTPS──▶ backend (port 3001)                   │
│                              │  JWT auth (SIWS)                    │
│                              │  Helmet + CORS (single origin)      │
│                              │  Rate limiting per IP / address     │
│                              ▼                                      │
│                         Supabase (Postgres + Storage)              │
│                                                                     │
│  Webhook consumer ◀──HTTP POST── indexer (BullMQ worker)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                              │
         │ Internal cluster             │ Internal cluster
         ▼                              ▼
┌─────────────────────┐    ┌────────────────────────────┐
│  indexer (port 3002) │    │  oracle (port 3003)        │
│  Horizon polling     │    │  Horizon SSE listener      │
│  PostgreSQL writes   │    │  VRF compute               │
│  Webhook dispatch    │    │  Soroban tx submit         │
└─────────────────────┘    └────────────────────────────┘
         │                              │
         └──────────┬───────────────────┘
                    ▼
         Stellar Ledger / Soroban Contract
         (set_oracle_address = admin-only trust anchor)
```

Key boundaries:
- **Internet → backend**: HTTPS, JWT, rate limits, CORS
- **backend → Supabase**: service role key (never exposed to clients)
- **indexer → Horizon**: unauthenticated read; Horizon is trusted as source of truth
- **oracle → contract**: oracle Stellar keypair; contract verifies VRF proof
- **indexer → webhook consumers**: outbound HTTP; consumers are untrusted

---

## 4. Raffle Lifecycle & Data Flows

```
1. Creator authenticates  →  POST /auth/nonce  →  POST /auth/verify  →  JWT
2. Creator uploads image  →  POST /raffles/upload-image  →  Supabase Storage
3. Creator sets metadata  →  POST /raffles/:id/metadata  →  Supabase + IPFS pin
4. Participant buys ticket →  SDK builds Soroban tx  →  Stellar ledger
5. Indexer ingests event  →  Horizon poll  →  PostgreSQL  →  webhook dispatch
6. Draw triggered         →  contract emits RandomnessRequested
7. Oracle computes VRF    →  proof = ed25519.sign(requestId, privKey)
                             seed  = SHA-256(proof)
8. Oracle submits         →  receive_randomness(seed, proof)  →  contract verifies
9. Contract finalizes     →  winner selected  →  RaffleFinalized event
10. Indexer dispatches    →  webhook to registered consumers
```

---

## 5. Threats

### T1 — Wallet Auth: Nonce Replay

**Category:** Spoofing  
**Target:** A7 (wallet address), A4 (JWT secret)  
**Description:** An attacker intercepts a valid SIWS signature and replays it to obtain a JWT for the victim's address.

**Mitigation:**
- Nonces are single-use: `consumed = true` is set on first use (`backend/src/auth/auth.service.ts`)
- Nonces expire after `NONCE_TTL_SECONDS` (stored in `siws_nonces.expires_at`)
- `issuedAt` clock-skew check rejects messages signed more than `nonceTtlSeconds` ago or more than 60 s in the future

**Residual risk:** Race condition between nonce lookup and `consumed` update (non-atomic read-then-write). A concurrent replay within the same millisecond could succeed.

**Follow-up:** `#TM-F1` — Make nonce consumption atomic with a `UPDATE … WHERE consumed = false RETURNING *` pattern.

---

### T2 — Wallet Auth: Signature Forgery

**Category:** Spoofing  
**Target:** A7, A4  
**Description:** Attacker crafts a valid Ed25519 signature for an arbitrary address without the private key.

**Mitigation:**
- `SiwsService.verify()` uses `Keypair.fromPublicKey(address).verify(message, signature)` — standard Stellar Ed25519 verification (`backend/src/auth/siws.service.ts`)
- Message includes domain, address, nonce, and issuedAt — prevents cross-domain reuse

**Residual risk:** None beyond breaking Ed25519.

---

### T3 — Wallet Auth: JWT Theft / Refresh Token Abuse

**Category:** Elevation of privilege  
**Target:** A4  
**Description:** Attacker steals a JWT or refresh token and impersonates the victim.

**Mitigation:**
- Access tokens are short-lived (`JWT_EXPIRES_IN`, default 7d — **see follow-up**)
- Refresh tokens are stored as HMAC-SHA256 hashes; raw token never persisted (`backend/src/auth/auth.service.ts`)
- Refresh rotation: each use issues a new token and replaces the stored hash
- `revoked` flag allows server-side invalidation

**Residual risk:** 7-day access token lifetime is long for a financial platform. No token binding to IP or device.

**Follow-up:** `#TM-F2` — Reduce `JWT_EXPIRES_IN` to 15–30 minutes; rely on refresh rotation for session continuity.

---

### T4 — Metadata Injection

**Category:** Tampering  
**Target:** A6  
**Description:** Authenticated user submits malicious content in raffle title, description, or image to perform XSS, phishing, or content spoofing against other users.

**Mitigation:**
- Metadata fields validated with Zod schemas (`backend/src/api/rest/raffles/metadata.schema.ts`)
- Image upload: MIME type allowlist (JPEG, PNG, WebP), 5 MB limit, stored in Supabase Storage with a generated path (`backend/src/config/upload.config.ts`)
- IPFS CID stored for immutability; metadata cannot be silently changed after pinning

**Residual risk:** Zod validates structure but does not sanitize HTML/script content in text fields. A downstream renderer that trusts raw metadata could be vulnerable to stored XSS.

**Follow-up:** `#TM-F3` — Strip or escape HTML in title/description fields server-side before storage. Validate that uploaded images are valid image files (magic bytes), not just MIME type from the Content-Type header.

---

### T5 — Oracle Manipulation: VRF Key Compromise

**Category:** Tampering  
**Target:** A2, A1 (prize funds)  
**Description:** Attacker obtains the oracle's Ed25519 private key and pre-computes winning seeds for any raffle, then submits a crafted `receive_randomness` call.

**Mitigation:**
- HSM providers (AWS KMS, GCP KMS) keep the private key inside hardware; `getSecretBuffer()` throws for HSM providers (`oracle/src/keys/key.service.ts`)
- `SOPS_AGE_KEY_FILE` mounts the age key read-only at `/run/secrets/age.key` in K8s (`oracle/k8s/deployment.yaml`)
- Contract verifies the VRF proof against the registered oracle public key before accepting the seed
- `set_oracle_address` is admin-only — rotating the oracle key requires admin action

**Residual risk:** `EnvKeyProvider` stores the key in an environment variable, which is readable by any process in the pod. Production deployments must use KMS.

**Follow-up:** `#TM-F4` — Enforce KMS provider in production via startup check; log a `CRITICAL` warning if `EnvKeyProvider` is active and `NODE_ENV=production`.

---

### T6 — Oracle Manipulation: Unauthorized `receive_randomness` Call

**Category:** Tampering  
**Target:** A1  
**Description:** Attacker calls `receive_randomness` on the contract directly with a crafted seed, bypassing the oracle.

**Mitigation:**
- Contract checks that the caller is the registered oracle address (`set_oracle_address`)
- Contract verifies the Ed25519 proof against the oracle's public key before accepting the seed
- Only the oracle's Stellar keypair can produce a valid proof

**Residual risk:** If the oracle address is changed by a compromised admin, an attacker-controlled oracle could submit valid proofs.

**Follow-up:** `#TM-F5` — Add a timelock or multi-sig requirement to `set_oracle_address` changes.

---

### T7 — Oracle Manipulation: PRNG Predictability (Low-Stakes)

**Category:** Tampering  
**Target:** A1  
**Description:** For raffles below 500 XLM, the contract uses a ledger-seeded PRNG. A validator or miner with ledger-close influence could bias the seed.

**Mitigation:**
- PRNG is only used for low-stakes raffles (< 500 XLM prize)
- Soroban ledger randomness is derived from the network's consensus process

**Residual risk:** Ledger-seeded PRNG is not cryptographically unpredictable. A sophisticated validator could attempt grinding attacks on low-value raffles.

**Follow-up:** `#TM-F6` — Document the 500 XLM threshold prominently in user-facing docs. Consider lowering the VRF threshold or making it configurable per raffle.

---

### T8 — Indexer Reorg Exploitation

**Category:** Tampering  
**Target:** A9  
**Description:** An attacker triggers or exploits a Stellar ledger reorg to cause the indexer to roll back legitimate ticket purchases or raffle finalizations, then re-purchase tickets at a lower price or claim a prize that was already paid out.

**Mitigation:**
- Reorg detection compares stored ledger hashes against Horizon; on divergence, `ReorgRollbackService` deletes events/tickets/raffles from the fork point in a single transaction (`indexer/src/ingestor/reorg-rollback.service.ts`)
- Prize payouts are enforced by the Soroban contract, not the indexer — the indexer is a read model only
- Ticket purchases are Soroban transactions; the contract is the authoritative state

**Residual risk:** The indexer's read model can temporarily show stale state during a reorg. Webhook consumers may receive `RaffleFinalized` events that are later rolled back.

**Follow-up:** `#TM-F7` — Add a `finality_depth` confirmation window before dispatching `RaffleFinalized` webhooks. Document that webhook consumers must treat events as provisional until confirmed.

---

### T9 — Webhook Abuse: SSRF

**Category:** Information disclosure / lateral movement  
**Target:** A8, internal services  
**Description:** A user registers a webhook URL pointing to an internal service (e.g., `http://169.254.169.254/` for cloud metadata, or `http://tikka-indexer.tikka.svc.cluster.local/`). The indexer's BullMQ worker fetches the URL, leaking internal data or triggering internal actions.

**Mitigation:**
- Webhook URLs are owner-scoped (only the registering user's events are dispatched)
- BullMQ worker retries up to 5 times with exponential backoff

**Residual risk:** No URL allowlist or SSRF protection is implemented in `indexer/src/webhooks/webhook.service.ts`. Any URL is accepted and fetched.

**Follow-up:** `#TM-F8` — Validate webhook URLs against a blocklist of private IP ranges (RFC 1918, link-local, loopback) and internal cluster DNS patterns before enqueuing. Use a dedicated egress proxy with network policy restrictions for webhook dispatch.

---

### T10 — Webhook Abuse: No Payload Signing

**Category:** Repudiation  
**Target:** A8  
**Description:** Webhook consumers cannot verify that a received payload originated from Tikka. An attacker who knows a consumer's endpoint URL can send forged `RaffleFinalized` events to trigger automated actions (e.g., releasing prizes in an external system).

**Mitigation:**
- None currently implemented in `indexer/src/webhooks/webhook.service.ts`

**Follow-up:** `#TM-F9` — Add HMAC-SHA256 signing of webhook payloads using a per-webhook secret. Include the signature in an `X-Tikka-Signature` header. Document the verification procedure for consumers.

---

### T11 — Admin Token Compromise

**Category:** Elevation of privilege  
**Target:** A3, A1, A2  
**Description:** Attacker obtains the `ADMIN_TOKEN` and calls admin endpoints to: change the oracle address (redirect randomness), set protocol fee to 100%, withdraw accumulated fees, or pause all raffles.

**Mitigation:**
- Admin endpoints require both bearer token and IP allowlist (`ADMIN_IP_ALLOWLIST`) (`backend/.env.example`)
- K8s secret stores the token; container runs as non-root with `readOnlyRootFilesystem`

**Residual risk:** `ADMIN_IP_ALLOWLIST` is empty by default, meaning IP restriction is opt-in. A single static bearer token has no rotation mechanism.

**Follow-up:** `#TM-F10` — Require `ADMIN_IP_ALLOWLIST` to be non-empty in production. Implement admin token rotation and consider short-lived tokens via a secrets manager.

---

### T12 — Metadata / Image Storage Abuse

**Category:** Denial of service / content abuse  
**Target:** A6  
**Description:** Authenticated user uploads malicious files (polyglot images, oversized files, or files with misleading MIME types) to Supabase Storage, or floods the metadata endpoint to exhaust storage quota.

**Mitigation:**
- 5 MB file size limit enforced before upload (`backend/src/config/upload.config.ts`)
- MIME type allowlist: JPEG, PNG, WebP
- Per-address rate limit on raffle creation (`RAFFLE_CREATE_RATE_LIMIT`, default 5 per 10 min)
- Multipart file count limited to 1

**Residual risk:** MIME type is checked from the `Content-Type` header, which is attacker-controlled. Magic byte validation is not performed.

**Follow-up:** See `#TM-F3`.

---

### T13 — Horizon Dependency / Eclipse Attack

**Category:** Denial of service / tampering  
**Target:** A9  
**Description:** The indexer and oracle both depend on Horizon as their view of the ledger. If the Horizon node is compromised, slow, or serves a forked view, the indexer ingests false events and the oracle responds to phantom draw requests.

**Mitigation:**
- Oracle has a circuit breaker (`ORACLE_CB_FAILURE_THRESHOLD`, `ORACLE_CB_RESET_TIMEOUT_MS`) that opens on consecutive SSE failures (`oracle/.env.example`)
- Indexer reorg detection catches divergence from the canonical chain

**Residual risk:** Both services use a single Horizon endpoint. A compromised or eclipsed Horizon node could feed consistent but false data that passes reorg checks.

**Follow-up:** `#TM-F11` — Configure a secondary Horizon endpoint for cross-validation. Alert on ledger hash mismatches between endpoints.

---

### T14 — Nonce Exhaustion (DoS)

**Category:** Denial of service  
**Target:** A7  
**Description:** Attacker floods `GET /auth/nonce` for many addresses, filling the `siws_nonces` table and exhausting Supabase write capacity.

**Mitigation:**
- Rate limit on nonce endpoint: 5 req/min per IP (`THROTTLE_NONCE_LIMIT`) (`backend/.env.example`)
- Nonces expire and can be pruned

**Residual risk:** Rate limit is per IP; distributed attacks from many IPs are not blocked. Expired nonces must be pruned by a background job (not confirmed in codebase).

**Follow-up:** `#TM-F12` — Add a scheduled job to delete expired nonces. Consider requiring a proof-of-work or CAPTCHA for nonce issuance.

---

## 6. Follow-Up Actions

| ID | Priority | Description | Owner |
|----|----------|-------------|-------|
| TM-F1 | High | Atomic nonce consumption (UPDATE … WHERE consumed = false RETURNING *) | `backend/src/auth/` |
| TM-F2 | High | Reduce JWT access token lifetime to 15–30 min | `backend/src/auth/` |
| TM-F3 | High | Magic byte validation for image uploads; HTML-escape metadata text fields | `backend/src/api/rest/raffles/` |
| TM-F4 | High | Startup check: reject `EnvKeyProvider` when `NODE_ENV=production` | `oracle/src/keys/` |
| TM-F5 | Medium | Timelock or multi-sig on `set_oracle_address` | Soroban contract (separate repo) |
| TM-F6 | Medium | Document 500 XLM VRF threshold; consider making it configurable | `oracle/src/randomness/`, docs |
| TM-F7 | Medium | Finality depth window before dispatching `RaffleFinalized` webhooks | `indexer/src/webhooks/` |
| TM-F8 | High | SSRF protection: block private IP ranges in webhook URL validation | `indexer/src/webhooks/` |
| TM-F9 | High | HMAC-SHA256 webhook payload signing (`X-Tikka-Signature`) | `indexer/src/webhooks/`, `backend/src/api/rest/webhooks/` |
| TM-F10 | High | Enforce non-empty `ADMIN_IP_ALLOWLIST` in production; add token rotation | `backend/src/` |
| TM-F11 | Medium | Secondary Horizon endpoint for cross-validation | `indexer/src/ingestor/`, `oracle/src/listener/` |
| TM-F12 | Low | Scheduled job to prune expired nonces | `backend/src/auth/` or Supabase cron |

---

## 7. Out of Scope

- Soroban contract internals (separate repo — `tikka-contracts`)
- Stellar network-level consensus attacks
- Client-side (browser) threats
- Infrastructure-level attacks (cloud provider, Kubernetes node compromise)

---

## 8. References

- Auth implementation: `backend/src/auth/`
- Oracle key management: `oracle/src/keys/`, `oracle/docs/KEY_MANAGEMENT.md`
- VRF design: `oracle/src/randomness/vrf.service.ts`
- Indexer reorg handling: `indexer/src/ingestor/reorg-rollback.service.ts`
- Webhook dispatch: `indexer/src/webhooks/webhook.service.ts`, `backend/src/api/rest/webhooks/`
- Security hardening: `backend/src/bootstrap.ts`, `backend/.env.example`
- Architecture overview: `docs/ARCHITECTURE.md`
