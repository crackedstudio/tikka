// @ts-nocheck
/**
 * Duplicate-delivery idempotency tests for every default event handler.
 *
 * Chain reorgs / at-least-once delivery can deliver the same event twice.
 * Processing twice must leave the same durable state as processing once.
 */
import { nativeToScVal } from "@stellar/stellar-sdk";
import { IngestionDispatcherService } from "../ingestion-dispatcher.service";
import { RaffleCreatedHandler } from "./raffle-created.handler";
import { TicketPurchasedHandler } from "./ticket-purchased.handler";
import { RaffleFinalizedHandler } from "./raffle-finalized.handler";
import { RaffleCancelledHandler } from "./raffle-cancelled.handler";
import {
  DrawTriggeredHandler,
  RandomnessRequestedHandler,
  RandomnessReceivedHandler,
  TicketRefundedHandler,
  ContractPausedHandler,
  ContractUnpausedHandler,
  AdminTransferProposedHandler,
  AdminTransferAcceptedHandler,
} from "./all-handlers";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { UserProcessor } from "../../processors/user.processor";
import { TicketProcessor } from "../../processors/ticket.processor";
import { RaffleProcessor } from "../../processors/raffle.processor";
import { AdminProcessor } from "../../processors/admin.processor";
import { TicketEntity } from "../../database/entities/ticket.entity";
import { RaffleEntity, RaffleStatus } from "../../database/entities/raffle.entity";
import { RaffleEventEntity } from "../../database/entities/raffle-event.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { PlatformStateEntity } from "../../database/entities/platform-state.entity";
import {
  makeRawIngestionEvent,
  makeRaffleCreatedEvent,
  makeTicketPurchasedEvent,
  makeRaffleFinalizedEvent,
  makeRaffleCancelledEvent,
  makeTicketRefundedEvent,
  CREATOR_ADDRESS,
  BUYER_ADDRESS,
  mockTxHash,
} from "../../test/integration/helpers/mock-events";

/** Snapshot of durable state the handlers/processors may mutate. */
interface DurableState {
  raffles: Array<Partial<RaffleEntity>>;
  tickets: Array<Partial<TicketEntity>>;
  users: Array<Partial<UserEntity>>;
  events: Array<Partial<RaffleEventEntity>>;
  platform: Partial<PlatformStateEntity> | null;
}

