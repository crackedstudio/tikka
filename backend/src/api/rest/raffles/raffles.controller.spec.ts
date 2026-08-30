import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { StorageService } from '../../../services/storage.service';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { MetadataRedisService } from '../../../services/metadata-redis.service';
import { SseService } from '../../../services/sse.service';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_IMAGE_HEIGHT,
  MAX_UPLOAD_IMAGE_WIDTH,
} from '../../../config/upload.config';
import * as fileType from 'file-type';
import sharp from 'sharp';

jest.mock('file-type', () => ({
  fromBuffer: jest.fn(),
}));

jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockFileTypeFromBuffer = fileType.fromBuffer as jest.MockedFunction<typeof fileType.fromBuffer>;
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

describe('RafflesController — uploadImage', () => {
  let controller: RafflesController;
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
      controllers: [RafflesController],
      providers: [
        { provide: RafflesService, useValue: {} },
        { provide: StorageService, useValue: storageService },
        { provide: IdempotencyService, useValue: { get: jest.fn(), lock: jest.fn(), resolve: jest.fn() } },
        { provide: SseService, useValue: {} },
        { provide: MetadataRedisService, useValue: { isEnabled: jest.fn().mockReturnValue(false), get: jest.fn(), setEx: jest.fn() } },
      ],
    }).compile();

    controller = module.get<RafflesController>(RafflesController);
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

import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

describe('IdempotencyInterceptor — upsertMetadata idempotency', () => {
  let interceptor: IdempotencyInterceptor;
  let idempotencyService: {
    get: jest.Mock;
    lock: jest.Mock;
    resolve: jest.Mock;
  };

  beforeEach(() => {
    idempotencyService = {
      get: jest.fn().mockResolvedValue(null),
      lock: jest.fn().mockResolvedValue(true),
      resolve: jest.fn().mockResolvedValue(undefined),
    };

    interceptor = new IdempotencyInterceptor(idempotencyService as any);
  });

  function createMockContext(idempotencyKey?: string, walletAddress = 'GABC123') {
    const req = {
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
      user: { address: walletAddress },
    };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it('processes the first request and caches the response', (done) => {
    const ctx = createMockContext('key-1');
    const handler = { handle: () => of({ raffleId: 42, title: 'Test Raffle' }) };

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual({ raffleId: 42, title: 'Test Raffle' });
        expect(idempotencyService.get).toHaveBeenCalledWith('GABC123', 'key-1');
        expect(idempotencyService.lock).toHaveBeenCalledWith('GABC123', 'key-1');
        expect(idempotencyService.resolve).toHaveBeenCalledWith('GABC123', 'key-1', { raffleId: 42, title: 'Test Raffle' });
        done();
      },
    });
  });

  it('returns cached response for duplicate request with same Idempotency-Key', (done) => {
    const cachedResponse = { raffleId: 42, title: 'Test Raffle' };
    idempotencyService.get.mockResolvedValueOnce({ status: 'done', response: cachedResponse });

    const ctx = createMockContext('key-1');
    const handler = { handle: jest.fn().mockReturnValue(of({ raffleId: 42 })) };

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual(cachedResponse);
        expect(handler.handle).not.toHaveBeenCalled();
        expect(idempotencyService.lock).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('does not call service method twice for same Idempotency-Key', (done) => {
    const cachedResponse = { raffleId: 42, title: 'Test Raffle' };
    idempotencyService.get.mockResolvedValueOnce({ status: 'done', response: cachedResponse });

    const ctx = createMockContext('key-1');
    const handler = { handle: jest.fn() };

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual(cachedResponse);
        expect(handler.handle).not.toHaveBeenCalled();
        done();
      },
    });
  });
});

