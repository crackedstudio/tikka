# Oracle Rescue Module

Manual intervention system for failed oracle jobs.

## Quick Start

```bash
# List failed jobs
npm run oracle:rescue list-failed

# Re-enqueue a job
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason "<reason>"

# Force submit randomness
npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason "<reason>"

# View logs
npm run oracle:rescue logs
```

## Files

- **rescue.module.ts** - NestJS module configuration
- **rescue.service.ts** - Core business logic
- **rescue.controller.ts** - REST API endpoints
- **rescue.cli.ts** - Command-line interface
- **rescue.service.spec.ts** - Unit tests

## Documentation

See parent directory for comprehensive guides:
- `../RESCUE_GUIDE.md` - User guide
- `../ON_CALL_TROUBLESHOOTING.md` - On-call handbook
- `../RESCUE_QUICK_REF.md` - Quick reference

## API Endpoints

- `POST /rescue/re-enqueue` - Re-enqueue failed job
- `POST /rescue/force-submit` - Force submit randomness
- `POST /rescue/force-fail` - Force fail job
- `GET /rescue/failed-jobs` - List failed jobs
- `GET /rescue/jobs` - List all jobs
- `GET /rescue/logs` - View audit logs
- `GET /rescue/logs/:raffleId` - View logs for raffle

## Testing

```bash
npm test src/rescue/rescue.service.spec.ts
```

## Architecture

```
RescueController (API)
        ↓
RescueService (Logic)
        ↓
    ┌───┴────────────────┐
    │                    │
Queue (Redis)    Contract Service
                         │
                 Randomness Services
                         │
                 TxSubmitter Service
```

## Usage Examples

### Re-enqueue
```typescript
await rescueService.reEnqueueJob(
  '12345',
  'alice',
  'RPC timeout, retrying'
);
```

### Force Submit
```typescript
await rescueService.forceSubmit(
  42,
  'req_abc123',
  'bob',
  'All retries exhausted',
  1000 // optional prize amount
);
```

### Force Fail
```typescript
await rescueService.forceFail(
  '12345',
  'alice',
  'Invalid raffle ID'
);
```

## Audit Logging

All operations are logged with:
- Timestamp
- Action (RE_ENQUEUE, FORCE_SUBMIT, FORCE_FAIL)
- Raffle ID and Request ID
- Operator name
- Reason
- Result (SUCCESS/FAILURE)
- Additional details

Access logs via:
```typescript
const logs = rescueService.getRescueLogs(100);
const raffleLogs = rescueService.getRescueLogsByRaffle(42);
```

## Security

- All operations require operator identification
- All operations require reason
- Complete audit trail
- Idempotent operations
- Validation before submission

## Integration

Module is imported in `app.module.ts`:
```typescript
import { RescueModule } from './rescue/rescue.module';

@Module({
  imports: [
    // ...
    RescueModule,
  ],
})
export class AppModule {}
```

CLI script in `package.json`:
```json
{
  "scripts": {
    "oracle:rescue": "ts-node src/rescue/rescue.cli.ts"
  }
}
```
