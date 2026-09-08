# Entity Documentation Implementation Summary

## What Was Built

Comprehensive documentation for all indexer database entities, distinguishing between raw chain state (source-of-truth) and derived query state (computed aggregates).

## Files Created

### 1. `src/database/entities/ENTITY_OWNERSHIP.md`
Main documentation file covering:
- **Raffle Entity**: Field ownership, updater handlers, recalculation safety
- **Ticket Entity**: Idempotency keys, immutable chain state
- **User Entity**: Derived aggregates with recalculation queries
- **RaffleEvent Entity**: Append-only audit trail, archiving guidelines
- **PlatformStat Entity**: Materialized view pattern, daily aggregates
- **IndexerCursor Entity**: Ingestion progress tracking, reorg detection
- **DeadLetterEvent Entity (DLQ)**: Failure handling, retry logic

Each entity section includes:
- Field-by-field ownership table (raw vs derived)
- Updater handler references
- Recalculation safety guidelines
- SQL examples for safe recalculation
- Idempotency key documentation

### 2. Migration Ownership Rules
Guidelines for contributors creating new migrations:
- Raw chain state fields must be populated from events (no defaults)
- Derived fields can use DEFAULT values
- Idempotency keys require unique constraints
- Timestamp usage patterns

## Files Updated

### Entity Files (inline documentation)
All entity files now include:
- Comprehensive class-level JSDoc comments
- Field ownership markers (RAW CHAIN STATE / DERIVED FIELD)
- Updater handler references
- Recalculation safety notes
- Links to main documentation

Updated files:
- `src/database/entities/raffle.entity.ts`
- `src/database/entities/ticket.entity.ts`
- `src/database/entities/user.entity.ts`
- `src/database/entities/raffle-event.entity.ts`
- `src/database/entities/platform-stat.entity.ts`
- `src/database/entities/indexer-cursor.entity.ts`
- `src/database/entities/dead-letter-event.entity.ts`

### README.md
Added "Entity Ownership & Field Documentation" section linking to:
- Main documentation file
- Field ownership concepts
- Updater handler patterns
- Recalculation guidelines
- Migration rules

## Key Concepts Documented

### 1. Field Ownership Categories
- **Raw Chain State**: Immutable source-of-truth from Stellar ledger events
- **Derived State**: Computed aggregates maintained by processors
- **Idempotency Keys**: Special derived fields for replay protection

### 2. Recalculation Safety
Clear guidelines on which fields can be safely recomputed:
- ✅ **Safe**: User stats, raffle ticket counts, platform aggregates
- ❌ **Unsafe**: Chain state, idempotency keys, cursor state
- ⚠️ **Caution**: Fields requiring maintenance windows

### 3. Updater Handler Patterns
Documentation of which processor methods update each field:
- `RaffleProcessor.handleRaffleCreated()`
- `RaffleProcessor.handleRaffleFinalized()`
- `TicketProcessor.handleTicketPurchased()`
- `UserProcessor.handleTicketPurchased()`
- `UserProcessor.handleRaffleFinalized()`

### 4. Idempotency Mechanisms
- Transaction hash uniqueness (`txHash`, `purchaseTxHash`)
- Last transaction tracking (`lastTxHash`)
- Replay guards (`replayedAt`)
- Conditional updates to prevent replays

## Acceptance Criteria Met

✅ **Entity-level comments**: All 7 entities documented with comprehensive JSDoc  
✅ **Derived fields marked**: All derived fields have inline comments with updater references  
✅ **Recalculation safety**: Clear guidelines with SQL examples  
✅ **Linked from README**: New section with prominent link to documentation  
✅ **Migration rules**: Ownership rules documented for new migrations  

## Usage for Contributors

### When Creating Migrations
1. Check `ENTITY_OWNERSHIP.md` § Migration Ownership Rules
2. Identify if new fields are raw chain state or derived
3. Apply appropriate defaults and constraints
4. Document updater handlers

### When Adding Processors
1. Check entity documentation for field ownership
2. Update derived fields atomically
3. Respect idempotency keys
4. Document new updater handlers

### When Debugging Data Issues
1. Check if field is raw chain state (source-of-truth) or derived
2. For derived fields, use recalculation queries from docs
3. Verify idempotency keys haven't been corrupted
4. Check processor handlers for update logic

### When Performing Maintenance
1. Consult recalculation safety guidelines
2. Use provided SQL examples for safe recalculation
3. Be aware of idempotency key implications
4. Plan maintenance windows for unsafe operations

## Next Steps (Optional Enhancements)

1. **Automated Tests**: Add tests verifying derived field calculations match documented queries
2. **Recalculation Scripts**: Create maintenance scripts using documented SQL patterns
3. **Monitoring**: Add alerts for derived field drift from source-of-truth
4. **Migration Linter**: Validate new migrations follow ownership rules

## References

- Main Documentation: `indexer/src/database/entities/ENTITY_OWNERSHIP.md`
- Indexer README: `indexer/README.md` § Entity Ownership & Field Documentation
- Architecture: `docs/ARCHITECTURE.md` § Data Model
- Processors: `indexer/src/processors/`