function snapshotState(state: DurableState): string {
  return JSON.stringify(state, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function cloneState(state: DurableState): DurableState {
  return JSON.parse(JSON.stringify(state)) as DurableState;
}

/**
 * In-memory QueryRunner / DataSource stand-in that exercises the real
 * processor SQL shapes (insert/update/orIgnore/getExists) against Maps.
 */
function createInMemoryDb(initial: DurableState) {
  const state = cloneState(initial);

  const manager = {
    createQueryBuilder: jest.fn((entityOrVoid?: unknown, _alias?: string) => {
      // Select builder: createQueryBuilder(TicketEntity, "t")
      if (entityOrVoid === TicketEntity) {
        let whereTx: string | undefined;
        return {
          where: jest.fn((clause: string, params: { txHash: string }) => {
            if (clause.includes("purchase_tx_hash")) {
              whereTx = params.txHash;
            }
            return {
              getExists: jest.fn(async () =>
                state.tickets.some((t) => t.purchaseTxHash === whereTx),
              ),
            };
          }),
        };
      }

      // Insert / update builder chain
      const ctx: {
        op?: "insert" | "update";
        into?: unknown;
        values?: Record<string, unknown>;
        set?: Record<string, unknown>;
        where?: { sql: string; params: Record<string, unknown> };
        orIgnore?: boolean;
      } = {};

      const builder: Record<string, jest.Mock> = {};
      builder.insert = jest.fn(() => {
        ctx.op = "insert";
        return builder;
      });
      builder.update = jest.fn((entity: unknown) => {
        ctx.op = "update";
        ctx.into = entity;
        return builder;
      });
      builder.into = jest.fn((entity: unknown) => {
        ctx.into = entity;
        return builder;
      });
      builder.values = jest.fn((values: Record<string, unknown>) => {
        ctx.values = values;
        return builder;
      });
      builder.set = jest.fn((set: Record<string, unknown>) => {
        ctx.set = set;
        return builder;
      });
      builder.where = jest.fn((sql: string, params: Record<string, unknown>) => {
        ctx.where = { sql, params };
        return builder;
      });
      builder.orIgnore = jest.fn(() => {
        ctx.orIgnore = true;
        return builder;
      });
      builder.execute = jest.fn(async () => {
        if (ctx.op === "insert" && ctx.into === TicketEntity && ctx.values) {
          const row = ctx.values as Partial<TicketEntity>;
          const exists = state.tickets.some((t) => t.id === row.id);
          if (!exists || !ctx.orIgnore) {
            if (!exists) state.tickets.push({ ...row, refunded: false });
          }
          return { identifiers: exists ? [] : [{}], raw: { rowCount: exists ? 0 : 1 } };
        }

        if (ctx.op === "insert" && ctx.into === RaffleEntity && ctx.values) {
          const row = ctx.values as Partial<RaffleEntity>;
          const exists = state.raffles.some((r) => r.id === row.id);
          if (!exists) {
            state.raffles.push({
              ...row,
              ticketsSold: 0,
            });
          }
          return { identifiers: exists ? [] : [{}], raw: { rowCount: exists ? 0 : 1 } };
        }

        if (ctx.op === "insert" && ctx.into === RaffleEventEntity && ctx.values) {
          const row = ctx.values as Partial<RaffleEventEntity>;
          const exists = state.events.some((e) => e.txHash === row.txHash);
          if (!exists) state.events.push({ ...row });
          return { identifiers: exists ? [] : [{}], raw: { rowCount: exists ? 0 : 1 } };
        }

        if (ctx.op === "insert" && ctx.into === UserEntity && ctx.values) {
          const row = ctx.values as Partial<UserEntity>;
          const exists = state.users.some((u) => u.address === row.address);
          if (!exists) {
            state.users.push({
              ...row,
              totalTicketsBought: 0,
              totalRafflesEntered: 0,
              totalRafflesWon: 0,
              totalPrizeXlm: "0",
            });
          }
          return { identifiers: exists ? [] : [{}], raw: { rowCount: exists ? 0 : 1 } };
        }

        if (ctx.op === "update" && ctx.into === RaffleEntity && ctx.set) {
          const id = ctx.where?.params.raffleId as number | undefined;
          const raffle = state.raffles.find((r) => r.id === id);
          if (!raffle) return { affected: 0 };

          if (ctx.set.ticketsSold) {
            const fn = ctx.set.ticketsSold as () => string;
            const expr = fn();
            const match = /tickets_sold \+ (\d+)/.exec(expr);
            raffle.ticketsSold = (raffle.ticketsSold ?? 0) + Number(match?.[1] ?? 0);
          }
          if (ctx.set.status !== undefined) {
            const status = ctx.set.status as RaffleStatus;
            const blocked =
              (ctx.where?.sql.includes("status != :finalized") &&
                raffle.status === RaffleStatus.FINALIZED) ||
              (ctx.where?.sql.includes("status != :cancelled") &&
                raffle.status === RaffleStatus.CANCELLED);
            if (!blocked) {
              raffle.status = status;
              if (ctx.set.winner !== undefined) raffle.winner = ctx.set.winner as string;
              if (ctx.set.winningTicketId !== undefined) {
                raffle.winningTicketId = ctx.set.winningTicketId as number;
              }
              if (ctx.set.prizeAmount !== undefined) {
                raffle.prizeAmount = ctx.set.prizeAmount as string;
              }
              if (ctx.set.finalizedLedger !== undefined) {
                raffle.finalizedLedger = ctx.set.finalizedLedger as number;
              }
            }
          }
          return { affected: 1 };
        }

        if (ctx.op === "update" && ctx.into === TicketEntity && ctx.set) {
          const ticketId = ctx.where?.params.ticketId as number;
          const raffleId = ctx.where?.params.raffleId as number;
          const ticket = state.tickets.find(
            (t) => t.id === ticketId && t.raffleId === raffleId,
          );
          if (!ticket) return { affected: 0 };
          if (ctx.where?.sql.includes("refunded = false") && ticket.refunded) {
            return { affected: 0 };
          }
          ticket.refunded = true;
          ticket.refundTxHash = ctx.set.refundTxHash as string;
          return { affected: 1 };
        }

        if (ctx.op === "update" && ctx.into === UserEntity && ctx.set) {
          const address =
            (ctx.where?.params.buyer as string) ||
            (ctx.where?.params.winner as string) ||
            (ctx.where?.params.creator as string);
          const user = state.users.find((u) => u.address === address);
          if (!user) return { affected: 0 };
          if (ctx.set.lastTxHash !== undefined) {
            user.lastTxHash = ctx.set.lastTxHash as string;
          }
          if (ctx.set.totalTicketsBought) {
            const fn = ctx.set.totalTicketsBought as () => string;
            const match = /total_tickets_bought \+ (\d+)/.exec(fn());
            user.totalTicketsBought =
              (user.totalTicketsBought ?? 0) + Number(match?.[1] ?? 0);
          }
          if (ctx.set.totalRafflesEntered) {
            const fn = ctx.set.totalRafflesEntered as () => string;
            if (fn().includes("+ 1")) {
              user.totalRafflesEntered = (user.totalRafflesEntered ?? 0) + 1;
            }
          }
          if (ctx.set.totalRafflesWon) {
            user.totalRafflesWon = (user.totalRafflesWon ?? 0) + 1;
          }
          if (ctx.set.totalPrizeXlm) {
            const fn = ctx.set.totalPrizeXlm as () => string;
            const match = /\+ (\d+)/.exec(fn());
            const add = BigInt(match?.[1] ?? "0");
            user.totalPrizeXlm = (
              BigInt(user.totalPrizeXlm ?? "0") + add
            ).toString();
          }
          return { affected: 1 };
        }

        if (ctx.op === "update" && ctx.into === PlatformStateEntity && ctx.set) {
          state.platform = { ...(state.platform ?? { id: "global" }), ...ctx.set };
          return { affected: 1 };
        }

        return { affected: 0, identifiers: [], raw: { rowCount: 0 } };
      });

      return builder;
    }),
    findOne: jest.fn(async (entity: unknown, opts: { where: Record<string, unknown>; select?: string[] }) => {
      if (entity === UserEntity) {
        const address = opts.where.address as string;
        const user = state.users.find((u) => u.address === address);
        return user ?? null;
      }
      return null;
    }),
  };

  const runner = {
    manager,
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      // UserProcessor: prior ticket in raffle check
      if (sql.includes("FROM tickets") && sql.includes("purchase_tx_hash !=")) {
        const [owner, raffleId, txHash] = params as [string, number, string];
        const prior = state.tickets.filter(
          (t) =>
            t.owner === owner &&
            t.raffleId === raffleId &&
            t.purchaseTxHash !== txHash,
        );
        return prior.length > 0 ? [{ "?column?": 1 }] : [];
      }
      return [];
    }),
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };

  const dataSource = {
    createQueryRunner: jest.fn(() => runner),
  };

  return { state, dataSource, runner, manager };
}

