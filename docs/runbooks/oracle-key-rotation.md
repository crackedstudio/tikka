# Runbook: Oracle Key Rotation

## Purpose

Rotate a compromised or aged oracle signing key under pressure with a tested,
provider-specific procedure. Providers live under `oracle/src/keys/providers`:

| Provider | Config (`KEY_PROVIDER`) | Hot-swap? | Downtime |
|---|---|---|---|
| Env | `env` | **No** — key is loaded once at process start | Restart required (seconds) |
| AWS KMS | `aws-kms` | **Partial** — new key version/ARN requires config + restart; KMS itself can enable a new key without code changes once pointed at it | Restart required to pick up new `AWS_KMS_KEY_ID` |
| GCP KMS | `gcp-kms` | **Partial** — bump `GCP_KEY_VERSION` (or new key id) then restart | Restart required to pick up new version/path |

**None of the current providers hot-reload credentials in-process.** Plan for a
brief restart window on every rotation. Drain in-flight draws first when possible
(see [oracle-stuck-draw](./oracle-stuck-draw.md)).

Related docs: [`oracle/docs/KEY_MANAGEMENT.md`](../../oracle/docs/KEY_MANAGEMENT.md),
[`oracle/MULTI_ORACLE.md`](../../oracle/MULTI_ORACLE.md).

---

## Preconditions

1. You have admin access to the raffle contract (to `add_oracle` / `remove_oracle`).
2. You can redeploy/restart the oracle service and update its secrets.
3. Testnet rehearsal completed at least once for the provider you will use in prod
   (checklist at the bottom of this runbook).
4. Set/track key age via:
   - `ORACLE_KEY_CREATED_AT` — ISO-8601 date the active key was created/rotated
   - `ORACLE_KEY_MAX_AGE_DAYS` — warn threshold (default `90`)

`npm run config:verify` (and oracle startup) warn when the key is older than the
configured max age.

---

## Shared high-level flow

```
1. Generate new key material (provider-specific)
2. Register new oracle public key on-chain (add_oracle) BEFORE cutting over
3. Swap oracle config to the new key
4. Restart oracle; confirm health + a testnet/signed draw
5. Revoke old key on-chain (remove_oracle) and destroy old secret material
6. Update ORACLE_KEY_CREATED_AT to today
```

On-chain helpers (admin):

```text
add_oracle(env, oracle: Address, weight: u32)
remove_oracle(env, oracle: Address)
```

Use the Stellar account / public key corresponding to the oracle signer.

---

## A. Env provider (`KEY_PROVIDER=env`)

**Hot-swap:** No. Process holds the secret in memory from boot.

### 1. Generate

```bash
# Create a fresh Stellar keypair (do this offline / in a secure shell)
stellar keys generate oracle-rot-$(date +%Y%m%d) --network testnet
stellar keys address oracle-rot-YYYYMMDD   # → G...
# Secret is stored by the CLI; export only into your secret manager:
# ORACLE_SECRET_KEY=S...
```

### 2. Register on-chain

Submit `add_oracle` with the new `G...` address (and weight) while the old key
is still serving traffic.

### 3. Swap

Update the secret in your env / secret store:

```bash
KEY_PROVIDER=env
ORACLE_SECRET_KEY=S...          # new secret
ORACLE_KEY_CREATED_AT=2026-07-27
ORACLE_KEY_MAX_AGE_DAYS=90
```

Prefer `ORACLE_SECRET_KEY` (also accepts `ORACLE_PRIVATE_KEY`).

### 4. Restart & verify

```bash
cd oracle
npm run config:verify
# redeploy / restart the oracle process
curl -sf http://localhost:3003/health || true
# Confirm logs: KeyService initialized with env provider for address: G...
```

### 5. Revoke old

After the new key has signed at least one successful draw:

1. `remove_oracle` for the old `G...` address.
2. Delete the old secret from the secret store and any local shells/history.
3. Leave the new key registered.

**Downtime:** length of process restart only. Keep old key registered until the
new process is healthy so in-flight work still verifies if a dual-registration
window is used.

---

## B. AWS KMS provider (`KEY_PROVIDER=aws-kms`)

**Hot-swap:** No in-process reload. You can pre-create the new KMS key (or new
key material) with zero downtime, then cut over with a restart.

> Note: AWS KMS does not natively support Ed25519 for Stellar. Follow
> `oracle/docs/KEY_MANAGEMENT.md` for the project's KMS signing model
> (CloudHSM / external Ed25519 mapping as deployed for your environment).

### 1. Generate

```bash
aws kms create-key \
  --description "tikka-oracle-$(date +%Y%m%d)" \
  --key-usage SIGN_VERIFY \
  --key-spec ECC_SECG_P256K1   # or the spec your deployment requires

# Capture KeyId / ARN
NEW_ARN=arn:aws:kms:...
aws kms get-public-key --key-id "$NEW_ARN"
# Derive / record the Stellar G-address your deployment maps from this key
```

Grant the oracle IAM role `kms:Sign`, `kms:GetPublicKey` on the new key
(see `oracle/docs/iam-policies/aws-kms-policy.json`).

### 2. Register on-chain

`add_oracle` with the new public Stellar address mapped from the KMS key.

