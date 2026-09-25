import { DataSource, EntityManager, Repository } from "typeorm";
import {
  ArchiveCheckpointEntity,
  ArchiveJobStatus,
} from "../../../database/entities/archive-checkpoint.entity";
import { RaffleEventEntity } from "../../../database/entities/raffle-event.entity";
import { ARCHIVE_JOB_TYPE } from "../types";

/**
 * Test doubles shared by the archive unit specs.
 *
 * Test-only: the `testing` directory is excluded from `nest build` in
 * `tsconfig.build.json`.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The cutoff `archiveOldRaffleEvents` derives from a retention window. */
export function cutoffFor(retentionDays = 30): Date {
  return new Date(Date.now() - retentionDays * DAY_MS);
}

/** A raffle event indexed `daysOld` days ago. */
export function makeEvent(
  id: string,
  daysOld: number,
  raffleId = 1,
): RaffleEventEntity {
  const event = new RaffleEventEntity();
  event.id = id;
  event.raffleId = raffleId;
  event.eventType = "RaffleCreated";
  event.schemaVersion = 1;
  event.ledger = 100;
  event.txHash = `tx-${id}`;
  event.payloadJson = { price: 10, max_tickets: 100 };
  event.indexedAt = new Date(Date.now() - daysOld * DAY_MS);
  return event;
}

/**
 * A checkpoint with `batchNumber > 0` — the state that triggers resume-time
 * integrity verification. Override `integrityHash` to simulate corruption, and
 * leave it null to simulate a legacy pre-migration row.
 */
export function buildCheckpoint(
  overrides: Partial<ArchiveCheckpointEntity> = {},
): ArchiveCheckpointEntity {
  return {
    id: "cp-verify",
    jobType: ARCHIVE_JOB_TYPE,
    lastProcessedTimestamp: null,
    lastProcessedId: null,
    totalArchived: 0,
    batchNumber: 1,
    status: ArchiveJobStatus.IN_PROGRESS,
    configSnapshot: {
      retentionDays: 30,
      batchSize: 10,
      cutoffDate: cutoffFor().toISOString(),
    },
    startedAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    integrityHash: null,
    lastVerifiedAt: null,
    verificationFailureReason: null,
    ...overrides,
  };
}

export interface MockQueryBuilder {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
}

export type MockEventRepo = Repository<RaffleEventEntity> & {
  createQueryBuilder: jest.Mock;
  /** The single builder instance every `createQueryBuilder()` call returns. */
  queryBuilder: MockQueryBuilder;
};

/**
 * Event repository whose query builder yields `batches` in order, then empty
 * results forever (mirroring an exhausted table).
 */
export function createMockEventRepo(
  ...batches: RaffleEventEntity[][]
): MockEventRepo {
  let call = 0;
  const queryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(() => Promise.resolve(batches[call++] ?? [])),
  };

  return {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    queryBuilder,
  } as unknown as MockEventRepo;
}

export type MockCheckpointRepo = Repository<ArchiveCheckpointEntity> & {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

/** Checkpoint repository returning `existing` from `findOne`. */
export function createMockCheckpointRepo(
  options: {
    existing?: ArchiveCheckpointEntity | null;
    createdId?: string;
  } = {},
): MockCheckpointRepo {
  return {
    findOne: jest.fn().mockResolvedValue(options.existing ?? null),
    create: jest.fn((data: Partial<ArchiveCheckpointEntity>) => ({
      ...data,
      id: options.createdId ?? "cp-new",
    })),
    save: jest.fn((entity: ArchiveCheckpointEntity) => Promise.resolve(entity)),
  } as unknown as MockCheckpointRepo;
}

export interface MockEntityManager {
  delete: jest.Mock;
  save: jest.Mock;
}

/** An `EntityManager` double for transactional deletes and checkpoint saves. */
export function createMockEntityManager(): MockEntityManager {
  return {
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
  };
}

export type MockDataSource = DataSource & {
  getRepository: jest.Mock;
  transaction: jest.Mock;
  /** Managers handed to each `transaction()` callback, in call order. */
  transactionManagers: MockEntityManager[];
};

/** DataSource double routing the two entities to the supplied repositories. */
export function createMockDataSource(
  eventRepo: Repository<RaffleEventEntity>,
  checkpointRepo: Repository<ArchiveCheckpointEntity>,
): MockDataSource {
  const transactionManagers: MockEntityManager[] = [];

  return {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === RaffleEventEntity) return eventRepo;
      if (entity === ArchiveCheckpointEntity) return checkpointRepo;
      throw new Error(`Unknown entity: ${String(entity)}`);
    }),
    transaction: jest.fn(
      async (callback: (manager: EntityManager) => Promise<unknown>) => {
        const manager = createMockEntityManager();
        transactionManagers.push(manager);
        return await callback(manager as unknown as EntityManager);
      },
    ),
    transactionManagers,
  } as unknown as MockDataSource;
}