const noopCache = {
  invalidateActiveRaffles: jest.fn().mockResolvedValue(undefined),
  invalidateRaffleDetail: jest.fn().mockResolvedValue(undefined),
  invalidateUserProfile: jest.fn().mockResolvedValue(undefined),
  invalidateLeaderboard: jest.fn().mockResolvedValue(undefined),
  invalidatePlatformStats: jest.fn().mockResolvedValue(undefined),
};

const noopWebhook = {
  dispatch: jest.fn().mockResolvedValue(undefined),
};

function buildDispatcher(dataSource: { createQueryRunner: jest.Mock }) {
  const userProcessor = new UserProcessor(dataSource as never, noopCache as never);
  const raffleProcessor = new RaffleProcessor(
    dataSource as never,
    noopCache as never,
    userProcessor,
    noopWebhook as never,
  );
  const ticketProcessor = new TicketProcessor(
    noopCache as never,
    userProcessor,
    noopWebhook as never,
  );
  const adminProcessor = new AdminProcessor();

  return new IngestionDispatcherService(
    dataSource as never,
    raffleProcessor,
    ticketProcessor,
    adminProcessor,
  );
}

async function deliverTwice(
  event: DomainEvent,
  raw: Record<string, unknown>,
  initial: DurableState,
): Promise<{ once: DurableState; twice: DurableState }> {
  // Single delivery
  const onceDb = createInMemoryDb(initial);
  const onceDispatcher = buildDispatcher(onceDb.dataSource);
  await onceDispatcher.dispatch(event, raw);
  const once = cloneState(onceDb.state);

  // Duplicate delivery
  const twiceDb = createInMemoryDb(initial);
  const twiceDispatcher = buildDispatcher(twiceDb.dataSource);
  await twiceDispatcher.dispatch(event, raw);
  await twiceDispatcher.dispatch(event, raw);
  const twice = cloneState(twiceDb.state);

  return { once, twice };
}

