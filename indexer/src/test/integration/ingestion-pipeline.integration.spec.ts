/**
 * ingestion-pipeline.integration.spec.ts
 *
 * End-to-end integration tests for the full indexer ingestion pipeline:
 *
 *   mock event payload → Processor → TypeORM → PostgreSQL container
 *
 * What is verified:
 *   1. RaffleCreated  → raffle row inserted, user upserted
 *   2. TicketPurchased → tickets inserted, raffle.ticketsSold incremented, user stats updated
 *   3. RaffleFinalized → winner stored on raffle row, user win count / prize updated
 *   4. RaffleCancelled → raffle status = 'cancelled', raffle_events row written
 *   5. TicketRefunded  → ticket.refunded = true
 *   6. Idempotency     → re-processing the same tx hash is a no-op (no duplicate rows)
 *
 * Isolation: each test suite gets a fresh `beforeEach` DB truncation so tests
 * do not depend on one another.
 */

import { DataSource, Repository } from 'typeorm';
import { RaffleProcessor } from '../../processors/raffle.processor';
import { TicketProcessor } from '../../processors/ticket.processor';
import { UserProcessor } from '../../processors/user.processor';
import { RaffleEntity, RaffleStatus } from '../../database/entities/raffle.entity';
import { TicketEntity } from '../../database/entities/ticket.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { RaffleEventEntity } from '../../database/entities/raffle-event.entity';
import {
  startDb,
  stopDb,
  DbContainerContext,
  CONTAINER_STARTUP_MS,
} from './helpers/db-container';
import {
  CREATOR_ADDRESS,
  BUYER_ADDRESS,
  BUYER2_ADDRESS,
  makeRaffleCreated,
  makeTicketPurchased,
  makeRaffleFinalized,
  makeRaffleCancelled,
  makeTicketRefunded,
  mockTxHash,
} from './helpers/mock-events';

// ─── Shared mock services ─────────────────────────────────────────────────────

/** CacheService stub — integration tests focus on DB state, not cache. */
const mockCacheService = {
  invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
  invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
  invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
  invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
  invalidatePlatformStats: jest.fn().mockResolvedValue(undefined),
};

/** WebhookService stub — integration tests focus on DB state, not webhooks. */
const mockWebhookService = {
  dispatch: jest.fn().mockResolvedValue(undefined),
};

// ─── Test context ─────────────────────────────────────────────────────────────

let ctx: DbContainerContext;
let ds: DataSource;

let raffleRepo: Repository<RaffleEntity>;
let ticketRepo: Repository<TicketEntity>;
let userRepo: Repository<UserEntity>;
let eventRepo: Repository<RaffleEventEntity>;

let raffleProcessor: RaffleProcessor;
let ticketProcessor: TicketProcessor;
let userProcessor: UserProcessor;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Seeds a RaffleEntity row directly so processors that need one can find it. */
async function seedRaffle(partial: Partial<RaffleEntity> = {}): Promise<void> {
  const f = makeRaffleCreated();
  await raffleRepo.save(
    raffleRepo.create({
      id: f.raffleId,
      creator: f.creator,
      ticketPrice: f.ticketPrice,
      maxTickets: f.maxTickets,
      asset: f.asset,
      endTime: f.endTime,
      createdLedger: f.createdLedger,
      status: RaffleStatus.OPEN,
      ...partial,
    }),
  );
}

/** Removes all rows from tables to give each test a clean slate. */
async function truncateAll(): Promise<void> {
  await ds.query(`SET session_replication_role = 'replica'`);
  await ds.query(`TRUNCATE TABLE raffle_events, tickets, users, raffles RESTART IDENTITY CASCADE`);
  await ds.query(`SET session_replication_role = 'origin'`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx = await startDb();
  ds = ctx.dataSource;

  raffleRepo = ds.getRepository(RaffleEntity);
  ticketRepo = ds.getRepository(TicketEntity);
  userRepo   = ds.getRepository(UserEntity);
  eventRepo  = ds.getRepository(RaffleEventEntity);

  userProcessor   = new UserProcessor(ds, mockCacheService as any);
  raffleProcessor = new RaffleProcessor(ds, mockCacheService as any, userProcessor, mockWebhookService as any);
  ticketProcessor = new TicketProcessor(mockCacheService as any, userProcessor, mockWebhookService as any);
}, CONTAINER_STARTUP_MS);

