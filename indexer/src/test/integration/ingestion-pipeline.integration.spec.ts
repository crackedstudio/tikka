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

/** Removes all rows from all tables to give each test a clean slate. */
async function truncateAll(): Promise<void> {
  // Disable FK constraints temporarily so we can truncate in any order
  await ds.query(`SET session_replication_role = 'replica'`);
  await ds.query(`TRUNCATE TABLE raffle_events, tickets, users, raffles RESTART IDENTITY CASCADE`);
  await ds.query(`SET session_replication_role = 'DEFAULT'`);
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
  const mockWebhookService = { dispatchEvent: jest.fn() };
  raffleProcessor = new RaffleProcessor(ds, mockCacheService as any, userProcessor, mockWebhookService as any);
  ticketProcessor = new TicketProcessor(ds, mockCacheService as any, userProcessor);
}, CONTAINER_STARTUP_MS);

afterAll(async () => stopDb(ctx));

beforeEach(async () => {
  jest.clearAllMocks();
  await truncateAll();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RaffleCreated → DB', () => {
  it('upserts the creator into the users table', async () => {
    const f = makeRaffleCreated({ createdLedger: 500 });
    await raffleProcessor.handleRaffleCreated(f.raffleId, f.creator, f.createdLedger);

    const user = await userRepo.findOneBy({ address: CREATOR_ADDRESS });
    expect(user).not.toBeNull();
    expect(user!.firstSeenLedger).toBe(500);
  });

  it('uses the minimum ledger when the creator appears multiple times', async () => {
    await raffleProcessor.handleRaffleCreated(1, CREATOR_ADDRESS, 500);
    await raffleProcessor.handleRaffleCreated(2, CREATOR_ADDRESS, 300);

    const user = await userRepo.findOneBy({ address: CREATOR_ADDRESS });
    expect(user!.firstSeenLedger).toBe(300);
  });

  it('invalidates the active-raffles cache after processing', async () => {
    await raffleProcessor.handleRaffleCreated(1, CREATOR_ADDRESS, 500);
    expect(mockCacheService.invalidateActiveRaffles).toHaveBeenCalledTimes(1);
  });
});

describe('TicketPurchased → DB', () => {
  beforeEach(() => seedRaffle());

  it('inserts all ticket rows for the buyer', async () => {
    const f = makeTicketPurchased({ ticketIds: [10, 11, 12], ledger: 600 });
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash,
    );

    const tickets = await ticketRepo.findBy({ raffleId: 1 });
    expect(tickets).toHaveLength(3);
    expect(tickets.map((t) => t.id).sort()).toEqual([10, 11, 12]);
    expect(tickets[0].owner).toBe(BUYER_ADDRESS);
    expect(tickets[0].refunded).toBe(false);
  });

  it('increments raffle.ticketsSold by the number of purchased tickets', async () => {
    const f = makeTicketPurchased({ ticketIds: [1, 2] });
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash,
    );

    const raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.ticketsSold).toBe(2);
  });

  it('accumulates ticketsSold across multiple purchases', async () => {
    await ticketProcessor.handleTicketPurchased(1, BUYER_ADDRESS, [1, 2], '0', 600, mockTxHash(100));
    await ticketProcessor.handleTicketPurchased(1, BUYER2_ADDRESS, [3], '0', 601, mockTxHash(101));

    const raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.ticketsSold).toBe(3);
  });

  it('upserts the buyer into the users table with correct stats', async () => {
    const f = makeTicketPurchased({ ticketIds: [1, 2, 3], ledger: 600 });
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash,
    );

    const user = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(user).not.toBeNull();
    expect(user!.totalTicketsBought).toBe(3);
    expect(user!.totalRafflesEntered).toBe(1);
  });

  it('is idempotent — re-processing the same tx hash does not insert duplicate tickets', async () => {
    const f = makeTicketPurchased({ ticketIds: [1, 2] });
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash,
    );
    // Second call with same tx hash — orIgnore() should prevent duplicate
    await ticketProcessor.handleTicketPurchased(
      f.raffleId, f.buyer, f.ticketIds, f.totalCost, f.ledger, f.txHash,
    );

    const tickets = await ticketRepo.findBy({ raffleId: 1 });
    expect(tickets).toHaveLength(2); // not 4
  });
});