### 3. Swap

```bash
KEY_PROVIDER=aws-kms
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=$NEW_ARN
ORACLE_KEY_CREATED_AT=2026-07-27
ORACLE_KEY_MAX_AGE_DAYS=90
```

### 4. Restart & verify

```bash
cd oracle && npm run config:verify
# restart deployment
# Logs: KeyService initialized with aws-kms provider for address: G...
aws kms get-public-key --key-id "$NEW_ARN"   # sanity
```

### 5. Revoke old

1. `remove_oracle` for the old address.
2. Schedule deletion of the old KMS key (`aws kms schedule-key-deletion --pending-window-in-days 7`).
3. Remove IAM grants for the old key.

**Downtime:** restart only. Pre-create and pre-register the new key to keep the
cutover window under a minute.

---

## C. GCP KMS provider (`KEY_PROVIDER=gcp-kms`)

**Hot-swap:** No in-process reload. Prefer creating a **new key version** on the
same crypto key, then pointing `GCP_KEY_VERSION` at it and restarting.

### 1. Generate

```bash
# New version on existing key (preferred)
gcloud kms keys versions create \
  --key=oracle-signing-key \
  --keyring=oracle-keys \
  --location=global

# Or create a new key / ring if rotating identity entirely
gcloud kms keys create oracle-signing-key-$(date +%Y%m%d) \
  --keyring=oracle-keys \
  --location=global \
  --purpose=asymmetric-signing \
  --default-algorithm=ec-sign-ed25519   # if available in your region/API

NEW_VERSION=<n>
gcloud kms keys versions describe "$NEW_VERSION" \
  --key=oracle-signing-key --keyring=oracle-keys --location=global
```

Ensure the runtime SA still has `cloudkms.cryptoKeyVersions.useToSign` and
`cloudkms.cryptoKeyVersions.view` (see `oracle/docs/iam-policies/gcp-kms-permissions.yaml`).

### 2. Register on-chain

`add_oracle` with the G-address for the new version **if** the public key
changed. Same-key new version usually changes the public key — always verify.

### 3. Swap

```bash
KEY_PROVIDER=gcp-kms
GCP_PROJECT_ID=my-project
GCP_LOCATION_ID=global
GCP_KEY_RING_ID=oracle-keys
GCP_KEY_ID=oracle-signing-key
GCP_KEY_VERSION=$NEW_VERSION
# Factory also accepts GCP_KMS_PROJECT + GCP_KMS_KEY_PATH in some deployments —
# keep whichever pair your environment already uses, consistently.
ORACLE_KEY_CREATED_AT=2026-07-27
ORACLE_KEY_MAX_AGE_DAYS=90
```

### 4. Restart & verify

```bash
cd oracle && npm run config:verify
# restart
# Logs: KeyService initialized with gcp-kms provider ...
```

### 5. Revoke old

1. `remove_oracle` for the old address (when public key changed).
2. Disable the old KMS key version (`gcloud kms keys versions disable ...`).
3. Destroy only after the pending-destruction window and confirmed cutover.

**Downtime:** restart only.

---

## Compromised-key emergency path

1. **Immediately** `remove_oracle` for the compromised address (stops acceptance).
2. Pause draws if the contract supports a pause / if platform_state pause is wired.
3. Generate + register a new key (sections above).
4. Cut over config, restart, verify a draw on testnet twin or staging first if time allows.
5. Rotate every secret that may have been exposed (env files, CI vars, sealed secrets).
6. Incident notes: when discovered, which provider, ledger/tx of revoke + add.

---

## Testnet rehearsal checklist (do once per provider)

Use this checklist to close gaps before relying on the runbook in production.

- [ ] Generate new key material on **testnet** for the target provider
- [ ] `add_oracle` new G-address on the testnet raffle contract
- [ ] Update oracle env; `npm run config:verify` passes (including key-age vars)
- [ ] Restart oracle; logs show the new public key
- [ ] Trigger / wait for one draw; confirm `receive_randomness` succeeds
- [ ] `remove_oracle` old address; confirm old key can no longer submit
- [ ] Destroy/disable old key material
- [ ] Set `ORACLE_KEY_CREATED_AT` to rehearsal date; confirm age warning fires when
      temporarily setting `ORACLE_KEY_MAX_AGE_DAYS=0` (or a tiny value), then restore

### Gaps found & fixed during rehearsal

Record fixes here when you rehearse:

| Date | Provider | Network | Gap | Fix |
|---|---|---|---|---|
| 2026-07-27 | env | testnet | Providers do not hot-reload; docs previously implied zero-downtime rotation | Documented restart requirement; dual-register window before remove |
| 2026-07-27 | all | testnet | No key-age signal in `config:verify` | Added `ORACLE_KEY_CREATED_AT` / `ORACLE_KEY_MAX_AGE_DAYS` warning |

---

## Config reference (age check)

```bash
# Required for meaningful age warnings
ORACLE_KEY_CREATED_AT=2026-07-27T00:00:00Z
# Optional; default 90
ORACLE_KEY_MAX_AGE_DAYS=90
```

- `npm run config:verify` — prints warnings, exits `0` if schema is valid
- Oracle **startup** runs the same verification; **errors** abort boot, **warnings** log and continue
