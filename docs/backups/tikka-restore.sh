#!/bin/bash

################################################################################
# Tikka Platform - Automated Restore Script
#
# Usage:
#   ./tikka-restore.sh [TIMESTAMP] [--service backend|indexer|oracle|all]
#
# Examples:
#   ./tikka-restore.sh 20240530_023000            # Restore all services
#   ./tikka-restore.sh 20240530_023000 --service backend  # Restore backend only
#   ./tikka-restore.sh 20240530_023000 --dry-run   # Preview what will happen
#
# Environment Variables:
#   BACKUP_DIR              : Backup source directory (default: /mnt/backups)
#   BACKEND_DB_URL          : Backend database connection string
#   INDEXER_DB_URL          : Indexer database connection string
#   DRY_RUN                 : Set to 'true' to preview without making changes
#
# WARNING: This script will DROP and recreate databases. Use with caution!
#
################################################################################

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\"
SCRIPT_NAME=\"$(basename \"$0\")\"

# Default values
BACKUP_DIR=\"${BACKUP_DIR:-/mnt/backups}\"
DRY_RUN=\"${DRY_RUN:-false}\"
VERBOSE=\"${VERBOSE:-false}\"
SERVICE_TO_RESTORE=\"all\"
RESTORE_TIMESTAMP=\"${1:-}\"

# Service defaults
BACKEND_REDIS_HOST=\"${BACKEND_REDIS_HOST:-localhost}\"
BACKEND_REDIS_PORT=\"${BACKEND_REDIS_PORT:-6379}\"
INDEXER_REDIS_HOST=\"${INDEXER_REDIS_HOST:-localhost}\"
INDEXER_REDIS_PORT=\"${INDEXER_REDIS_PORT:-6379}\"
ORACLE_REDIS_HOST=\"${ORACLE_REDIS_HOST:-localhost}\"
ORACLE_REDIS_PORT=\"${ORACLE_REDIS_PORT:-6379}\"

# ============================================================================
# Functions
# ============================================================================

log() {
  local level=\"$1\"
  shift
  local message=\"$*\"
  local timestamp=\"$(date '+%Y-%m-%d %H:%M:%S')\"
  echo \"[$timestamp] [$level] $message\"
}