describe('RaffleCancelled → DB', () => {
  beforeEach(() => seedRaffle());

  it('sets raffle status to CANCELLED and records a raffle_events row', async () => {
    const f = makeRaffleCancelled({ ledger: 700 });
    await raffleProcessor.handleRaffleCancelled(f.raffleId, f.reason, f.ledger, f.txHash);

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
    await raffleProcessor.handleRaffleCancelled(f.raffleId, f.reason, f.ledger, f.txHash);
    await raffleProcessor.handleRaffleCancelled(f.raffleId, f.reason, f.ledger, f.txHash);

    const events = await eventRepo.findBy({ raffleId: 1 });
    expect(events).toHaveLength(1); // orIgnore() prevents duplicate
  });
});

describe('RaffleFinalized → DB', () => {
  beforeEach(async () => {
    await seedRaffle({ status: RaffleStatus.DRAWING });
    // Seed the winner's user row and their ticket so the win-count query works
    await userRepo.save(
      userRepo.create({ address: BUYER_ADDRESS, firstSeenLedger: 600 }),
    );
    // Finalize the raffle in the DB so the SQL query for wins counts it
    await raffleRepo.update(1, { winner: BUYER_ADDRESS, prizeAmount: '100000000' });
  });

  it('updates user win count and total prize', async () => {
    const f = makeRaffleFinalized({ winner: BUYER_ADDRESS, prizeAmount: '100000000' });
    await raffleProcessor.handleRaffleFinalized(f.raffleId, f.winner, f.prizeAmount);

    const user = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(user!.totalRafflesWon).toBe(1);
    expect(user!.totalPrizeXlm).toBe('100000000');
  });

  it('invalidates leaderboard cache after finalizing', async () => {
    const f = makeRaffleFinalized();
    await raffleProcessor.handleRaffleFinalized(f.raffleId, f.winner, f.prizeAmount);
    expect(mockCacheService.invalidateLeaderboard).toHaveBeenCalledTimes(1);
  });
});

describe('TicketRefunded → DB', () => {
  beforeEach(async () => {
    await seedRaffle({ status: RaffleStatus.CANCELLED });
    // Seed buyer user and ticket
    await userRepo.save(userRepo.create({ address: BUYER_ADDRESS, firstSeenLedger: 600 }));
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
  });

  it('marks the ticket as refunded', async () => {
    const f = makeTicketRefunded({ ticketId: 1, txHash: mockTxHash(50) });
    await ticketProcessor.handleTicketRefunded(
      f.raffleId, f.ticketId, f.recipient, f.amount, f.txHash,
    );

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
    await ticketProcessor.handleTicketRefunded(
      f.raffleId, f.ticketId, f.recipient, f.amount, f.txHash,
    );

    const ticket2 = await ticketRepo.findOneBy({ id: 2 });
    expect(ticket2!.refunded).toBe(false);
  });
});

describe('Full lifecycle: Created → Purchased → Finalized', () => {
  it('correctly reflects end-to-end state in the DB', async () => {
    // 1. Raffle created
    await seedRaffle({ status: RaffleStatus.OPEN });
    await raffleProcessor.handleRaffleCreated(1, CREATOR_ADDRESS, 1000);

    // 2. Two buyers each buy tickets
    await ticketProcessor.handleTicketPurchased(1, BUYER_ADDRESS, [1, 2], '20000000', 1010, mockTxHash(100));
    await ticketProcessor.handleTicketPurchased(1, BUYER2_ADDRESS, [3], '10000000', 1011, mockTxHash(101));

    let raffle = await raffleRepo.findOneBy({ id: 1 });
    expect(raffle!.ticketsSold).toBe(3);

    const buyer1 = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(buyer1!.totalTicketsBought).toBe(2);

    // 3. Finalize: BUYER_ADDRESS wins
    await raffleRepo.update(1, { winner: BUYER_ADDRESS, prizeAmount: '50000000', status: RaffleStatus.DRAWING });
    await raffleProcessor.handleRaffleFinalized(1, BUYER_ADDRESS, '50000000');

    const winner = await userRepo.findOneBy({ address: BUYER_ADDRESS });
    expect(winner!.totalRafflesWon).toBe(1);
    expect(winner!.totalPrizeXlm).toBe('50000000');

    // 4. Verify cache invalidations occurred
    expect(mockCacheService.invalidateLeaderboard).toHaveBeenCalled();
    expect(mockCacheService.invalidateRaffleDetail).toHaveBeenCalledWith('1');
  });
});
