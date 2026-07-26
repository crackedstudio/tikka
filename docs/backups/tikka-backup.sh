#!/bin/bash

################################################################################
# Tikka Platform - Automated Backup Script
#
# Usage:
#   ./tikka-backup.sh [backend|indexer|oracle|full] [--upload-s3] [--compress]
#
# Examples:
#   ./tikka-backup.sh backend              # Backup backend service
#   ./tikka-backup.sh full --upload-s3     # Full backup and upload to S3
#   ./tikka-backup.sh indexer --compress   # Backup indexer with compression
#
# Environment Variables (optional):
#   BACKUP_DIR              : Backup destination directory (default: /mnt/backups)
#   BACKEND_DB_URL          : Backend database connection string
#   INDEXER_DB_URL          : Indexer database connection string
#   BACKEND_REDIS_HOST      : Backend Redis host (default: localhost)
#   BACKEND_REDIS_PORT      : Backend Redis port (default: 6379)\n#   INDEXER_REDIS_HOST      : Indexer Redis host (default: localhost)\n#   INDEXER_REDIS_PORT      : Indexer Redis port (default: 6379)\n#   ORACLE_REDIS_HOST       : Oracle Redis host (default: localhost)\n#   ORACLE_REDIS_PORT       : Oracle Redis port (default: 6379)\n#   S3_BACKUP_BUCKET        : S3 bucket for uploads\n#   BACKUP_RETENTION_DAYS   : Retention period in days (default: 30)\n#
################################################################################

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\"
SCRIPT_NAME=\"$(basename \"$0\")\"

# Default values
BACKUP_DIR=\"${BACKUP_DIR:-/mnt/backups}\"
TIMESTAMP=\"$(date +%Y%m%d_%H%M%S)\"
LOG_FILE=\"${BACKUP_DIR}/tikka-backup.log\"
VERBOSE=\"${VERBOSE:-false}\"

# Service defaults
BACKEND_REDIS_HOST=\"${BACKEND_REDIS_HOST:-localhost}\"
BACKEND_REDIS_PORT=\"${BACKEND_REDIS_PORT:-6379}\"
INDEXER_REDIS_HOST=\"${INDEXER_REDIS_HOST:-localhost}\"
INDEXER_REDIS_PORT=\"${INDEXER_REDIS_PORT:-6379}\"
ORACLE_REDIS_HOST=\"${ORACLE_REDIS_HOST:-localhost}\"
ORACLE_REDIS_PORT=\"${ORACLE_REDIS_PORT:-6379}\"

# Options
SERVICE=\"${1:-full}\"
UPLOAD_S3=\"false\"
COMPRESS=\"false\"

# ============================================================================
# Functions
# ============================================================================

log() {
  local level=\"$1\"
  shift
  local message=\"$*\"
  local timestamp=\"$(date '+%Y-%m-%d %H:%M:%S')\"
  echo \"[$timestamp] [$level] $message\" | tee -a \"$LOG_FILE\"
}

log_info() { log \"INFO\" \"$@\"; }
log_error() { log \"ERROR\" \"$@\"; }
log_debug() { 
  if [[ \"$VERBOSE\" == \"true\" ]]; then
    log \"DEBUG\" \"$@\"
  fi
}

usage() {
  cat << EOF
Usage: $SCRIPT_NAME [SERVICE] [OPTIONS]

Services:
  backend        Backup backend metadata database and Redis
  indexer        Backup indexer event database and Redis
  oracle         Backup oracle Redis queue state
  full           Backup all services (default)

Options:
  --upload-s3    Upload backups to S3 after creation
  --compress     Compress backup files with gzip
  --help         Show this help message
  --verbose      Enable verbose output

Examples:
  $SCRIPT_NAME backend
  $SCRIPT_NAME full --upload-s3 --compress
  $SCRIPT_NAME indexer --verbose

EOF
  exit 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case \"$1\" in
      --upload-s3) UPLOAD_S3=\"true\"; shift ;;
      --compress) COMPRESS=\"true\"; shift ;;
      --verbose) VERBOSE=\"true\"; shift ;;
      --help) usage ;;
      backend|indexer|oracle|full) SERVICE=\"$1\"; shift ;;
      *)
        log_error \"Unknown option: $1\"
        usage
        ;;
    esac
  done
}

