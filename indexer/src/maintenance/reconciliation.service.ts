import { Injectable } from '@nestjs/common';
import type { ReadOnlyRaffleService } from '@tikka/sdk/read';
import { DataSource } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';

export interface ReconciliationDiscrepancy {
  kind: 'raffle' | 'aggregate';
  key: string;
  field: string;
  indexed: unknown;
  chainOrDerived: unknown;
}

interface IndexedRaffle {
  id: number;
  creator: string;
  status: string;
  ticketPrice: string;
  asset: string;
  maxTickets: number;
  ticketsSold: number;
  endTime: string;
  winner: string | null;
  winningTicketId: number | null;
  prizeAmount: string | null;
  metadataCid: string | null;
}

interface RecomputedPlatformStats {
  date: string;
  total_raffles: number | string;
  total_tickets: number | string;
  total_volume_xlm: string;
  unique_participants: number | string;
  prizes_distributed_xlm: string;
  stored_total_raffles: number | string | null;
  stored_total_tickets: number | string | null;
  stored_total_volume_xlm: string | null;
  stored_unique_participants: number | string | null;
  stored_prizes_distributed_xlm: string | null;
}

export interface ReconciliationReport {
  sampledRaffles: number;
  raffleDiscrepancies: number;
  aggregateDiscrepancies: number;
  discrepancies: ReconciliationDiscrepancy[];
}

const STATUS_NAMES = ['open', 'drawing', 'finalized', 'cancelled'];

function normalizeStatus(value: unknown): string {
  if (typeof value === 'number') return STATUS_NAMES[value] ?? String(value);
  return String(value ?? '').toLowerCase();
}