log_info() { log \"INFO\" \"$@\"; }
log_warn() { log \"WARN\" \"$@\"; }
log_error() { log \"ERROR\" \"$@\"; }
log_debug() {
  if [[ \"$VERBOSE\" == \"true\" ]]; then
    log \"DEBUG\" \"$@\"
  fi
}

usage() {
  cat << EOF
Usage: $SCRIPT_NAME TIMESTAMP [OPTIONS]

Arguments:
  TIMESTAMP      Backup timestamp (format: YYYYMMDD_HHMMSS)
                 Use 'list' to see available backups

Options:
  --service S    Restore specific service: backend, indexer, oracle, or all (default: all)
  --dry-run      Preview what will be restored without making changes
  --skip-redis   Skip Redis restore (database only)
  --verbose      Enable verbose output
  --help         Show this help message

Examples:
  $SCRIPT_NAME list                                    # List available backups
  $SCRIPT_NAME 20240530_023000                        # Restore all services
  $SCRIPT_NAME 20240530_023000 --service backend      # Restore backend only
  $SCRIPT_NAME 20240530_023000 --dry-run --verbose    # Preview restore

EOF
  exit 0
}

list_backups() {
  log_info \"Available backups:\"
  echo
  
  for service in backend indexer oracle; do
    echo \"$service:\"
    ls -dt \"$BACKUP_DIR\"/$service/*/ 2>/dev/null | head -5 | while read dir; do
      local size=\"$(du -sh \"$dir\" | cut -f1)\"
      local ts=\"$(basename \"$dir\")\"
      local manifest=\"${dir}MANIFEST.json\"
      if [[ -f \"$manifest\" ]]; then
        local backup_time=\"$(jq -r '.timestamp' \"$manifest\" 2>/dev/null)\"
        printf \"  %s (%s, size: %s)\\n\" \"$ts\" \"$backup_time\" \"$size\"
      else
        printf \"  %s (size: %s)\\n\" \"$ts\" \"$size\"
      fi
    done
    echo
  done
}

parse_args() {
  shift  # Skip script name
  
  while [[ $# -gt 0 ]]; do
    case \"$1\" in
      --service)
        SERVICE_TO_RESTORE=\"$2\"
        shift 2
        ;;
      --skip-redis)
        SKIP_REDIS=\"true\"
        shift
        ;;
      --dry-run)
        DRY_RUN=\"true\"
        shift
        ;;
      --verbose)
        VERBOSE=\"true\"
        shift
        ;;
      --help)
        usage
        ;;
      list)
        list_backups
        exit 0
        ;;
      *)
        log_error \"Unknown option: $1\"
        usage
        ;;
    esac
  done
}

confirm_action() {
  local prompt=\"$1\"
  
  if [[ \"$DRY_RUN\" == \"true\" ]]; then
    log_warn \"[DRY RUN MODE] Would perform: $prompt\"
    return 0
  fi
  
  read -p \"$prompt (yes/no): \" -r
  if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    return 0
  else
    return 1
  fi
}

verify_backup_exists() {
  local service=\"$1\"
  local backup_dir=\"${BACKUP_DIR}/${service}/${RESTORE_TIMESTAMP}\"
  
  if [[ ! -d \"$backup_dir\" ]]; then
    log_error \"Backup not found: $backup_dir\"
    return 1
  fi
  
  log_debug \"Found backup: $backup_dir\"
  return 0
}

restore_postgres() {
  local db_url=\"$1\"
  local service_name=\"$2\"
  local backup_dir=\"$3\"
  local dump_file=\"${backup_dir}/${service_name}-postgres.dump\"
  
  if [[ ! -f \"$dump_file\" ]]; then
    log_error \"Backup dump not found: $dump_file\"
    return 1
  fi
  
  log_info \"Restoring $service_name Postgres from $dump_file...\"
  
  if [[ \"$DRY_RUN\" == \"true\" ]]; then
    log_warn \"[DRY RUN] Would restore Postgres from $dump_file\"
    log_warn \"[DRY RUN] Would drop and recreate database\"
    return 0
  fi
  
  # Extract database name from connection string
  local db_name=\"$(echo \"$db_url\" | sed -n 's|^.*\/\([^?]*\).*|\1|p')\"
  local db_host=\"$(echo \"$db_url\" | sed -n 's|^.*://[^:]*:\([^@]*\)@\([^:]*\):.*|\2|p')\"
  db_host=\"${db_host:-localhost}\"
  
  log_warn \"This will DROP the $db_name database!\"
  if ! confirm_action \"Proceed with restore? This cannot be undone.\"; then
    log_error \"Restore cancelled\"
    return 1
  fi
  
  # Drop existing database
  log_info \"Dropping existing database...\"
  psql -U postgres -h \"$db_host\" -c \"DROP DATABASE IF EXISTS $db_name;\" 2>/dev/null || true
  
  # Recreate database
  log_info \"Creating fresh database...\"
  psql -U postgres -h \"$db_host\" -c \"CREATE DATABASE $db_name;\"
  
  # Restore from backup
  log_info \"Restoring from backup...\"
  if pg_restore --clean --no-owner --no-privileges \\
    --jobs=4 \\
    --dbname=\"$db_url\" \\
    \"$dump_file\" 2>&1; then
    log_info \"✓ $service_name Postgres restored\"
    return 0
  else
    log_error \"Failed to restore $service_name Postgres\"
    return 1
  fi
}

restore_redis() {
  local redis_host=\"$1\"
  local redis_port=\"$2\"
  local service_name=\"$3\"
  local backup_dir=\"$4\"
  local rdb_file=\"${backup_dir}/${service_name}-redis.rdb\"
  
  if [[ ! -f \"$rdb_file\" ]]; then
    log_warn \"Redis backup not found: $rdb_file (skipping)\"
    return 0
  fi
  
  if [[ \"${SKIP_REDIS:-false}\" == \"true\" ]]; then
    log_info \"Skipping Redis restore for $service_name (--skip-redis)\"
    return 0
  fi
  
  log_info \"Restoring $service_name Redis from $rdb_file...\"
  
  if [[ \"$DRY_RUN\" == \"true\" ]]; then
    log_warn \"[DRY RUN] Would restore Redis RDB from $rdb_file\"
    return 0
  fi
  
  # Shutdown Redis
  redis-cli -h \"$redis_host\" -p \"$redis_port\" SHUTDOWN NOSAVE 2>/dev/null || true
  sleep 2
  
  # Replace RDB file
  cp \"$rdb_file\" /var/lib/redis/dump.rdb
  chown redis:redis /var/lib/redis/dump.rdb 2>/dev/null || true
  chmod 644 /var/lib/redis/dump.rdb
  
  # Start Redis
  redis-server --daemonize yes --port \"$redis_port\"
  sleep 2
  
  # Verify
  if redis-cli -h \"$redis_host\" -p \"$redis_port\" PING > /dev/null 2>&1; then
    log_info \"✓ $service_name Redis restored\"
    return 0
  else
    log_error \"Failed to restore $service_name Redis\"
    return 1
  fi
}

restore_service() {
  local service=\"$1\"
  local backup_dir=\"${BACKUP_DIR}/${service}/${RESTORE_TIMESTAMP}\"
  
  log_info \"======================================\"
  log_info \"Restoring $service service\"
  log_info \"======================================\"
  
  verify_backup_exists \"$service\" || return 1
  
  case \"$service\" in
    backend)
      restore_postgres \"$BACKEND_DB_URL\" \"backend\" \"$backup_dir\" || return 1
      restore_redis \"$BACKEND_REDIS_HOST\" \"$BACKEND_REDIS_PORT\" \"backend\" \"$backup_dir\" || true
      ;;
    indexer)
      restore_postgres \"$INDEXER_DB_URL\" \"indexer\" \"$backup_dir\" || return 1
      restore_redis \"$INDEXER_REDIS_HOST\" \"$INDEXER_REDIS_PORT\" \"indexer\" \"$backup_dir\" || true
      ;;
    oracle)
      restore_redis \"$ORACLE_REDIS_HOST\" \"$ORACLE_REDIS_PORT\" \"oracle\" \"$backup_dir\" || true
      ;;
    *)
      log_error \"Unknown service: $service\"
      return 1
      ;;
  esac
  
  log_info \"✓ $service restored successfully\"
}

# ============================================================================
# Main
# ============================================================================

main() {
  # Parse arguments
  if [[ $# -eq 0 ]]; then
    usage
  fi
  
  # Check for help or list
  if [[ \"$1\" == \"--help\" ]]; then
    usage
  elif [[ \"$1\" == \"list\" ]]; then
    list_backups
    exit 0
  fi
  
  RESTORE_TIMESTAMP=\"$1\"
  shift || true
  
  # Parse remaining arguments
  while [[ $# -gt 0 ]]; do
    case \"$1\" in
      --service)
        SERVICE_TO_RESTORE=\"$2\"
        shift 2
        ;;
      --skip-redis)
        SKIP_REDIS=\"true\"
        shift
        ;;
      --dry-run)
        DRY_RUN=\"true\"
        shift
        ;;
      --verbose)
        VERBOSE=\"true\"
        shift
        ;;
      *)
        log_error \"Unknown option: $1\"
        usage
        ;;
    esac
  done
  
  # Validate timestamp format
  if ! [[ \"$RESTORE_TIMESTAMP\" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
    log_error \"Invalid timestamp format: $RESTORE_TIMESTAMP (expected: YYYYMMDD_HHMMSS)\"
    echo \"Available backups:\"
    list_backups
    exit 1
  fi
  
  # Print mode
  if [[ \"$DRY_RUN\" == \"true\" ]]; then
    log_warn \"========================================\"
    log_warn \"DRY RUN MODE - No changes will be made\"
    log_warn \"========================================\"
  fi
  
  log_info \"Starting restore (timestamp=$RESTORE_TIMESTAMP, service=$SERVICE_TO_RESTORE)\"
  
  # Perform restore
  case \"$SERVICE_TO_RESTORE\" in
    backend|indexer|oracle)
      restore_service \"$SERVICE_TO_RESTORE\" || exit 1
      ;;
    all)
      for service in backend indexer oracle; do
        restore_service \"$service\" || log_error \"Failed to restore $service\"
      done
      ;;
    *)
      log_error \"Unknown service: $SERVICE_TO_RESTORE\"
      usage
      ;;
  esac
  
  log_info \"======================================\"
  log_info \"Restore complete! ✓\"
  log_info \"======================================\"
  if [[ \"$DRY_RUN\" == \"true\" ]]; then
    log_warn \"[DRY RUN] No actual changes were made\"
  else
    log_info \"Next: Run validation checks (see VALIDATION_CHECKLIST.md)\"
  fi
}

# Trap errors
trap 'log_error \"Restore failed with exit code $?\"' ERR

# Run main
main \"$@\"
