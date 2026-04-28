import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { StorageService } from './storage.service';
import { ImageOptimizerService } from './image-optimizer.service';
import { SUPABASE_CLIENT } from './supabase.provider';
import { RAFFLE_IMAGE_BUCKET } from '../config/upload.config';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockGetPublicUrl = jest.fn();

const mockSupabase = {
  storage: {
    from: jest.fn(() => ({
      upload: mockUpload,
      remove: mockRemove,
      getPublicUrl: mockGetPublicUrl,
    })),
  },
};

// Default mock: optimizer returns primary WebP + no variants
const mockProcessImage = jest.fn();

const mockImageOptimizerService = {
  processImage: mockProcessImage,
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default optimizer behaviour: return primary WebP, no variants
    mockProcessImage.mockResolvedValue({
      primary: { buffer: Buffer.from('webp-data'), width: 800, mimeType: 'image/webp' },
      variants: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: SUPABASE_CLIENT, useValue: mockSupabase },
        { provide: ImageOptimizerService, useValue: mockImageOptimizerService },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  describe('uploadRaffleImage', () => {
    const input = {
      fileBuffer: Buffer.from('fake-image'),
      mimeType: 'image/png' as const,
      raffleId: '42',
      uploaderId: 'GABC123',
    };

    it('uploads primary WebP and returns public URL with empty variantUrls when no variants', async () => {
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid.webp' },
      });

      const result = await service.uploadRaffleImage(input);

      expect(mockSupabase.storage.from).toHaveBeenCalledWith(RAFFLE_IMAGE_BUCKET);
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^42\/GABC123\/[a-f0-9-]+\.webp$/),
        Buffer.from('webp-data'),
        { contentType: 'image/webp', upsert: false },
      );
      expect(result.url).toBe('https://cdn.example.com/42/GABC123/uuid.webp');
      expect(result.bucket).toBe(RAFFLE_IMAGE_BUCKET);
      expect(result.path).toMatch(/^42\/GABC123\/[a-f0-9-]+\.webp$/);
      expect(result.variantUrls).toEqual([]);
    });

    it('uploads variants and returns their public URLs', async () => {
      mockProcessImage.mockResolvedValue({
        primary: { buffer: Buffer.from('webp-primary'), width: 1600, mimeType: 'image/webp' },
        variants: [
          { buffer: Buffer.from('webp-400'), width: 400, mimeType: 'image/webp' },
          { buffer: Buffer.from('webp-800'), width: 800, mimeType: 'image/webp' },
        ],
      });

      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl
        .mockReturnValueOnce({ data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid-400w.webp' } })
        .mockReturnValueOnce({ data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid-800w.webp' } })
        .mockReturnValueOnce({ data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid.webp' } });

      const result = await service.uploadRaffleImage(input);

      // 2 variant uploads + 1 primary upload = 3 total
      expect(mockUpload).toHaveBeenCalledTimes(3);

      // Variant paths use the same uuid as the primary
      const variantCall400 = mockUpload.mock.calls[0];
      const variantCall800 = mockUpload.mock.calls[1];
      expect(variantCall400[0]).toMatch(/^42\/GABC123\/[a-f0-9-]+-400w\.webp$/);
      expect(variantCall800[0]).toMatch(/^42\/GABC123\/[a-f0-9-]+-800w\.webp$/);

      // Extract uuid from primary path and verify variants share it
      const primaryPath = mockUpload.mock.calls[2][0] as string;
      const uuidMatch = primaryPath.match(/([a-f0-9-]+)\.webp$/);
      expect(uuidMatch).not.toBeNull();
      const uuid = uuidMatch![1];
      expect(variantCall400[0]).toBe(`42/GABC123/${uuid}-400w.webp`);
      expect(variantCall800[0]).toBe(`42/GABC123/${uuid}-800w.webp`);

      expect(result.variantUrls).toHaveLength(2);
      expect(result.variantUrls[0]).toBe('https://cdn.example.com/42/GABC123/uuid-400w.webp');
      expect(result.variantUrls[1]).toBe('https://cdn.example.com/42/GABC123/uuid-800w.webp');
    });

    it('falls back to original buffer when optimizer throws, returns variantUrls: []', async () => {
      mockProcessImage.mockRejectedValue(new Error('Sharp native binding failed'));

      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid.png' },
      });

      const result = await service.uploadRaffleImage(input);

      // Should upload the original buffer with original mime type
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^42\/GABC123\/[a-f0-9-]+\.png$/),
        input.fileBuffer,
        { contentType: 'image/png', upsert: false },
      );
      expect(result.variantUrls).toEqual([]);
    });

    it('skips failed variant uploads and continues', async () => {
      mockProcessImage.mockResolvedValue({
        primary: { buffer: Buffer.from('webp-primary'), width: 1600, mimeType: 'image/webp' },
        variants: [
          { buffer: Buffer.from('webp-400'), width: 400, mimeType: 'image/webp' },
          { buffer: Buffer.from('webp-800'), width: 800, mimeType: 'image/webp' },
        ],
      });

      // First variant upload fails, second succeeds, primary succeeds
      mockUpload
        .mockResolvedValueOnce({ error: { message: 'Variant upload failed' } })
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: null });

      mockGetPublicUrl
        .mockReturnValueOnce({ data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid-800w.webp' } })
        .mockReturnValueOnce({ data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid.webp' } });

      const result = await service.uploadRaffleImage(input);

      // Only the successful variant URL is included
      expect(result.variantUrls).toHaveLength(1);
      expect(result.variantUrls[0]).toBe('https://cdn.example.com/42/GABC123/uuid-800w.webp');
    });

    it('sanitizes path segments', async () => {
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://x.com/img' } });

      await service.uploadRaffleImage({
        ...input,
        raffleId: '../etc/passwd',
        uploaderId: 'user<script>',
      });

      const uploadPath = mockUpload.mock.calls[0][0] as string;
      expect(uploadPath).not.toContain('..');
      expect(uploadPath).not.toContain('<');
      // After sanitization: ../etc/passwd → etcpasswd, user<script> → userscript
      expect(uploadPath).toMatch(/^etcpasswd\/userscript\/[a-f0-9-]+\.webp$/);
    });

    it('falls back to "unknown" for empty path segments', async () => {
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://x.com/img' } });

      await service.uploadRaffleImage({
        ...input,
        raffleId: '////',
        uploaderId: '   ',
      });

      const uploadPath = mockUpload.mock.calls[0][0] as string;
      expect(uploadPath).toMatch(/^unknown\/unknown\/[a-f0-9-]+\.webp$/);
    });

    it('throws InternalServerErrorException on primary upload failure', async () => {
      mockUpload.mockResolvedValue({ error: { message: 'Bucket not found' } });

      await expect(service.uploadRaffleImage(input)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('deleteRaffleImage', () => {
    it('deletes file by path', async () => {
      mockRemove.mockResolvedValue({ error: null });

      await service.deleteRaffleImage('42/GABC123/some-uuid.png');

      expect(mockSupabase.storage.from).toHaveBeenCalledWith(RAFFLE_IMAGE_BUCKET);
      expect(mockRemove).toHaveBeenCalledWith(['42/GABC123/some-uuid.png']);
    });

    it('throws InternalServerErrorException on delete failure', async () => {
      mockRemove.mockResolvedValue({ error: { message: 'Not found' } });

      await expect(
        service.deleteRaffleImage('42/GABC123/some-uuid.png'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
