import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { StorageService } from './storage.service';
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

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: SUPABASE_CLIENT, useValue: mockSupabase },
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

    it('uploads file and returns public URL', async () => {
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://cdn.example.com/42/GABC123/uuid.png' },
      });

      const result = await service.uploadRaffleImage(input);

      expect(mockSupabase.storage.from).toHaveBeenCalledWith(RAFFLE_IMAGE_BUCKET);
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^42\/GABC123\/[a-f0-9-]+\.png$/),
        input.fileBuffer,
        { contentType: 'image/png', upsert: false },
      );
      expect(result.url).toBe('https://cdn.example.com/42/GABC123/uuid.png');
      expect(result.bucket).toBe(RAFFLE_IMAGE_BUCKET);
      expect(result.path).toMatch(/^42\/GABC123\/[a-f0-9-]+\.png$/);
    });

    it('maps MIME types to correct extensions', async () => {
      mockUpload.mockResolvedValue({ error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://x.com/img' } });

      for (const [mime, ext] of [
        ['image/jpeg', 'jpg'],
        ['image/png', 'png'],
        ['image/webp', 'webp'],
      ] as const) {
        await service.uploadRaffleImage({ ...input, mimeType: mime });
        const uploadPath = mockUpload.mock.calls.at(-1)?.[0] as string;
        expect(uploadPath).toMatch(new RegExp(`\\.${ext}$`));
      }
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
      expect(uploadPath).toMatch(/^etcpasswd\/userscript\/[a-f0-9-]+\.png$/);
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
      expect(uploadPath).toMatch(/^unknown\/unknown\/[a-f0-9-]+\.png$/);
    });

    it('throws InternalServerErrorException on upload failure', async () => {
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