afterAll(async () => stopDb(ctx));

beforeEach(async () => {
  jest.clearAllMocks();
  await truncateAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * handleRaffleCreated returns an uncommitted QueryRunner — caller must
 * commit + release to persist the data.
 */
async function commitRaffleCreated(...args: Parameters<RaffleProcessor['handleRaffleCreated']>): Promise<void> {
  const runner = await raffleProcessor.handleRaffleCreated(...args);
  await runner.commitTransaction();
  await runner.release();
}

describe('RaffleCreated → DB', () => {
  it('upserts the creator into the users table', async () => {
    const f = makeRaffleCreated({ createdLedger: 500 });
    await commitRaffleCreated(f.raffleId, f.creator, f.createdLedger, f.txHash, {
      ticket_price: f.ticketPrice,
      max_tickets: f.maxTickets,
      end_time: Number(f.endTime),
      asset: f.asset,
      metadata_cid: f.metadataCid ?? '',
      allow_multiple: true,
    });

    const user = await userRepo.findOneBy({ address: CREATOR_ADDRESS });
    expect(user).not.toBeNull();
    expect(user!.firstSeenLedger).toBe(500);
  });

  it('uses the minimum ledger when the creator appears multiple times', async () => {
    const f = makeRaffleCreated();
    await commitRaffleCreated(1, CREATOR_ADDRESS, 500, f.txHash, {
      ticket_price: f.ticketPrice,
      max_tickets: f.maxTickets,
      end_time: Number(f.endTime),
      asset: f.asset,
      metadata_cid: '',
      allow_multiple: true,
    });
    const f2 = makeRaffleCreated({ raffleId: 2, txHash: mockTxHash(2) });
    await commitRaffleCreated(2, CREATOR_ADDRESS, 300, f2.txHash, {
      ticket_price: f2.ticketPrice,
      max_tickets: f2.maxTickets,
      end_time: Number(f2.endTime),
      asset: f2.asset,
      metadata_cid: '',
      allow_multiple: true,
    });

    const user = await userRepo.findOneBy({ address: CREATOR_ADDRESS });
    expect(user!.firstSeenLedger).toBe(300);
  });

  it('invalidates the active-raffles cache after processing', async () => {
    const f = makeRaffleCreated({ createdLedger: 500 });
    await commitRaffleCreated(1, CREATOR_ADDRESS, 500, f.txHash, {
      ticket_price: f.ticketPrice,
      max_tickets: f.maxTickets,
      end_time: Number(f.endTime),
      asset: f.asset,
      metadata_cid: '',
      allow_multiple: true,
    });
    expect(mockCacheService.invalidateActiveRaffles).toHaveBeenCalled();
  });
});

describe('TicketPurchased → DB', () => {
  beforeEach(() => seedRaffle());

  it('inserts all ticket rows for the buyer', async () => {
    const f = makeTicketPurchased({ ticketIds: [10, 11, 12], ledger: 600 });
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash, qr,
    );
    await qr.commitTransaction();
    await qr.release();

    const tickets = await ticketRepo.findBy({ raffleId: 1 });
    expect(tickets).toHaveLength(3);
    expect(tickets.map((t) => t.id).sort()).toEqual([10, 11, 12]);
    expect(tickets[0].owner).toBe(BUYER_ADDRESS);
    expect(tickets[0].refunded).toBe(false);
  });

  it('increments raffle.ticketsSold by the number of purchased tickets', async () => {
    const f = makeTicketPurchased({ ticketIds: [1, 2] });
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash, qr,
    );
    await qr.commitTransaction();
    await qr.release();

    const raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.ticketsSold).toBe(2);
  });

  it('accumulates ticketsSold across multiple purchases', async () => {
    const tx1 = mockTxHash(100);
    const tx2 = mockTxHash(101);

    const qr1 = ds.createQueryRunner();
    await qr1.connect();
    await qr1.startTransaction();
    await ticketProcessor.handleTicketPurchased(1, BUYER_ADDRESS, [1, 2], '0', 600, tx1, qr1);
    await qr1.commitTransaction();
    await qr1.release();

    const qr2 = ds.createQueryRunner();
    await qr2.connect();
    await qr2.startTransaction();
    await ticketProcessor.handleTicketPurchased(1, BUYER2_ADDRESS, [3], '0', 601, tx2, qr2);
    await qr2.commitTransaction();
    await qr2.release();

    const raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.ticketsSold).toBe(3);
  });

  it('upserts the buyer into the users table with correct stats', async () => {
    const f = makeTicketPurchased({ ticketIds: [1, 2, 3], ledger: 600 });
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash, qr,
    );
    await qr.commitTransaction();
    await qr.release();

    const user = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(user).not.toBeNull();
    expect(user!.totalTicketsBought).toBe(3);
    expect(user!.totalRafflesEntered).toBe(1);
  });

  it('is idempotent — re-processing the same tx hash does not insert duplicate tickets', async () => {
    const f = makeTicketPurchased({ ticketIds: [1, 2] });

    const qr1 = ds.createQueryRunner();
    await qr1.connect();
    await qr1.startTransaction();
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash, qr1,
    );
    await qr1.commitTransaction();
    await qr1.release();

    // Second call with same tx hash
    const qr2 = ds.createQueryRunner();
    await qr2.connect();
    await qr2.startTransaction();
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash, qr2,
    );
    await qr2.commitTransaction();
    await qr2.release();

    const tickets = await ticketRepo.findBy({ raffleId: 1 });
    expect(tickets).toHaveLength(2); // not 4
  });
});

