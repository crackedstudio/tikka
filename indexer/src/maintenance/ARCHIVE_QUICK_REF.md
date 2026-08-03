# Raffle Events Archiving - Quick Reference

## Quick Start

```bash
# Test (dry-run)
npm run archive:raffle-events

# Production (interactive TTY — type "yes" when prompted)
DRY_RUN=false npm run archive:raffle-events

# Production (non-interactive / cron — explicit confirmation required)
CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events
```

## Common Commands

```bash
# Archive events older than 60 days
RAFFLE_EVENTS_RETENTION_DAYS=60 CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events

# Process only 10 batches
MAX_BATCH=10 CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events

# Larger batches for faster processing
BATCH_SIZE=2000 CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events

# Start fresh (ignore checkpoints)
RESUME=false CONFIRM_DELETE=yes DRY_RUN=false npm run archive:raffle-events
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAFFLE_EVENTS_RETENTION_DAYS` | `30` | Archive events older than N days |
| `BATCH_SIZE` | `500` | Records per batch |
| `MAX_BATCH` | unlimited | Max batches per run |
| `DRY_RUN` | `true` | Simulate without changes |
| `CONFIRM_DELETE` | unset | Must be `yes` for non-interactive deletes |
| `RESUME` | `true` | Resume from checkpoint |

## Output

- **CSV Files**: `./archives/raffle_events_YYYY-MM-DD_batchNNNN.csv`
- **Logs**: JSON-formatted to stdout
- **Checkpoint**: Stored in `archive_checkpoints` table

## Monitoring

```bash
# Watch progress
npm run archive:raffle-events 2>&1 | jq -r '.message'

# Check checkpoint status
psql -c "SELECT * FROM archive_checkpoints WHERE job_type='raffle_events' ORDER BY started_at DESC LIMIT 1;"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Slow performance | Reduce `BATCH_SIZE` or use `MAX_BATCH` |
| Disk full | Use `MAX_BATCH` to limit files per run |
| Not resuming | Check `RESUME=true` and checkpoint status |
| Stuck | Check for long-running transactions in database |
| Aborted without CONFIRM_DELETE | Set `CONFIRM_DELETE=yes` or confirm at the TTY prompt |

## Safety Checklist

- [ ] Run dry-run first
- [ ] Check disk space
- [ ] Verify retention days
- [ ] Confirm deletes (`CONFIRM_DELETE=yes` or interactive prompt)
- [ ] Schedule during low-traffic period
- [ ] Monitor progress
- [ ] Backup CSV files after completion

## Key Features

✅ Resumable after interruptions  
✅ Dry-run simulation  
✅ Delete confirmation before removals  
✅ Batch limits  
✅ Transactional safety  
✅ Structured logging  

## Full Documentation

- Retention / restore (ops): [`docs/database/raffle-events-retention.md`](../../../docs/database/raffle-events-retention.md)
- Guide: [ARCHIVE_RAFFLE_EVENTS_GUIDE.md](./ARCHIVE_RAFFLE_EVENTS_GUIDE.md)
