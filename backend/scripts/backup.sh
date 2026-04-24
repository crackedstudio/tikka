#!/usr/bin/env bash
# =============================================================================
# Tikka — Local Supabase Backup Script
# =============================================================================
# Usage:
#   bash backend/scripts/backup.sh
#
# Environment variables (can be set in backend/.env or exported in shell):
#   SUPABASE_DB_URL        — required: full Postgres connection string from
#                            Supabase dashboard → Settings → Database → URI
#   R2_BUCKET_NAME         — optional: if set, uploads backup to Cloudflare R2
#   R2_ACCESS_KEY_ID       — required if R2_BUCKET_NAME is set
#   R2_SECRET_ACCESS_KEY   — required if R2_BUCKET_NAME is set
#   R2_ENDPOINT_URL        — required if R2_BUCKET_NAME is set
#
# Output:
#   backend/backups/tikka-backup-<timestamp>.dump  (pg_dump custom format)
#
# The custom format supports selective restore (individual tables, schemas)
# and is more compact than plain SQL. Use pg_restore to restore it.
#
# Restore instructions are printed at the end of a successful backup.
# =============================================================================

set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log()   { echo -e "${CYAN}[backup]${RESET} $*"; }
ok()    { echo -e "${GREEN}[backup]${RESET} ✅ $*"; }
warn()  { echo -e "${YELLOW}[backup]${RESET} ⚠️  $*"; }
error() { echo -e "${RED}[backup]${RESET} ❌ $*" >&2; exit 1; }

# ── Load .env if present ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${BACKEND_DIR}/.env"

if [[ -f "$ENV_FILE" ]]; then
  log "Loading environment from ${ENV_FILE}"
  set -o allexport
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE")
  set +o allexport
fi

# ── Validate required env ─────────────────────────────────────────────────────
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  error "SUPABASE_DB_URL is not set.
  Get it from: Supabase dashboard → Settings → Database → Connection string (URI)
  Then either:
    export SUPABASE_DB_URL='postgresql://...'
  or add it to ${ENV_FILE}"
fi

# ── Check dependencies ────────────────────────────────────────────────────────
if ! command -v pg_dump &>/dev/null; then
  error "pg_dump not found. Install PostgreSQL client tools:
  macOS:  brew install libpq && brew link --force libpq
  Ubuntu: sudo apt-get install postgresql-client
  Debian: sudo apt-get install postgresql-client"
fi

# ── Prepare output directory ──────────────────────────────────────────────────
BACKUPS_DIR="${BACKEND_DIR}/backups"
mkdir -p "$BACKUPS_DIR"

TIMESTAMP=$(date -u '+%Y-%m-%d-%H%M%S')
BACKUP_FILE="${BACKUPS_DIR}/tikka-backup-${TIMESTAMP}.dump"

# ── Run pg_dump ───────────────────────────────────────────────────────────────
REDACTED_URL=$(echo "$SUPABASE_DB_URL" | sed 's|://[^:]*:[^@]*@|://<credentials>@|')
log "Starting pg_dump"
log "Database: ${REDACTED_URL}"
log "Output:   ${BACKUP_FILE}"

pg_dump \
  --dbname="$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  --file="$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
ok "Backup created: $(basename "$BACKUP_FILE") (${BACKUP_SIZE})"

# ── Optional: Upload to Cloudflare R2 ─────────────────────────────────────────
if [[ -n "${R2_BUCKET_NAME:-}" ]]; then
  log "Uploading to Cloudflare R2 bucket: ${R2_BUCKET_NAME}"

  for var in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT_URL; do
    if [[ -z "${!var:-}" ]]; then
      error "${var} is required when R2_BUCKET_NAME is set."
    fi
  done

  if ! command -v aws &>/dev/null; then
    error "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
  fi

  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION=auto \
  aws s3 cp \
    "$BACKUP_FILE" \
    "s3://${R2_BUCKET_NAME}/manual/$(basename "$BACKUP_FILE")" \
    --endpoint-url "${R2_ENDPOINT_URL}" \
    --checksum-algorithm SHA256 \
    --no-progress

  ok "Uploaded to R2: s3://${R2_BUCKET_NAME}/manual/$(basename "$BACKUP_FILE")"
else
  warn "R2_BUCKET_NAME not set — skipping cloud upload. Backup is local only."
fi

# ── Print restore instructions ────────────────────────────────────────────────
DUMP_BASENAME=$(basename "$BACKUP_FILE")
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD} 🔄  Restore Instructions${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Full restore (all tables):${RESET}"
echo -e "  ${YELLOW}pg_restore \\${RESET}"
echo -e "  ${YELLOW}  --dbname=\$SUPABASE_DB_URL \\${RESET}"
echo -e "  ${YELLOW}  --no-owner --no-acl \\${RESET}"
echo -e "  ${YELLOW}  --schema=public \\${RESET}"
echo -e "  ${YELLOW}  --verbose \\${RESET}"
echo -e "  ${YELLOW}  backups/${DUMP_BASENAME}${RESET}"
echo ""
echo -e "  ${BOLD}Selective restore (single table):${RESET}"
echo -e "  ${YELLOW}pg_restore \\${RESET}"
echo -e "  ${YELLOW}  --dbname=\$SUPABASE_DB_URL \\${RESET}"
echo -e "  ${YELLOW}  --table=raffle_metadata \\${RESET}"
echo -e "  ${YELLOW}  backups/${DUMP_BASENAME}${RESET}"
echo ""
echo -e "  Full guide: ${CYAN}backend/README.md → Database Backups & Restore${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
ok "Done. Backup: ${BACKUP_FILE}"
