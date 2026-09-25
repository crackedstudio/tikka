import { EntityManager, In, Repository } from "typeorm";
import { RaffleEventEntity } from "../../database/entities/raffle-event.entity";

/**
 * Row selection and deletion for archivable `raffle_events`.
 *
 * Pagination is cursor-based on `(indexedAt, id)` — the same tuple persisted on
 * the checkpoint — so an interrupted run resumes without re-reading or skipping
 * rows, even when many events share a timestamp.
 */

export interface BatchSelection {
  /** Only rows with `indexedAt < cutoff` are archivable. */
  cutoff: Date;
  batchSize: number;
  /** Cursor from the checkpoint; null on a fresh run. */
  lastProcessedTimestamp: Date | null;
  /** Tie-breaker for rows sharing `lastProcessedTimestamp`. */
  lastProcessedId: string | null;
}

/**
 * Query the next batch of events to archive, resuming from the cursor when the
 * checkpoint provides one.
 */
export async function selectNextBatch(
  eventRepo: Repository<RaffleEventEntity>,
  selection: BatchSelection,
): Promise<RaffleEventEntity[]> {
  const queryBuilder = eventRepo
    .createQueryBuilder("event")
    .where("event.indexedAt < :cutoff", { cutoff: selection.cutoff })
    .orderBy("event.indexedAt", "ASC")
    .addOrderBy("event.id", "ASC")
    .take(selection.batchSize);

  // Resume from checkpoint if available
  if (selection.lastProcessedTimestamp && selection.lastProcessedId) {
    queryBuilder.andWhere(
      "(event.indexedAt > :lastTimestamp OR (event.indexedAt = :lastTimestamp AND event.id > :lastId))",
      {
        lastTimestamp: selection.lastProcessedTimestamp,
        lastId: selection.lastProcessedId,
      },
    );
  }

  return await queryBuilder.getMany();
}

/**
 * Delete an already-written batch from `raffle_events`.
 *
 * Takes an `EntityManager` (not a repository) because the delete must commit in
 * the same transaction as the checkpoint cursor update.
 */
export async function deleteArchivedRows(
  manager: EntityManager,
  rows: RaffleEventEntity[],
): Promise<void> {
  const ids = rows.map((row) => row.id);
  await manager.delete(RaffleEventEntity, { id: In(ids) } as any);
}