function comparable(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function compareRaffle(
  indexed: IndexedRaffle,
  chain: {
    creator: string;
    status: number | string;
    ticketPrice: string;
    asset: string;
    maxTickets: number;
    ticketsSold: number;
    endTime: number;
    winner?: string;
    winningTicketId?: number;
    prizeAmount?: string;
    metadataCid: string;
  },
): ReconciliationDiscrepancy[] {
  const pairs: Array<[string, unknown, unknown]> = [
    ['creator', indexed.creator, chain.creator],
    ['status', normalizeStatus(indexed.status), normalizeStatus(chain.status)],
    ['ticketPrice', indexed.ticketPrice, chain.ticketPrice],
    ['asset', indexed.asset, chain.asset],
    ['maxTickets', indexed.maxTickets, chain.maxTickets],
    ['ticketsSold', indexed.ticketsSold, chain.ticketsSold],
    ['endTime', Number(indexed.endTime), Math.floor(chain.endTime / 1000)],
    ['winner', indexed.winner, chain.winner],
    ['winningTicketId', indexed.winningTicketId, chain.winningTicketId],
    ['prizeAmount', indexed.prizeAmount, chain.prizeAmount],
    ['metadataCid', indexed.metadataCid, chain.metadataCid],
  ];

  return pairs.flatMap(([field, indexedValue, chainValue]) =>
    comparable(indexedValue) === comparable(chainValue)
      ? []
      : [
          {
            kind: 'raffle' as const,
            key: String(indexed.id),
            field,
            indexed: indexedValue,
            chainOrDerived: chainValue ?? null,
          },
        ],
  );
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly raffleReader: ReadOnlyRaffleService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Compare a random sample of indexed raffles to contract state, then verify
   * retained daily platform aggregates against a fresh aggregation of raw events.
   * Discrepancies are observable and reported; this method never writes data.
   */
  async reconcile(sampleSize: number): Promise<ReconciliationReport> {
    if (!Number.isSafeInteger(sampleSize) || sampleSize < 1) {
      throw new Error('RECONCILIATION_SAMPLE_SIZE must be a positive integer');
    }

    const chainIdsResponse = await this.raffleReader.getAll();
    if (!chainIdsResponse.success || !chainIdsResponse.value) {
      throw new Error('Contract returned no raffle ID list');
    }
    const chainIds = new Set(chainIdsResponse.value);
    const databaseIds: Array<{ id: number }> =
      await this.dataSource.query('SELECT id FROM raffles');
    const sampledIds = [...new Set([...chainIds, ...databaseIds.map(({ id }) => id)])];
    for (let i = sampledIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sampledIds[i], sampledIds[j]] = [sampledIds[j], sampledIds[i]];
    }
    sampledIds.length = Math.min(sampledIds.length, sampleSize);

    const raffles: IndexedRaffle[] = sampledIds.length
      ? await this.dataSource.query(
          `SELECT id, creator, status, ticket_price AS "ticketPrice", asset,
              max_tickets AS "maxTickets", tickets_sold AS "ticketsSold",
              end_time AS "endTime", winner,
              winning_ticket_id AS "winningTicketId",
              prize_amount AS "prizeAmount", metadata_cid AS "metadataCid"
       FROM raffles
       WHERE id = ANY($1::integer[])`,
          [sampledIds],
        )
      : [];
    const indexedById = new Map(raffles.map((raffle) => [raffle.id, raffle]));

    const discrepancies: ReconciliationDiscrepancy[] = [];
    for (const raffleId of sampledIds) {
      const raffle = indexedById.get(raffleId);
      const existsOnChain = chainIds.has(raffleId);
      if (!existsOnChain) {
        discrepancies.push({
          kind: 'raffle',
          key: String(raffleId),
          field: 'chain_row',
          indexed: 'present',
          chainOrDerived: null,
        });
        continue;
      }
      if (!raffle) {
        discrepancies.push({
          kind: 'raffle',
          key: String(raffleId),
          field: 'indexed_row',
          indexed: null,
          chainOrDerived: 'present',
        });
        continue;
      }
      const response = await this.raffleReader.getById(raffleId);
      if (!response.success || !response.value) {
        throw new Error(`Contract returned no state for raffle ${raffleId}`);
      }
      discrepancies.push(...compareRaffle(raffle, response.value));
    }

    const aggregateRows: RecomputedPlatformStats[] = await this.dataSource.query(`
      WITH recomputed AS (
        SELECT
          (indexed_at AT TIME ZONE 'UTC')::date::text AS date,
          COUNT(*) FILTER (WHERE event_type = 'RaffleCreated') AS total_raffles,
          COALESCE(SUM(
            CASE WHEN jsonb_typeof(payload_json->'ticket_ids') = 'array'
              THEN jsonb_array_length(payload_json->'ticket_ids') ELSE 0 END
          ) FILTER (WHERE event_type = 'TicketPurchased'), 0) AS total_tickets,
          COALESCE(SUM(
            CASE WHEN COALESCE(payload_json->>'total_paid', '') ~ '^[0-9]+$'
              THEN (payload_json->>'total_paid')::numeric ELSE 0 END
          ) FILTER (WHERE event_type = 'TicketPurchased'), 0)::text AS total_volume_xlm,
          COUNT(DISTINCT payload_json->>'buyer') FILTER (
            WHERE event_type = 'TicketPurchased' AND payload_json->>'buyer' IS NOT NULL
          ) AS unique_participants,
          COALESCE(SUM(
            CASE WHEN COALESCE(payload_json->>'prize_amount', '') ~ '^[0-9]+$'
              THEN (payload_json->>'prize_amount')::numeric ELSE 0 END
          ) FILTER (WHERE event_type = 'RaffleFinalized'), 0)::text AS prizes_distributed_xlm
        FROM raffle_events
        GROUP BY (indexed_at AT TIME ZONE 'UTC')::date
      )
      SELECT r.date, r.total_raffles, r.total_tickets, r.total_volume_xlm,
             r.unique_participants, r.prizes_distributed_xlm,
             s.total_raffles AS stored_total_raffles,
             s.total_tickets AS stored_total_tickets,
             s.total_volume_xlm AS stored_total_volume_xlm,
             s.unique_participants AS stored_unique_participants,
             s.prizes_distributed_xlm AS stored_prizes_distributed_xlm
      FROM recomputed r
      LEFT JOIN platform_stats s ON s.date = r.date
      ORDER BY r.date DESC
    `);

    const aggregateFields: Array<
      [string, keyof RecomputedPlatformStats, keyof RecomputedPlatformStats]
    > = [
      ['total_raffles', 'stored_total_raffles', 'total_raffles'],
      ['total_tickets', 'stored_total_tickets', 'total_tickets'],
      ['total_volume_xlm', 'stored_total_volume_xlm', 'total_volume_xlm'],
      ['unique_participants', 'stored_unique_participants', 'unique_participants'],
      ['prizes_distributed_xlm', 'stored_prizes_distributed_xlm', 'prizes_distributed_xlm'],
    ];

    for (const row of aggregateRows) {
      for (const [field, storedKey, recomputedKey] of aggregateFields) {
        if (comparable(row[storedKey]) !== comparable(row[recomputedKey])) {
          discrepancies.push({
            kind: 'aggregate',
            key: row.date,
            field,
            indexed: row[storedKey],
            chainOrDerived: row[recomputedKey],
          });
        }
      }
    }

    const raffleDiscrepancies = discrepancies.filter((item) => item.kind === 'raffle').length;
    const aggregateDiscrepancies = discrepancies.length - raffleDiscrepancies;
    this.metrics.setReconciliationDiscrepancies('raffle', raffleDiscrepancies);
    this.metrics.setReconciliationDiscrepancies('aggregate', aggregateDiscrepancies);

    return {
      sampledRaffles: sampledIds.length,
      raffleDiscrepancies,
      aggregateDiscrepancies,
      discrepancies,
    };
  }
}
