import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  PaginationQueryDto,
  RaffleListQueryDto,
  LeaderboardQueryDto,
  TransparencyQueryDto,
} from './dto/query.dto';
import { SnapshotImportRequestDto } from './dto/snapshot.dto';
import { DlqReplayRequestDto } from './dto/dlq.dto';

describe('DTO validation — rejection tests', () => {
  describe('PaginationQueryDto', () => {
    it('should accept valid numeric limit and offset', async () => {
      const dto = plainToInstance(PaginationQueryDto, { limit: 10, offset: 5 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty query (defaults apply)', async () => {
      const dto = plainToInstance(PaginationQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-numeric limit', async () => {
      const dto = plainToInstance(PaginationQueryDto, { limit: 'abc' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative limit', async () => {
      const dto = plainToInstance(PaginationQueryDto, { limit: -1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject limit exceeding max (100)', async () => {
      const dto = plainToInstance(PaginationQueryDto, { limit: 101 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative offset', async () => {
      const dto = plainToInstance(PaginationQueryDto, { offset: -5 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('RaffleListQueryDto', () => {
    it('should accept valid status enum value', async () => {
      const dto = plainToInstance(RaffleListQueryDto, { status: 'open' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid status value', async () => {
      const dto = plainToInstance(RaffleListQueryDto, { status: 'INVALID' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept all valid status values', async () => {
      for (const status of ['open', 'drawing', 'finalized', 'cancelled']) {
        const dto = plainToInstance(RaffleListQueryDto, { status });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should accept valid creator and asset strings', async () => {
      const dto = plainToInstance(RaffleListQueryDto, {
        creator: 'GABCDEF',
        asset: 'XLM',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('LeaderboardQueryDto', () => {
    it('should accept valid leaderboard mode', async () => {
      const dto = plainToInstance(LeaderboardQueryDto, { by: 'wins' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid leaderboard mode', async () => {
      const dto = plainToInstance(LeaderboardQueryDto, { by: 'invalid_mode' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept cursor string', async () => {
      const dto = plainToInstance(LeaderboardQueryDto, { cursor: 'abc123' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept limit of 1', async () => {
      const dto = plainToInstance(LeaderboardQueryDto, { limit: 1 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept limit of 100', async () => {
      const dto = plainToInstance(LeaderboardQueryDto, { limit: 100 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject limit of 0', async () => {
      const dto = plainToInstance(LeaderboardQueryDto, { limit: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('TransparencyQueryDto', () => {
    it('should accept valid raffle_id', async () => {
      const dto = plainToInstance(TransparencyQueryDto, { raffle_id: 42 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-numeric raffle_id', async () => {
      const dto = plainToInstance(TransparencyQueryDto, { raffle_id: 'not_a_number' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept tx_hash', async () => {
      const dto = plainToInstance(TransparencyQueryDto, { tx_hash: 'abc123def' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('SnapshotImportRequestDto', () => {
    it('should accept valid filename', async () => {
      const dto = plainToInstance(SnapshotImportRequestDto, { filename: 'snapshot.json' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty filename', async () => {
      const dto = plainToInstance(SnapshotImportRequestDto, { filename: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing filename', async () => {
      const dto = plainToInstance(SnapshotImportRequestDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject non-string filename', async () => {
      const dto = plainToInstance(SnapshotImportRequestDto, { filename: 123 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('DlqReplayRequestDto', () => {
    it('should accept empty body (no ids)', async () => {
      const dto = plainToInstance(DlqReplayRequestDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid ids array', async () => {
      const dto = plainToInstance(DlqReplayRequestDto, { ids: ['id1', 'id2'] });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-array ids', async () => {
      const dto = plainToInstance(DlqReplayRequestDto, { ids: 'not_an_array' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject ids with non-string elements', async () => {
      const dto = plainToInstance(DlqReplayRequestDto, { ids: [123, 456] });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Unknown properties are handled', () => {
    it('should accept and preserve extra fields at plainToInstance level (pipe strips them)', () => {
      const dto = plainToInstance(PaginationQueryDto, {
        limit: 10,
        offset: 0,
        unknownField: 'should_be_removed',
      });
      expect(dto.limit).toBe(10);
      expect(dto.offset).toBe(0);
    });

    it('should validate correctly even with extra fields present', async () => {
      const dto = plainToInstance(RaffleListQueryDto, {
        status: 'open',
        hackerPayload: 'DROP TABLE',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate correctly with extra fields on snapshot DTO', async () => {
      const dto = plainToInstance(SnapshotImportRequestDto, {
        filename: 'test.json',
        malicious: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.filename).toBe('test.json');
    });
  });
});
