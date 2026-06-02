import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataService, RaffleMetadataSchema, SafeRaffleMetadataSchema } from './metadataService';
import { supabase } from '../config/supabase';
import type { RaffleMetadata } from '../types/types';

vi.mock('../config/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  },
  RAFFLE_METADATA_TABLE: 'raffle_metadata',
}));

describe('MetadataService', () => {
  const validMetadata: RaffleMetadata = {
    title: 'Test Raffle',
    description: 'Test Description',
    image: 'https://example.com/image.png',
    prizeName: '100 XLM',
    prizeValue: '100',
    prizeCurrency: 'XLM',
    category: 'Crypto',
    tags: ['test'],
    createdBy: 'GDTEST...',
    createdAt: 1234567890,
    updatedAt: 1234567890,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Validation', () => {
    it('validates correct metadata', () => {
      expect(() => RaffleMetadataSchema.parse(validMetadata)).not.toThrow();
    });

    it('throws on invalid metadata for upload', () => {
      const invalidMetadata = { ...validMetadata, title: '' }; // Title is required
      expect(() => RaffleMetadataSchema.parse(invalidMetadata)).toThrow();
    });

    it('provides safe fallbacks for invalid remote metadata', () => {
      const invalidRemoteData = {
        title: 123, // Invalid type
        // missing description
        image: 'not-a-url-but-string-is-ok', 
      };

      const parsed = SafeRaffleMetadataSchema.parse(invalidRemoteData);
      expect(parsed.title).toBe('Unknown Raffle');
      expect(parsed.description).toBe('Metadata could not be loaded');
      expect(parsed.image).toBe('not-a-url-but-string-is-ok');
      expect(parsed.prizeName).toBe('Unknown Prize');
      expect(parsed.prizeCurrency).toBe('XLM');
    });
  });

  describe('uploadRaffleMetadata', () => {
    it('validates and uploads valid metadata', async () => {
      const mockInsert = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null });

      (supabase.from as any).mockReturnValue({
        insert: mockInsert,
      });
      mockInsert.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ single: mockSingle });

      const id = await MetadataService.uploadRaffleMetadata(validMetadata);
      expect(id).toBe('test-id');
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: validMetadata,
        }),
      ]);
    });

    it('throws error if metadata is invalid before calling supabase', async () => {
      const invalidMetadata = { ...validMetadata, title: '' } as RaffleMetadata;
      const mockInsert = vi.fn();
      (supabase.from as any).mockReturnValue({ insert: mockInsert });

      await expect(MetadataService.uploadRaffleMetadata(invalidMetadata)).rejects.toThrow();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