async function commitRaffleCancelled(...args: Parameters<RaffleProcessor['handleRaffleCancelled']>): Promise<void> {
  const runner = await raffleProcessor.handleRaffleCancelled(...args);
  await runner.commitTransaction();
  await runner.release();
}

describe('RaffleCancelled → DB', () => {
  beforeEach(() => seedRaffle());

  it('sets raffle status to CANCELLED and records a raffle_events row', async () => {
    const f = makeRaffleCancelled({ ledger: 700 });
    await commitRaffleCancelled(f.raffleId, f.reason, f.ledger, f.txHash);

    const raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.status).toBe(RaffleStatus.CANCELLED);
    expect(raffle!.finalizedLedger).toBe(700);

    const events = await eventRepo.findBy({ raffleId: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('RaffleCancelled');
    expect(events[0].payloadJson).toMatchObject({ reason: f.reason });
  });

  it('is idempotent — re-processing the same cancellation tx is a no-op', async () => {
    const f = makeRaffleCancelled();
    await commitRaffleCancelled(f.raffleId, f.reason, f.ledger, f.txHash);
    await commitRaffleCancelled(f.raffleId, f.reason, f.ledger, f.txHash);

    const events = await eventRepo.findBy({ raffleId: 1 });
    expect(events).toHaveLength(1); // orIgnore() prevents duplicate
  });
});

async function commitRaffleFinalized(...args: Parameters<RaffleProcessor['handleRaffleFinalized']>): Promise<void> {
  const runner = await raffleProcessor.handleRaffleFinalized(...args);
  await runner.commitTransaction();
  await runner.release();
}

describe('RaffleFinalized → DB', () => {
  beforeEach(async () => {
    await seedRaffle({ status: RaffleStatus.DRAWING });
    // Seed the winner's user row so the user processor can find them
    await userRepo.save(
      userRepo.create({ address: BUYER_ADDRESS, firstSeenLedger: 600 }),
    );
    // Finalize the raffle in the DB
    await raffleRepo.update(1, { winner: BUYER_ADDRESS, prizeAmount: '100000000' });
  });

  it('updates user win count and total prize', async () => {
    const f = makeRaffleFinalized({ winner: BUYER_ADDRESS, prizeAmount: '100000000' });
    await commitRaffleFinalized(
      f.raffleId, f.winner, 1, f.prizeAmount, 800, mockTxHash(50),
    );

    const user = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(user!.totalRafflesWon).toBe(1);
    expect(user!.totalPrizeXlm).toBe('100000000');
  });

  it('invalidates leaderboard cache after finalizing', async () => {
    const f = makeRaffleFinalized();
    await commitRaffleFinalized(
      f.raffleId, f.winner, 1, f.prizeAmount, 800, mockTxHash(51),
    );
    expect(mockCacheService.invalidateLeaderboard).toHaveBeenCalled();
  });
});

describe('TicketRefunded → DB', () => {
  beforeEach(async () => {
    await seedRaffle({ status: RaffleStatus.CANCELLED });
    // Seed buyer user and ticket
    await userRepo.save(userRepo.create({ address: BUYER_ADDRESS, firstSeenLedger: 600 }));

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await ticketRepo.save(
      ticketRepo.create({
        id: 1,
        raffleId: 1,
        owner: BUYER_ADDRESS,
        purchasedAtLedger: 600,
        purchaseTxHash: mockTxHash(2),
        refunded: false,
      }),
    );
    await qr.commitTransaction();
    await qr.release();
  });

  it('marks the ticket as refunded', async () => {
    const f = makeTicketRefunded({ ticketId: 1, txHash: mockTxHash(50) });
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await ticketProcessor.handleTicketRefunded(
      f.raffleId, f.ticketId, f.recipient, f.amount, f.txHash, qr,
    );
    await qr.commitTransaction();
    await qr.release();

    const ticket = await ticketRepo.findOneBy({ id: 1 });
    expect(ticket!.refunded).toBe(true);
    expect(ticket!.refundTxHash).toBe(mockTxHash(50));
  });

  it('does not affect other tickets in the same raffle', async () => {
    // Insert a second ticket
    await ticketRepo.save(
      ticketRepo.create({
        id: 2,
        raffleId: 1,
        owner: BUYER_ADDRESS,
        purchasedAtLedger: 600,
        purchaseTxHash: mockTxHash(3),
        refunded: false,
      }),
    );

    const f = makeTicketRefunded({ ticketId: 1 });
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await ticketProcessor.handleTicketRefunded(
      f.raffleId, f.ticketId, f.recipient, f.amount, f.txHash, qr,
    );
    await qr.commitTransaction();
    await qr.release();

    const ticket2 = await ticketRepo.findOneBy({ id: 2 });
    expect(ticket2!.refunded).toBe(false);
  });
});

describe('Full lifecycle: Created → Purchased → Finalized', () => {
  it('correctly reflects end-to-end state in the DB', async () => {
    // 1. Raffle created
    await seedRaffle({ status: RaffleStatus.OPEN });
    const fCreated = makeRaffleCreated({ createdLedger: 1000 });
    await commitRaffleCreated(1, CREATOR_ADDRESS, 1000, fCreated.txHash, {
      ticket_price: fCreated.ticketPrice,
      max_tickets: fCreated.maxTickets,
      end_time: Number(fCreated.endTime),
      asset: fCreated.asset,
      metadata_cid: '',
      allow_multiple: true,
    });

    // 2. Two buyers each buy tickets
    const tx100 = mockTxHash(100);
    const tx101 = mockTxHash(101);

    const qr1 = ds.createQueryRunner();
    await qr1.connect();
    await qr1.startTransaction();
    await ticketProcessor.handleTicketPurchased(1, BUYER_ADDRESS, [1, 2], '20000000', 1010, tx100, qr1);
    await qr1.commitTransaction();
    await qr1.release();

    const qr2 = ds.createQueryRunner();
    await qr2.connect();
    await qr2.startTransaction();
    await ticketProcessor.handleTicketPurchased(1, BUYER2_ADDRESS, [3], '10000000', 1011, tx101, qr2);
    await qr2.commitTransaction();
    await qr2.release();

    let raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.ticketsSold).toBe(3);

    const buyer1 = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(buyer1!.totalTicketsBought).toBe(2);

    // 3. Finalize: BUYER_ADDRESS wins
    await raffleRepo.update(1, { winner: BUYER_ADDRESS, prizeAmount: '50000000', status: RaffleStatus.DRAWING });
    await commitRaffleFinalized(1, BUYER_ADDRESS, 1, '50000000', 1020, mockTxHash(60));

    const winner = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(winner!.totalRafflesWon).toBe(1);
    expect(winner!.totalPrizeXlm).toBe('50000000');

    // 4. Verify cache invalidations occurred
    expect(mockCacheService.invalidateLeaderboard).toHaveBeenCalled();
  });
});
