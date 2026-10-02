import { DataSource, In } from 'typeorm';
import { createDemoRaffleScenarios } from '@tikka/types';
import { RaffleEventEntity } from '../database/entities/raffle-event.entity';
import { RaffleEntity, RaffleStatus } from '../database/entities/raffle.entity';
import { TicketEntity } from '../database/entities/ticket.entity';
import { UserEntity } from '../database/entities/user.entity';
import {
  DemoSeedEvent,
  makeDemoSeedEvents,
  mockTxHash,
} from '../test/integration/helpers/mock-events';

const DEMO_CONTRACT_ADDRESS = `C${'2'.repeat(55)}`;

export interface DemoSeedRows {
  raffleIds: number[];
  raffles: Partial<RaffleEntity>[];
  tickets: Partial<TicketEntity>[];
  users: Partial<UserEntity>[];
  raffleEvents: Partial<RaffleEventEntity>[];
}

export function buildDemoSeedRows(nowSeconds = Math.floor(Date.now() / 1_000)): DemoSeedRows {
  const scenarios = createDemoRaffleScenarios(nowSeconds);
  const events = makeDemoSeedEvents(nowSeconds);
  const raffleIds = scenarios.map(({ raffleId }) => raffleId);
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.raffleId, scenario]));
  const createdEvents = events.filter(
    (event): event is Extract<DemoSeedEvent, { kind: 'raffle-created' }> =>
      event.kind === 'raffle-created',
  );
  const purchaseEvents = events.filter(
    (event): event is Extract<DemoSeedEvent, { kind: 'ticket-purchased' }> =>
      event.kind === 'ticket-purchased',
  );
  const finalizedEvents = events.filter(
    (event): event is Extract<DemoSeedEvent, { kind: 'raffle-finalized' }> =>
      event.kind === 'raffle-finalized',
  );
  const cancelledEvents = events.filter(
    (event): event is Extract<DemoSeedEvent, { kind: 'raffle-cancelled' }> =>
      event.kind === 'raffle-cancelled',
  );

  const raffles = scenarios.map((scenario) => {
    const created = createdEvents.find((event) => event.payload.raffleId === scenario.raffleId);
    const finalized = finalizedEvents.find((event) => event.payload.raffleId === scenario.raffleId);
    const cancelled = cancelledEvents.find((event) => event.payload.raffleId === scenario.raffleId);
    if (!created) throw new Error(`Missing RaffleCreated fixture for ${scenario.raffleId}`);

    return {
      id: scenario.raffleId,
      creator: created.payload.creator,
      status:
        scenario.status === 'finalized'
          ? RaffleStatus.FINALIZED
          : scenario.status === 'cancelled'
            ? RaffleStatus.CANCELLED
            : RaffleStatus.OPEN,
      ticketPrice: created.payload.ticketPrice,
      asset: created.payload.asset,
      maxTickets: created.payload.maxTickets,
      ticketsSold: scenario.purchases.reduce(
        (total, purchase) => total + purchase.ticketIds.length,
        0,
      ),
      endTime: created.payload.endTime,
      winner: finalized?.payload.winner ?? null,
      winningTicketId: finalized ? scenario.winningTicketId : null,
      prizeAmount: finalized?.payload.prizeAmount ?? null,
      createdLedger: created.payload.createdLedger,
      finalizedLedger: finalized?.ledger ?? cancelled?.payload.ledger ?? null,
      metadataCid: created.payload.metadataCid ?? null,
      createdAt: new Date(scenario.createdAtSeconds * 1_000),
    };
  });

  const tickets: Partial<TicketEntity>[] = [];
  for (const event of purchaseEvents) {
    const scenario = scenarioById.get(event.payload.raffleId);
    if (!scenario) throw new Error(`Unknown demo raffle ${event.payload.raffleId}`);

    for (const ticketId of event.payload.ticketIds) {
      tickets.push({
        id: ticketId,
        raffleId: event.payload.raffleId,
        owner: event.payload.buyer,
        purchasedAtLedger: event.payload.ledger,
        purchaseTxHash: event.payload.txHash,
        refunded: scenario.status === 'cancelled',
        refundTxHash: scenario.status === 'cancelled' ? mockTxHash(ticketId + 3_000_000) : null,
      });
    }
  }

  const usersByAddress = new Map<string, Partial<UserEntity>>();
  const enteredRafflesByAddress = new Map<string, Set<number>>();
  const getUser = (address: string, ledger: number): Partial<UserEntity> => {
    const existing = usersByAddress.get(address);
    if (existing) {
      existing.firstSeenLedger = Math.min(existing.firstSeenLedger ?? ledger, ledger);
      return existing;
    }

    const user: Partial<UserEntity> = {
      address,
      totalTicketsBought: 0,
      totalRafflesEntered: 0,
      totalRafflesWon: 0,
      totalPrizeXlm: '0',
      firstSeenLedger: ledger,
      lastTxHash: null,
    };
    usersByAddress.set(address, user);
    return user;
  };

  for (const event of createdEvents) {
    getUser(event.payload.creator, event.payload.createdLedger);
  }
  for (const event of purchaseEvents) {
    const user = getUser(event.payload.buyer, event.payload.ledger);
    user.totalTicketsBought = (user.totalTicketsBought ?? 0) + event.payload.ticketIds.length;
    const enteredRaffles = enteredRafflesByAddress.get(event.payload.buyer) ?? new Set<number>();
    if (!enteredRaffles.has(event.payload.raffleId)) {
      user.totalRafflesEntered = (user.totalRafflesEntered ?? 0) + 1;
      enteredRaffles.add(event.payload.raffleId);
      enteredRafflesByAddress.set(event.payload.buyer, enteredRaffles);
    }
    user.lastTxHash = event.payload.txHash;
  }
  for (const event of finalizedEvents) {
    const user = getUser(event.payload.winner, event.ledger);
    user.totalRafflesWon = (user.totalRafflesWon ?? 0) + 1;
    user.totalPrizeXlm = (
      BigInt(user.totalPrizeXlm ?? '0') + BigInt(event.payload.prizeAmount)
    ).toString();
    user.lastTxHash = `finalized:${event.payload.raffleId}`;
  }

  const raffleEvents: Partial<RaffleEventEntity>[] = events.map((event) => {
    switch (event.kind) {
      case 'raffle-created':
        return {
          raffleId: event.payload.raffleId,
          eventType: 'RaffleCreated',
          contractAddress: DEMO_CONTRACT_ADDRESS,
          schemaVersion: 1,
          ledger: event.payload.createdLedger,
          txHash: event.payload.txHash,
          payloadJson: event.payload,
        };
      case 'ticket-purchased':
        return {
          raffleId: event.payload.raffleId,
          eventType: 'TicketPurchased',
          contractAddress: DEMO_CONTRACT_ADDRESS,
          schemaVersion: 1,
          ledger: event.payload.ledger,
          txHash: event.payload.txHash,
          payloadJson: event.payload,
        };
      case 'raffle-finalized':
        return {
          raffleId: event.payload.raffleId,
          eventType: 'RaffleFinalized',
          contractAddress: DEMO_CONTRACT_ADDRESS,
          schemaVersion: 1,
          ledger: event.ledger,
          txHash: event.txHash,
          payloadJson: event.payload,
        };
      case 'raffle-cancelled':
        return {
          raffleId: event.payload.raffleId,
          eventType: 'RaffleCancelled',
          contractAddress: DEMO_CONTRACT_ADDRESS,
          schemaVersion: 1,
          ledger: event.payload.ledger,
          txHash: event.payload.txHash,
          payloadJson: event.payload,
        };
    }
  });

  return { raffleIds, raffles, tickets, users: [...usersByAddress.values()], raffleEvents };
}

export async function seedDemoDatabase(
  dataSource: DataSource,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<DemoSeedRows> {
  const rows = buildDemoSeedRows(nowSeconds);

  await dataSource.transaction(async (manager) => {
    await manager.delete(TicketEntity, { raffleId: In(rows.raffleIds) });
    await manager.upsert(RaffleEntity, rows.raffles, ['id']);
    await manager.insert(TicketEntity, rows.tickets);
    await manager.upsert(UserEntity, rows.users, ['address']);
    await manager.upsert(RaffleEventEntity, rows.raffleEvents, ['txHash']);
  });

  return rows;
}
