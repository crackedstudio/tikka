# Raffle Events Archiving - Quick Reference

## Quick Start

```bash
# Test (dry-run)
npm run archive:raffle-events

# Production
DRY_RUN=false npm run archive:raffle-events
```

## Common Commands

```bash
# Archive events older than 60 days
RAFFLE_EVENTS_RETENTION_DAYS=60 DRY_RUN=false npm run archive:raffle-events

# Process only 10 batches
MAX_BATCH=10 DRY_RUN=false npm run archive:raffle-events

# Larger batches for faster processing
BATCH_SIZE=2000 DRY_RUN=false npm run archive:raffle-events

# Start fresh (ignore checkpoints)
RESUME=false DRY_RUN=false npm run archive:raffle-events
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAFFLE_EVENTS_RETENTION_DAYS` | `30` | Archive events older than N days |
| `BATCH_SIZE` | `500` | Records per batch |
| `MAX_BATCH` | unlimited | Max batches per run |
| `DRY_RUN` | `true` | Simulate without changes |
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

## Safety Checklist

- [ ] Run dry-run first
- [ ] Check disk space
- [ ] Verify retention days
- [ ] Schedule during low-traffic period
- [ ] Monitor progress
- [ ] Backup CSV files after completion

## Key Features

✅ Resumable after interruptions  
✅ Dry-run simulation  
✅ Batch limits  
✅ Transactional safety  
✅ Structured logging  

## Full Documentation

See [ARCHIVE_RAFFLE_EVENTS_GUIDE.md](./ARCHIVE_RAFFLE_EVENTS_GUIDE.md) for complete documentation.
