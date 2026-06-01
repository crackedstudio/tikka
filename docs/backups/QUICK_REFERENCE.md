# Backup & Restore Quick Reference

Quick lookup guide for common backup and restore tasks.

---

## Backup Commands

### Full Platform Backup
```bash
cd docs/backups
source backup.env              # Load configuration
./tikka-backup.sh full         # Backup all services
./tikka-backup.sh full --compress --upload-s3  # Compress and upload
```

### Individual Service Backup
```bash
./tikka-backup.sh backend      # Backend only
./tikka-backup.sh indexer      # Indexer only
./tikka-backup.sh oracle       # Oracle queue only
```

### Verify Backup
```bash
ls -lh /mnt/backups/backend/20240530_023000/
pg_restore --list /mnt/backups/backend/20240530_023000/backend-postgres.dump | head -20
```

---

## Restore Commands

### List Available Backups
```bash
./tikka-restore.sh list
```

### Full Restore
```bash
./tikka-restore.sh 20240530_023000        # All services
./tikka-restore.sh 20240530_023000 --dry-run --verbose  # Preview
```

### Restore Specific Service
```bash
./tikka-restore.sh 20240530_023000 --service backend
./tikka-restore.sh 20240530_023000 --service indexer
./tikka-restore.sh 20240530_023000 --service oracle
```

### Skip Redis During Restore
```bash
./tikka-restore.sh 20240530_023000 --skip-redis  # Database only
```

---

## Validation Commands

### Health Checks
```bash
curl http://localhost:3001/health      # Backend
curl http://localhost:3002/health      # Indexer
curl http://localhost:3003/health      # Oracle (if exposed)
```

### Database Verification
```bash
# Backend
psql "$BACKEND_DB_URL" -c "SELECT COUNT(*) FROM raffle_metadata;"

# Indexer
psql "$INDEXER_DB_URL" -c "SELECT COUNT(*) FROM raffle;"
psql "$INDEXER_DB_URL" -c "SELECT * FROM indexer_cursor LIMIT 1;"
```

### Redis Verification
```bash
# Check keys
redis-cli -h localhost -p 6379 KEYS "metadata:*" | head -10

# Check memory
redis-cli -h localhost -p 6379 INFO memory | grep used_memory_human

# Check Bull queue (Oracle)
redis-cli -h localhost -p 6379 --scan --pattern 'bull:*' | head -10
```

### Data Consistency
```bash
# Check for orphaned records
psql "$INDEXER_DB_URL" -c "
  SELECT COUNT(*) FROM ticket t
  WHERE NOT EXISTS (SELECT 1 FROM raffle r WHERE r.id = t.raffle_id);
"

# Verify raffle status distribution
psql "$INDEXER_DB_URL" -c "
  SELECT status, COUNT(*) FROM raffle GROUP BY status;
"
```

---

## Common Issues & Solutions

### Service Won't Start
```bash
# Check logs
docker logs backend | tail -50

# Check database connectivity
psql "$BACKEND_DB_URL" -c "SELECT 1;"

# Restart service
docker-compose -f backend/docker-compose.yml restart
```

### Indexer Lag High
```bash
# Check cursor position
psql "$INDEXER_DB_URL" -c "SELECT ledger_sequence FROM indexer_cursor;"

# Compare with Horizon
curl -s https://horizon.stellar.org/ledgers | jq '.records[0].sequence'

# Wait for catch-up or restart
docker-compose -f indexer/docker-compose.yml restart
```

### Redis Out of Memory
```bash
# Clear cache
redis-cli -h localhost -p 6379 FLUSHDB

# Check memory
redis-cli -h localhost -p 6379 INFO memory

# Increase maxmemory
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG REWRITE
```

### Backup/Restore Failed
```bash
# Check disk space
df -h /mnt/backups

# Verify backup file integrity
pg_restore --list /path/to/backup.dump | head -5

# Check database logs
tail -50 /var/log/postgresql/postgresql.log
```

---

## Automation Setup

### Cron Jobs (Linux/macOS)
```bash
# Add to /etc/cron.d/tikka-backups
0 2 * * * user /path/to/tikka-backup.sh backend
0 3 * * * user /path/to/tikka-backup.sh indexer
0 */6 * * * user /path/to/tikka-backup.sh oracle
0 1 * * 0 user /path/to/tikka-backup.sh full --upload-s3
```

### Kubernetes CronJob
```bash
kubectl create -f kubernetes/backup-cronjob.yaml
kubectl get cronjob -n tikka
kubectl logs -n tikka cronjob/tikka-backup
```

---

## Configuration

### Environment Variables
```bash
# Required
BACKEND_DB_URL="postgres://..."
INDEXER_DB_URL="postgres://..."

# Optional
BACKUP_DIR="/mnt/backups"
S3_BACKUP_BUCKET="s3://..."
BACKUP_RETENTION_DAYS="30"
COMPRESS_BACKUPS="true"
VERBOSE="false"
```

### Load Configuration
```bash
# Copy template
cp backup.env.template backup.env

# Edit with your values
nano backup.env

# Source in scripts
source backup.env
```

---

## File Reference

| File | Purpose |
|------|---------|
| `README.md` | Overview and quick start |
| `BACKUP_PROCEDURES.md` | Detailed backup methods and setup |
| `RESTORE_PROCEDURES.md` | Step-by-step restore procedures |
| `VALIDATION_CHECKLIST.md` | Post-restore validation |
| `OPERATIONAL_RUNBOOK.md` | Incident response and troubleshooting |
| `tikka-backup.sh` | Backup automation script |
| `tikka-restore.sh` | Restore automation script |
| `backup.env.template` | Configuration template |

---

## Emergency Contacts

- **On-Call Engineer:** [Rotation schedule]
- **Backend Lead:** [Name/Slack]
- **SRE Team:** #sre-oncall (Slack)

---

## Quick Links

- [Full Documentation](./README.md)
- [Backup Setup](./BACKUP_PROCEDURES.md#automated-backup-scheduling)
- [Restore Guide](./RESTORE_PROCEDURES.md)
- [Validation Steps](./VALIDATION_CHECKLIST.md)
- [Incident Response](./OPERATIONAL_RUNBOOK.md)

---

**Last Updated:** 2024-05-30  
**Version:** 1.0  
**Status:** Operational