describe("handler duplicate-delivery idempotency", () => {
  const handlers = [
    ["RaffleCreatedHandler", new RaffleCreatedHandler()],
    ["TicketPurchasedHandler", new TicketPurchasedHandler()],
    ["RaffleFinalizedHandler", new RaffleFinalizedHandler()],
    ["RaffleCancelledHandler", new RaffleCancelledHandler()],
    ["DrawTriggeredHandler", new DrawTriggeredHandler()],
    ["RandomnessRequestedHandler", new RandomnessRequestedHandler()],
    ["RandomnessReceivedHandler", new RandomnessReceivedHandler()],
    ["TicketRefundedHandler", new TicketRefundedHandler()],
    ["ContractPausedHandler", new ContractPausedHandler()],
    ["ContractUnpausedHandler", new ContractUnpausedHandler()],
    ["AdminTransferProposedHandler", new AdminTransferProposedHandler()],
    ["AdminTransferAcceptedHandler", new AdminTransferAcceptedHandler()],
  ] as const;

  it.each(handlers)(
    "%s parse is pure — parsing the same raw event twice yields equal DomainEvents",
    (_name, handler) => {
      // Use string ScVals for addresses — fixtures are not checksummed G-addresses.
      const topics = [
        nativeToScVal(handler.eventName, { type: "symbol" }),
        nativeToScVal(1, { type: "u32" }),
        nativeToScVal(CREATOR_ADDRESS, { type: "string" }),
      ];
      const value = nativeToScVal({
        ticket_price: "10",
        max_tickets: 100,
        end_time: 999,
        asset: "XLM",
        metadata_cid: "",
        allow_multiple: true,
        ticket_ids: [1, 2],
        total_paid: "20",
        winning_ticket_id: 1,
        prize_amount: "100",
        reason: "test",
        recipient: BUYER_ADDRESS,
        amount: "10",
        ledger: 100,
        request_id: 7,
        seed: Buffer.from("aa", "hex"),
        proof: Buffer.from("bb", "hex"),
      });
      const raw: RawSorobanEvent = {
        type: "contract",
        topics: topics.map((t) => t.toXDR("base64")),
        value: value.toXDR("base64"),
        ledger: 100,
      };

      const a = handler.parse(topics, value, raw);
      const b = handler.parse(topics, value, raw);
      expect(b).toEqual(a);
    },
  );

  it("RaffleCreatedHandler: duplicate delivery leaves identical state", async () => {
    const event = makeRaffleCreatedEvent({ schemaVersion: 1 });
    const raw = makeRawIngestionEvent("RaffleCreated", {
      id: mockTxHash("created"),
      ledger: 500,
    });
    const initial: DurableState = {
      raffles: [],
      tickets: [],
      users: [],
      events: [],
      platform: { id: "global", paused: false, lastUpdatedLedger: 0 },
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.raffles).toHaveLength(1);
    expect(once.events).toHaveLength(1);
  });

  it("TicketPurchasedHandler: duplicate delivery does not double-count tickets", async () => {
    const event = makeTicketPurchasedEvent({
      schemaVersion: 1,
      ticket_ids: [10, 11],
    });
    const raw = makeRawIngestionEvent("TicketPurchased", {
      id: mockTxHash("purchase"),
      ledger: 600,
    });
    const initial: DurableState = {
      raffles: [
        {
          id: 1,
          status: RaffleStatus.OPEN,
          ticketsSold: 0,
          creator: CREATOR_ADDRESS,
        },
      ],
      tickets: [],
      users: [],
      events: [],
      platform: null,
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.tickets).toHaveLength(2);
    expect(once.raffles[0].ticketsSold).toBe(2);
    expect(twice.raffles[0].ticketsSold).toBe(2);
  });

  it("RaffleFinalizedHandler: duplicate delivery leaves identical state", async () => {
    const event = makeRaffleFinalizedEvent({ schemaVersion: 1 });
    const raw = makeRawIngestionEvent("RaffleFinalized", {
      id: mockTxHash("finalized"),
      ledger: 700,
    });
    const initial: DurableState = {
      raffles: [
        {
          id: 1,
          status: RaffleStatus.DRAWING,
          ticketsSold: 2,
          creator: CREATOR_ADDRESS,
        },
      ],
      tickets: [],
      users: [{ address: BUYER_ADDRESS, totalRafflesWon: 0, totalPrizeXlm: "0" }],
      events: [],
      platform: null,
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.raffles[0].status).toBe(RaffleStatus.FINALIZED);
    expect(once.events).toHaveLength(1);
  });

  it("RaffleCancelledHandler: duplicate delivery leaves identical state", async () => {
    const event = makeRaffleCancelledEvent({ schemaVersion: 1 });
    const raw = makeRawIngestionEvent("RaffleCancelled", {
      id: mockTxHash("cancelled"),
      ledger: 710,
    });
    const initial: DurableState = {
      raffles: [
        {
          id: 1,
          status: RaffleStatus.OPEN,
          ticketsSold: 0,
          creator: CREATOR_ADDRESS,
        },
      ],
      tickets: [],
      users: [],
      events: [],
      platform: null,
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.raffles[0].status).toBe(RaffleStatus.CANCELLED);
    expect(once.events).toHaveLength(1);
  });

  it("TicketRefundedHandler: duplicate delivery leaves identical state", async () => {
    const event = makeTicketRefundedEvent({ schemaVersion: 1 });
    const raw = makeRawIngestionEvent("TicketRefunded", {
      id: mockTxHash("refund"),
      ledger: 720,
    });
    const initial: DurableState = {
      raffles: [{ id: 1, status: RaffleStatus.CANCELLED, ticketsSold: 1 }],
      tickets: [
        {
          id: 1,
          raffleId: 1,
          owner: BUYER_ADDRESS,
          purchaseTxHash: mockTxHash("purchase"),
          refunded: false,
        },
      ],
      users: [{ address: BUYER_ADDRESS }],
      events: [],
      platform: null,
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.tickets[0].refunded).toBe(true);
  });

  it("ContractPausedHandler: duplicate delivery leaves identical state", async () => {
    const event: DomainEvent = {
      type: "ContractPaused",
      schemaVersion: 1,
      admin: CREATOR_ADDRESS,
    };
    const raw = makeRawIngestionEvent("ContractPaused", {
      id: mockTxHash("paused"),
      ledger: 800,
    });
    const initial: DurableState = {
      raffles: [],
      tickets: [],
      users: [],
      events: [],
      platform: {
        id: "global",
        paused: false,
        lastUpdatedLedger: 0,
        adminAddress: CREATOR_ADDRESS,
      },
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.platform?.paused).toBe(true);
    expect(once.events).toHaveLength(1);
  });

  it("ContractUnpausedHandler: duplicate delivery leaves identical state", async () => {
    const event: DomainEvent = {
      type: "ContractUnpaused",
      schemaVersion: 1,
      admin: CREATOR_ADDRESS,
    };
    const raw = makeRawIngestionEvent("ContractUnpaused", {
      id: mockTxHash("unpaused"),
      ledger: 801,
    });
    const initial: DurableState = {
      raffles: [],
      tickets: [],
      users: [],
      events: [],
      platform: {
        id: "global",
        paused: true,
        lastUpdatedLedger: 800,
        adminAddress: CREATOR_ADDRESS,
      },
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.platform?.paused).toBe(false);
  });

  it("AdminTransferProposedHandler: duplicate delivery leaves identical state", async () => {
    const event: DomainEvent = {
      type: "AdminTransferProposed",
      schemaVersion: 1,
      current_admin: CREATOR_ADDRESS,
      proposed_admin: BUYER_ADDRESS,
    };
    const raw = makeRawIngestionEvent("AdminTransferProposed", {
      id: mockTxHash("admin-prop"),
      ledger: 810,
    });
    const initial: DurableState = {
      raffles: [],
      tickets: [],
      users: [],
      events: [],
      platform: {
        id: "global",
        adminAddress: CREATOR_ADDRESS,
        pendingAdminAddress: null,
        lastUpdatedLedger: 0,
      },
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.platform?.pendingAdminAddress).toBe(BUYER_ADDRESS);
  });

  it("AdminTransferAcceptedHandler: duplicate delivery leaves identical state", async () => {
    const event: DomainEvent = {
      type: "AdminTransferAccepted",
      schemaVersion: 1,
      old_admin: CREATOR_ADDRESS,
      new_admin: BUYER_ADDRESS,
    };
    const raw = makeRawIngestionEvent("AdminTransferAccepted", {
      id: mockTxHash("admin-acc"),
      ledger: 811,
    });
    const initial: DurableState = {
      raffles: [],
      tickets: [],
      users: [],
      events: [],
      platform: {
        id: "global",
        adminAddress: CREATOR_ADDRESS,
        pendingAdminAddress: BUYER_ADDRESS,
        lastUpdatedLedger: 810,
      },
    };

    const { once, twice } = await deliverTwice(event, raw, initial);
    expect(snapshotState(twice)).toEqual(snapshotState(once));
    expect(once.platform?.adminAddress).toBe(BUYER_ADDRESS);
    expect(once.platform?.pendingAdminAddress).toBeNull();
  });

  it.each([
    [
      "DrawTriggeredHandler",
      {
        type: "DrawTriggered",
        schemaVersion: 1,
        raffle_id: 1,
        ledger: 900,
      } satisfies DomainEvent,
    ],
    [
      "RandomnessRequestedHandler",
      {
        type: "RandomnessRequested",
        schemaVersion: 1,
        raffle_id: 1,
        request_id: 42,
      } satisfies DomainEvent,
    ],
    [
      "RandomnessReceivedHandler",
      {
        type: "RandomnessReceived",
        schemaVersion: 1,
        raffle_id: 1,
        seed: "aa",
        proof: "bb",
      } satisfies DomainEvent,
    ],
  ] as const)(
    "%s: duplicate delivery leaves identical (empty) durable state",
    async (name, event) => {
      const raw = makeRawIngestionEvent(event.type, {
        id: mockTxHash(name),
        ledger: 900,
      });
      const initial: DurableState = {
        raffles: [],
        tickets: [],
        users: [],
        events: [],
        platform: null,
      };
      const { once, twice } = await deliverTwice(event, raw, initial);
      expect(snapshotState(twice)).toEqual(snapshotState(once));
      expect(once).toEqual(initial);
    },
  );
});

