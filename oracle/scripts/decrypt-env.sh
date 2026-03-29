#!/usr/bin/env bash
# scripts/decrypt-env.sh
#
# Decrypts oracle/.env.enc (SOPS-encrypted) into oracle/.env at startup.
# The decrypted file is written to a tmpfs mount in production (see k8s/deployment.yaml).
#
# Usage:
#   SOPS_AGE_KEY_FILE=/run/secrets/age.key ./scripts/decrypt-env.sh
#   # or with AWS KMS:
#   AWS_PROFILE=oracle ./scripts/decrypt-env.sh
#
# The resulting .env is loaded by NestJS ConfigModule automatically.
# Never commit .env or .env.enc containing real secrets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORACLE_DIR="$SCRIPT_DIR/../oracle"
ENC_FILE="${ORACLE_DIR}/.env.enc"
OUT_FILE="${ORACLE_DIR}/.env"

if [[ ! -f "$ENC_FILE" ]]; then
  echo "[decrypt-env] No encrypted env file found at $ENC_FILE — skipping." >&2
  exit 0
fi

if ! command -v sops &>/dev/null; then
  echo "[decrypt-env] ERROR: sops not found in PATH." >&2
  exit 1
fi

sops --decrypt "$ENC_FILE" > "$OUT_FILE"
chmod 600 "$OUT_FILE"
echo "[decrypt-env] Decrypted env written to $OUT_FILE"
