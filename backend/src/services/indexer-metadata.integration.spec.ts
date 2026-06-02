import { describe, it, expect } from 'vitest';
import type {
  IndexerRaffleData,
  RaffleMetadata,
  RaffleWithFreshness,
  RaffleFreshness,
} from './indexer.service';

/**
 * Integration tests for metadata + indexer data merging
 * Verifies conflict resolution and freshness handling
 */

function calculateStaleness(metadataUpdatedAt: string, indexedAt: string): { metadataNewer: boolean; minutesOld: number } {
  const metadataTime = new Date(metadataUpdatedAt).getTime();
  const indexedTime = new Date(indexedAt).getTime();
  const diffMs = metadataTime - indexedTime;
  const minutesOld = Math.round(diffMs / 60000);
  return {
    metadataNewer: diffMs > 0,
    minutesOld: Math.abs(minutesOld),
  };
}

function mergeRaffleData(
  metadata: RaffleMetadata | null,
  indexerData: IndexerRaffleData | null,
): RaffleWithFreshness {
  if (!indexerData && !metadata) {
    throw new Error('Raffle not found');
  }

  if (!indexerData) {
    // Metadata-only case
    return {
      id: metadata!.raffle_id,
      creator: 'unknown',
      status: 'pending_indexing',
      ticket_price: '0',
      asset: 'XLM',
      max_tickets: 0,
      tickets_sold: 0,
      end_time: new Date().toISOString(),
      winner: null,
      prize_amount: null,
      created_ledger: 0,
      finalized_ledger: null,
      metadata_cid: null,
      created_at: metadata!.created_at,
      title: metadata!.title,
      description: metadata!.description,
      image_url: metadata!.image_url,
      image_urls: metadata!.image_urls,
      category: metadata!.category,
      freshness: {
        indexedAt: null,
        sourceUpdatedAt: metadata!.created_at,
        warning: 'Raffle pending blockchain indexing',
      },
    };
  }

  if (!metadata) {
    // Indexer-only case
    return {
      ...indexerData,
      title: 'Untitled Raffle',
      description: 'Description not available',
      freshness: {
        indexedAt: indexerData.created_at,
        sourceUpdatedAt: indexerData.created_at,
        ledger: indexerData.created_ledger,
        warning: 'Metadata not available; displaying indexed data only',
      },
    };
  }

  // Both exist: apply precedence rules
  const staleness = calculateStaleness(metadata.updated_at, indexerData.created_at);

  return {
    ...indexerData,
    title: metadata.title,
    description: metadata.description,
    image_url: metadata.image_url,
    image_urls: metadata.image_urls,
    category: metadata.category,
    freshness: {
      indexedAt: indexerData.created_at,
      sourceUpdatedAt: metadata.updated_at,
      ledger: indexerData.created_ledger,
      staleness: staleness.metadataNewer ? staleness : undefined,
    },
  };
}

