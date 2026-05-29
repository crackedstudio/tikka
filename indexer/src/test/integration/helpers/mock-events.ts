/**
 * mock-events.ts
 *
 * Factory helpers that produce the typed event payloads that the processor
 * methods accept.  These mirror what the EventParserService would return after
 * decoding a real Soroban on-chain event.
 *
 * Keeping them separate from the test files makes it easy to reuse across
 * multiple integration test suites and keeps the fixture data in one place.
 */

import { DomainEvent } from '../../../ingestor/event.types';

// ─── Stellar address fixtures ────────────────────────────────────────────────

/** A 56-character Stellar G-address used as a default creator across fixtures. */
export const CREATOR_ADDRESS =
  'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGCHWQ12WKLOEQBSRQOZKRN';

/** A 56-character Stellar G-address used as a default buyer across fixtures. */
export const BUYER_ADDRESS =
  'GBRAND7QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQBRANDD';

/** A second buyer address used in multi-user scenarios. */
export const BUYER2_ADDRESS =
  'GCREATOR2QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQCREATOR2';

// ─── TX hash helpers ─────────────────────────────────────────────────────────

/** Creates a deterministic-looking 64-character hex tx hash from a seed. */
export function mockTxHash(seed: string | number): string {
  const base = String(seed).padStart(8, '0');
  return base.repeat(8);
}

// ─── Raffle fixtures ─────────────────────────────────────────────────────────

export interface RaffleCreatedPayload {
  raffleId: number;
  creator: string;
  ticketPrice: string;
  maxTickets: number;
  asset: string;
  endTime: string;
  metadataCid?: string;
  createdLedger: number;
  txHash: string;
}

/** Returns a minimal RaffleCreated payload suitable for inserting into the DB. */
export function makeRaffleCreated(
  overrides: Partial<RaffleCreatedPayload> = {},
): RaffleCreatedPayload {
  return {
    raffleId: 1,
    creator: CREATOR_ADDRESS,
    ticketPrice: '10000000',
    maxTickets: 100,
    asset: 'XLM',
    endTime: String(Math.floor(Date.now() / 1000) + 86_400), // +1 day
    createdLedger: 1000,
    txHash: mockTxHash(1),
    ...overrides,
  };
}

// ─── Ticket fixtures ──────────────────────────────────────────────────────────

export interface TicketPurchasedPayload {
  raffleId: number;
  buyer: string;
  ticketIds: number[];
  totalCost: string;
  ledger: number;
  txHash: string;
}

export function makeTicketPurchased(
  overrides: Partial<TicketPurchasedPayload> = {},
): TicketPurchasedPayload {
  return {
    raffleId: 1,
    buyer: BUYER_ADDRESS,
    ticketIds: [1, 2, 3],
    totalCost: '30000000',
    ledger: 1010,
    txHash: mockTxHash(2),
    ...overrides,
  };
}

export interface TicketRefundedPayload {
  raffleId: number;
  ticketId: number;
  recipient: string;
  amount: string;
  txHash: string;
}

export function makeTicketRefunded(
  overrides: Partial<TicketRefundedPayload> = {},
): TicketRefundedPayload {
  return {
    raffleId: 1,
    ticketId: 1,
    recipient: BUYER_ADDRESS,
    amount: '10000000',
    txHash: mockTxHash(10),
    ...overrides,
  };
}

// ─── Raw event fixtures ──────────────────────────────────────────────────────

export interface RawIngestionEvent {
  id: string;
  paging_token: string;
  ledger: number;
  contract_id: string;
  topic: string[];
  topics: string[];
  value: Record<string, unknown>;
  decodedPayload: Record<string, unknown>;
}

