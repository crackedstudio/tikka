import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { RaffleImagesController } from './raffle-images.controller';
import { StorageService } from '../../../services/storage.service';
import { ImageOptimizerService } from '../../../services/image-optimizer.service';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_IMAGE_HEIGHT,
  MAX_UPLOAD_IMAGE_WIDTH,
} from '../../../config/upload.config';
import sharp from 'sharp';

const mockFileTypeFromBuffer = jest.fn();

jest.mock('file-type', () => ({
  fromBuffer: (...args: unknown[]) => mockFileTypeFromBuffer(...args),
}));

jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockSharp = sharp as unknown as jest.Mock;

function createMockFile(
  overrides: {
    mimetype?: string;
    buffer?: Buffer;
    fields?: Record<string, unknown>;
  } = {},
) {
  const buffer = overrides.buffer ?? Buffer.from('fake-image-data');
  return {
    mimetype: overrides.mimetype ?? 'image/png',
    toBuffer: jest.fn().mockResolvedValue(buffer),
    fields: overrides.fields ?? {},
  };
}

function createMockRequest(file: ReturnType<typeof createMockFile> | null) {
  return { file: jest.fn().mockResolvedValue(file) } as any;
}

describe('RaffleImagesController — uploadImage', () => {
  let controller: RaffleImagesController;
  let storageService: { uploadRaffleImage: jest.Mock };

  beforeEach(async () => {
    mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' } as any);
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 1200, height: 800 }),
    });
    storageService = {
      uploadRaffleImage: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/42/addr/uuid.webp',
        path: '42/addr/uuid.webp',
        bucket: 'raffle-images',
        variantUrls: [
          'https://cdn.example.com/42/addr/uuid-400w.webp',
          'https://cdn.example.com/42/addr/uuid-800w.webp',
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaffleImagesController],
      providers: [
        { provide: StorageService, useValue: storageService },
        { provide: ImageOptimizerService, useValue: {} },
      ],
    }).compile();

    controller = module.get<RaffleImagesController>(RaffleImagesController);
  });

  it('uploads a valid image and returns URL', async () => {
    const file = createMockFile();
    const request = createMockRequest(file);

    const result = await controller.uploadImage(request, 'GABC123');

    expect(result).toEqual({
      url: 'https://cdn.example.com/42/addr/uuid.webp',
      variantUrls: [
        'https://cdn.example.com/42/addr/uuid-400w.webp',
        'https://cdn.example.com/42/addr/uuid-800w.webp',
      ],
    });
    expect(storageService.uploadRaffleImage).toHaveBeenCalledWith({
      fileBuffer: expect.any(Buffer),
      mimeType: 'image/png',
      raffleId: 'draft',
      uploaderId: 'GABC123',
    });
  });

  it.each([
    ['image/jpeg', 'image/jpeg'],
    ['image/png', 'image/png'],
    ['image/webp', 'image/webp'],
  ] as const)('accepts %s uploads based on detected MIME type', async (mimeType, detectedMimeType) => {
    mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: detectedMimeType, ext: detectedMimeType.split('/')[1] } as any);

    const file = createMockFile({ mimetype: 'application/octet-stream' });
    const request = createMockRequest(file);

    await controller.uploadImage(request, 'GABC123');

    expect(storageService.uploadRaffleImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType }),
    );
  });

  it('includes variantUrls in the upload response', async () => {
    const file = createMockFile();
    const request = createMockRequest(file);

    const result = await controller.uploadImage(request, 'GABC123');

    expect(result).toHaveProperty('variantUrls');
    expect(Array.isArray(result.variantUrls)).toBe(true);
    expect(result.variantUrls).toEqual([
      'https://cdn.example.com/42/addr/uuid-400w.webp',
      'https://cdn.example.com/42/addr/uuid-800w.webp',
    ]);
  });

  it('returns empty variantUrls array when no variants were generated', async () => {
    storageService.uploadRaffleImage.mockResolvedValueOnce({
      url: 'https://cdn.example.com/42/addr/uuid.webp',
      path: '42/addr/uuid.webp',
      bucket: 'raffle-images',
      variantUrls: [],
    });

    const file = createMockFile();
    const request = createMockRequest(file);

    const result = await controller.uploadImage(request, 'GABC123');

    expect(result.variantUrls).toEqual([]);
  });

  it('extracts raffleId from multipart fields', async () => {
    const file = createMockFile({
      fields: { raffleId: { value: '99' } },
    });
    const request = createMockRequest(file);

    await controller.uploadImage(request, 'GABC123');

    expect(storageService.uploadRaffleImage).toHaveBeenCalledWith(
      expect.objectContaining({ raffleId: '99' }),
    );
  });

  it('defaults raffleId to "draft" when field is missing', async () => {
    const file = createMockFile({ fields: {} });
    const request = createMockRequest(file);

    await controller.uploadImage(request, 'GABC123');

    expect(storageService.uploadRaffleImage).toHaveBeenCalledWith(
      expect.objectContaining({ raffleId: 'draft' }),
    );
  });

  it('throws BadRequestException when no file is provided', async () => {
    const request = createMockRequest(null);

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for unsupported MIME type', async () => {
    const file = createMockFile({ mimetype: 'application/pdf' });
    const request = createMockRequest(file);

    mockFileTypeFromBuffer.mockResolvedValueOnce(null as any);

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when the detected MIME type is not allowed', async () => {
    const file = createMockFile({ mimetype: 'image/jpeg' });
    const request = createMockRequest(file);

    mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'text/plain', ext: 'txt' } as any);

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      BadRequestException,
    );
    expect(storageService.uploadRaffleImage).not.toHaveBeenCalled();
  });

  it('throws PayloadTooLargeException when file exceeds max size', async () => {
    const oversizedBuffer = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    const file = createMockFile({ buffer: oversizedBuffer });
    const request = createMockRequest(file);

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      PayloadTooLargeException,
    );
    expect(storageService.uploadRaffleImage).not.toHaveBeenCalled();
  });

  it('throws PayloadTooLargeException when multipart rejects an oversized file', async () => {
    const request = {
      file: jest.fn().mockRejectedValue(
        Object.assign(new Error('request file too large'), {
          code: 'FST_REQ_FILE_TOO_LARGE',
          statusCode: 413,
        }),
      ),
    } as any;

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      PayloadTooLargeException,
    );
    expect(storageService.uploadRaffleImage).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when image dimensions exceed max limits', async () => {
    mockSharp.mockReturnValueOnce({
      metadata: jest.fn().mockResolvedValue({
        width: MAX_UPLOAD_IMAGE_WIDTH + 1,
        height: MAX_UPLOAD_IMAGE_HEIGHT,
      }),
    });
    const file = createMockFile();
    const request = createMockRequest(file);

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      BadRequestException,
    );
    expect(storageService.uploadRaffleImage).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when image metadata cannot be read', async () => {
    mockSharp.mockReturnValueOnce({
      metadata: jest.fn().mockRejectedValue(new Error('bad image')),
    });
    const file = createMockFile();
    const request = createMockRequest(file);

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      BadRequestException,
    );
    expect(storageService.uploadRaffleImage).not.toHaveBeenCalled();
  });
});