describe('Indexer & Metadata Integration', () => {
  describe('Metadata-Only Scenario', () => {
    it('creates pending raffle when metadata exists but indexer row missing', () => {
      const metadata: RaffleMetadata = {
        raffle_id: 1,
        title: 'Test Raffle',
        description: 'A test raffle',
        image_url: 'https://example.com/image.png',
        image_urls: ['https://example.com/image1.png'],
        category: 'Art',
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
        updated_at: '2024-06-15T14:00:00Z',
        deleted_at: null,
      };

      const result = mergeRaffleData(metadata, null);

      expect(result.status).toBe('pending_indexing');
      expect(result.title).toBe('Test Raffle');
      expect(result.description).toBe('A test raffle');
      expect(result.freshness.indexedAt).toBeNull();
      expect(result.freshness.warning).toContain('pending blockchain indexing');
    });
  });

  describe('Indexer-Only Scenario', () => {
    it('displays indexer data with placeholder metadata when metadata missing', () => {
      const indexerData: IndexerRaffleData = {
        id: 42,
        creator: 'GXYZ...',
        status: 'open',
        ticket_price: '1000000',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 50,
        end_time: '2024-06-20T14:00:00Z',
        winner: null,
        prize_amount: '50000000',
        created_ledger: 12345,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
      };

      const result = mergeRaffleData(null, indexerData);

      expect(result.id).toBe(42);
      expect(result.status).toBe('open');
      expect(result.title).toBe('Untitled Raffle');
      expect(result.description).toBe('Description not available');
      expect(result.freshness.warning).toContain('Metadata not available');
      expect(result.freshness.ledger).toBe(12345);
    });
  });

  describe('Stale Indexer Scenario', () => {
    it('flags staleness when metadata updated after indexer sync', () => {
      const metadata: RaffleMetadata = {
        raffle_id: 1,
        title: 'Updated Title',
        description: 'Updated description',
        image_url: null,
        image_urls: null,
        category: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
        updated_at: '2024-06-15T14:30:00Z', // 30 minutes later
        deleted_at: null,
      };

      const indexerData: IndexerRaffleData = {
        id: 1,
        creator: 'GXYZ...',
        status: 'open',
        ticket_price: '1000000',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 50,
        end_time: '2024-06-20T14:00:00Z',
        winner: null,
        prize_amount: null,
        created_ledger: 12345,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z', // Indexed at initial time
      };

      const result = mergeRaffleData(metadata, indexerData);

      expect(result.title).toBe('Updated Title');
      expect(result.freshness.staleness?.metadataNewer).toBe(true);
      expect(result.freshness.staleness?.minutesOld).toBe(30);
    });
  });

  describe('Conflicting Status Data', () => {
    it('resolves conflicts in favor of indexer (on-chain authority)', () => {
      const metadata: RaffleMetadata = {
        raffle_id: 1,
        title: 'Test Raffle',
        description: 'Test',
        image_url: null,
        image_urls: null,
        category: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
        updated_at: '2024-06-15T14:00:00Z',
        deleted_at: null,
      };

      const indexerData: IndexerRaffleData = {
        id: 1,
        creator: 'GXYZ...',
        status: 'open', // Indexer says open (on-chain truth)
        ticket_price: '1000000',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 50,
        end_time: '2024-06-20T14:00:00Z',
        winner: null,
        prize_amount: null,
        created_ledger: 12345,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
      };

      const result = mergeRaffleData(metadata, indexerData);

      // Indexer authority takes precedence
      expect(result.status).toBe('open');
      // But metadata fields are preserved
      expect(result.title).toBe('Test Raffle');
    });
  });

  describe('Missing Indexer Rows Without Crashing', () => {
    it('handles null indexer gracefully without errors', () => {
      const metadata: RaffleMetadata = {
        raffle_id: 1,
        title: 'Test',
        description: 'Test',
        image_url: null,
        image_urls: null,
        category: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
        updated_at: '2024-06-15T14:00:00Z',
        deleted_at: null,
      };

      expect(() => mergeRaffleData(metadata, null)).not.toThrow();
      const result = mergeRaffleData(metadata, null);
      expect(result.status).toBe('pending_indexing');
    });

    it('handles null metadata gracefully without errors', () => {
      const indexerData: IndexerRaffleData = {
        id: 1,
        creator: 'GXYZ...',
        status: 'open',
        ticket_price: '1000000',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 50,
        end_time: '2024-06-20T14:00:00Z',
        winner: null,
        prize_amount: null,
        created_ledger: 12345,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
      };

      expect(() => mergeRaffleData(null, indexerData)).not.toThrow();
      const result = mergeRaffleData(null, indexerData);
      expect(result.title).toBe('Untitled Raffle');
    });

    it('throws when both metadata and indexer are missing', () => {
      expect(() => mergeRaffleData(null, null)).toThrow('Raffle not found');
    });
  });

  describe('Freshness Context Population', () => {
    it('populates all freshness fields when both sources present', () => {
      const metadata: RaffleMetadata = {
        raffle_id: 1,
        title: 'Test',
        description: 'Test',
        image_url: null,
        image_urls: null,
        category: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
        updated_at: '2024-06-15T14:10:00Z',
        deleted_at: null,
      };

      const indexerData: IndexerRaffleData = {
        id: 1,
        creator: 'GXYZ...',
        status: 'open',
        ticket_price: '1000000',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 50,
        end_time: '2024-06-20T14:00:00Z',
        winner: null,
        prize_amount: null,
        created_ledger: 12345,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
      };

      const result = mergeRaffleData(metadata, indexerData);
      const freshness = result.freshness;

      expect(freshness.indexedAt).toBe('2024-06-15T14:00:00Z');
      expect(freshness.sourceUpdatedAt).toBe('2024-06-15T14:10:00Z');
      expect(freshness.ledger).toBe(12345);
      expect(freshness.staleness?.metadataNewer).toBe(true);
      expect(freshness.staleness?.minutesOld).toBe(10);
    });

    it('omits warning when both sources healthy', () => {
      const metadata: RaffleMetadata = {
        raffle_id: 1,
        title: 'Test',
        description: 'Test',
        image_url: null,
        image_urls: null,
        category: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
        updated_at: '2024-06-15T14:00:00Z',
        deleted_at: null,
      };

      const indexerData: IndexerRaffleData = {
        id: 1,
        creator: 'GXYZ...',
        status: 'open',
        ticket_price: '1000000',
        asset: 'XLM',
        max_tickets: 100,
        tickets_sold: 50,
        end_time: '2024-06-20T14:00:00Z',
        winner: null,
        prize_amount: null,
        created_ledger: 12345,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: '2024-06-15T14:00:00Z',
      };

      const result = mergeRaffleData(metadata, indexerData);

      expect(result.freshness.warning).toBeUndefined();
    });
  });
});