export function makeRawIngestionEvent(
  eventType = 'RaffleCreated',
  overrides: Partial<RawIngestionEvent> = {},
): RawIngestionEvent {
  const ledger = overrides.ledger ?? 1000;
  const id = overrides.id ?? mockTxHash(`${eventType}:${ledger}`);

  return {
    id,
    paging_token: overrides.paging_token ?? `${ledger}-${id}`,
    ledger,
    contract_id:
      overrides.contract_id ??
      'CCONTRACT00000000000000000000000000000000000000000000000000',
    topic: overrides.topic ?? ['contract', eventType],
    topics: overrides.topics ?? ['contract', eventType],
    value: overrides.value ?? {},
    decodedPayload: overrides.decodedPayload ?? {},
    ...overrides,
  };
}

// ─── Domain event fixtures ───────────────────────────────────────────────────

export function makeRaffleCreatedEvent(
  overrides: Partial<Extract<DomainEvent, { type: 'RaffleCreated' }>> = {},
): Extract<DomainEvent, { type: 'RaffleCreated' }> {
  const f = makeRaffleCreated();

  return {
    type: 'RaffleCreated',
    raffle_id: f.raffleId,
    creator: f.creator,
    params: {
      ticket_price: f.ticketPrice,
      max_tickets: f.maxTickets,
      end_time: Number(f.endTime),
      asset: f.asset,
      metadata_cid: f.metadataCid ?? '',
      allow_multiple: true,
    },
    ...overrides,
  };
}

export function makeTicketPurchasedEvent(
  overrides: Partial<Extract<DomainEvent, { type: 'TicketPurchased' }>> = {},
): Extract<DomainEvent, { type: 'TicketPurchased' }> {
  const f = makeTicketPurchased();

  return {
    type: 'TicketPurchased',
    raffle_id: f.raffleId,
    buyer: f.buyer,
    ticket_ids: f.ticketIds,
    total_paid: f.totalCost,
    ...overrides,
  };
}

export function makeRaffleFinalizedEvent(
  overrides: Partial<Extract<DomainEvent, { type: 'RaffleFinalized' }>> = {},
): Extract<DomainEvent, { type: 'RaffleFinalized' }> {
  const f = makeRaffleFinalized();

  return {
    type: 'RaffleFinalized',
    raffle_id: f.raffleId,
    winner: f.winner,
    winning_ticket_id: 1,
    prize_amount: f.prizeAmount,
    ...overrides,
  };
}

export function makeRaffleCancelledEvent(
  overrides: Partial<Extract<DomainEvent, { type: 'RaffleCancelled' }>> = {},
): Extract<DomainEvent, { type: 'RaffleCancelled' }> {
  const f = makeRaffleCancelled();

  return {
    type: 'RaffleCancelled',
    raffle_id: f.raffleId,
    reason: f.reason,
    ...overrides,
  };
}

export function makeTicketRefundedEvent(
  overrides: Partial<Extract<DomainEvent, { type: 'TicketRefunded' }>> = {},
): Extract<DomainEvent, { type: 'TicketRefunded' }> {
  const f = makeTicketRefunded();

  return {
    type: 'TicketRefunded',
    raffle_id: f.raffleId,
    ticket_id: f.ticketId,
    recipient: f.recipient,
    amount: f.amount,
    ...overrides,
  };
}

// ─── Raffle finalization / cancellation fixtures ──────────────────────────────

export interface RaffleFinalizedPayload {
  raffleId: number;
  winner: string;
  prizeAmount: string;
}

export function makeRaffleFinalized(
  overrides: Partial<RaffleFinalizedPayload> = {},
): RaffleFinalizedPayload {
  return {
    raffleId: 1,
    winner: BUYER_ADDRESS,
    prizeAmount: '100000000',
    ...overrides,
  };
}

export interface RaffleCancelledPayload {
  raffleId: number;
  reason: string;
  ledger: number;
  txHash: string;
}

export function makeRaffleCancelled(
  overrides: Partial<RaffleCancelledPayload> = {},
): RaffleCancelledPayload {
  return {
    raffleId: 1,
    reason: 'Low participation',
    ledger: 1020,
    txHash: mockTxHash(20),
    ...overrides,
  };
}