verify_prerequisites() {
  log_info \"Verifying prerequisites...\"
  
  # Check tools
  for tool in psql pg_dump redis-cli; do
    if ! command -v \"$tool\" &> /dev/null; then
      log_error \"Required tool not found: $tool\"
      return 1
    fi
  done
  
  # Check directories
  mkdir -p \"$BACKUP_DIR\"
  
  # Check database connectivity
  if [[ -n \"${BACKEND_DB_URL:-}\" ]]; then
    if ! psql \"$BACKEND_DB_URL\" -c \"SELECT 1;\" > /dev/null 2>&1; then
      log_error \"Cannot connect to backend database\"
      return 1
    fi
    log_info \"✓ Backend database accessible\"
  fi
  
  if [[ -n \"${INDEXER_DB_URL:-}\" ]]; then
    if ! psql \"$INDEXER_DB_URL\" -c \"SELECT 1;\" > /dev/null 2>&1; then
      log_error \"Cannot connect to indexer database\"
      return 1
    fi
    log_info \"✓ Indexer database accessible\"
  fi
  
  log_info \"Prerequisites verified ✓\"
}

backup_postgres() {
  local db_url=\"$1\"
  local service_name=\"$2\"
  local backup_dir=\"$3\"
  local dump_file=\"${backup_dir}/${service_name}-postgres.dump\"
  
  log_info \"Backing up $service_name Postgres...\"
  
  if pg_dump -Fc --jobs=4 --file=\"$dump_file\" \"$db_url\" 2>&1 | tee -a \"$LOG_FILE\"; then
    log_info \"✓ $service_name Postgres backup complete ($(du -h \"$dump_file\" | cut -f1))\"
    return 0
  else
    log_error \"Failed to backup $service_name Postgres\"
    return 1
  fi
}

backup_redis() {
  local redis_host=\"$1\"
  local redis_port=\"$2\"
  local service_name=\"$3\"
  local backup_dir=\"$4\"
  local rdb_file=\"${backup_dir}/${service_name}-redis.rdb\"
  
  log_info \"Backing up $service_name Redis...\"
  
  # Trigger background save
  if ! redis-cli -h \"$redis_host\" -p \"$redis_port\" BGSAVE > /dev/null 2>&1; then
    log_error \"Failed to trigger Redis BGSAVE for $service_name\"
    return 1
  fi
  
  # Wait for background save to complete (max 60 seconds)
  local retries=0
  while [[ $retries -lt 60 ]]; do
    if redis-cli -h \"$redis_host\" -p \"$redis_port\" LASTSAVE > /dev/null 2>&1; then
      break
    fi
    sleep 1
    retries=$((retries + 1))
  done
  
  # Try to get RDB file (location varies by system)
  if redis-cli -h \"$redis_host\" -p \"$redis_port\" --rdb \"$rdb_file\" > /dev/null 2>&1; then
    log_info \"✓ $service_name Redis backup complete ($(du -h \"$rdb_file\" | cut -f1))\"
    return 0
  else
    log_error \"Failed to backup $service_name Redis\"
    return 1
  fi
}

backup_service() {
  local service=\"$1\"
  local service_dir=\"${BACKUP_DIR}/${service}/${TIMESTAMP}\"
  
  mkdir -p \"$service_dir\"
  log_info \"======================================\"
  log_info \"Backing up $service service to $service_dir\"
  log_info \"======================================\"
  
  case \"$service\" in
    backend)
      backup_postgres \"$BACKEND_DB_URL\" \"backend\" \"$service_dir\" || return 1
      backup_redis \"$BACKEND_REDIS_HOST\" \"$BACKEND_REDIS_PORT\" \"backend\" \"$service_dir\" || true
      ;;
    indexer)
      backup_postgres \"$INDEXER_DB_URL\" \"indexer\" \"$service_dir\" || return 1
      backup_redis \"$INDEXER_REDIS_HOST\" \"$INDEXER_REDIS_PORT\" \"indexer\" \"$service_dir\" || true
      ;;
    oracle)
      backup_redis \"$ORACLE_REDIS_HOST\" \"$ORACLE_REDIS_PORT\" \"oracle\" \"$service_dir\" || true
      ;;
    *)
      log_error \"Unknown service: $service\"
      return 1
      ;;
  esac
  
  # Create manifest
  cat > \"$service_dir/MANIFEST.json\" << MANIFEST_EOF
{
  \"service\": \"$service\",
  \"timestamp\": \"$(date -Iseconds)\",
  \"backup_type\": \"full\",
  \"hostname\": \"$(hostname)\",
  \"backup_script_version\": \"1.0\"
}
MANIFEST_EOF
  
  log_info \"✓ Backup manifest created\"
  
  if [[ \"$COMPRESS\" == \"true\" ]]; then
    compress_backup \"$service_dir\"
  fi
  
  echo \"$service_dir\"
}

compress_backup() {
  local backup_dir=\"$1\"
  
  log_info \"Compressing backup...\"
  (cd \"$(dirname \"$backup_dir\")\" && tar -czf \"$(basename \"$backup_dir\").tar.gz\" \"$(basename \"$backup_dir\")\")
  log_info \"✓ Compression complete ($(du -h \"${backup_dir}.tar.gz\" | cut -f1))\"
}

upload_to_s3() {
  local backup_dir=\"$1\"
  local service=\"$(basename $(dirname \"$backup_dir\"))\"
  
  if [[ -z \"${S3_BACKUP_BUCKET:-}\" ]]; then
    log_error \"S3_BACKUP_BUCKET not set, skipping upload\"
    return 1
  fi
  
  log_info \"Uploading to S3...\"
  
  if [[ \"$COMPRESS\" == \"true\" ]]; then
    aws s3 cp \"${backup_dir}.tar.gz\" \"${S3_BACKUP_BUCKET}/${service}/${TIMESTAMP}.tar.gz\" --sse AES256
  else
    aws s3 sync \"$backup_dir\" \"${S3_BACKUP_BUCKET}/${service}/${TIMESTAMP}/\" --sse AES256
  fi
  
  log_info \"✓ Upload to S3 complete\"
}

cleanup_old_backups() {
  local retention_days=\"${BACKUP_RETENTION_DAYS:-30}\"
  
  log_info \"Cleaning up backups older than $retention_days days...\"
  
  find \"$BACKUP_DIR\" -maxdepth 3 -type d -mtime \"+$retention_days\" -exec rm -rf {} + 2>/dev/null || true
  
  log_info \"✓ Cleanup complete\"
}

# ============================================================================
# Main
# ============================================================================

main() {
  parse_args \"$@\"
  
  log_info \"Starting Tikka backup (service=$SERVICE, timestamp=$TIMESTAMP)\"
  
  verify_prerequisites || exit 1
  
  case \"$SERVICE\" in
    backend|indexer|oracle)
      backup_dir=\"$(backup_service \"$SERVICE\")\"
      ;;
    full)
      for svc in backend indexer oracle; do
        backup_service \"$svc\" || log_error \"Failed to backup $svc (continuing)\"
      done
      backup_dir=\"${BACKUP_DIR}/full-platform/${TIMESTAMP}\"
      mkdir -p \"$backup_dir\"
      ;;
    *)
      log_error \"Unknown service: $SERVICE\"
      usage
      ;;
  esac
  
  if [[ \"$UPLOAD_S3\" == \"true\" ]]; then
    upload_to_s3 \"$backup_dir\"
  fi
  
  cleanup_old_backups
  
  log_info \"======================================\"
  log_info \"Backup complete! ✓\"
  log_info \"======================================\"
  log_info \"Backup location: $backup_dir\"
  log_info \"Backup timestamp: $TIMESTAMP\"
  log_info \"Log file: $LOG_FILE\"
}

# Trap errors
trap 'log_error \"Backup failed with exit code $?\"' ERR

# Run main
main \"$@\"
