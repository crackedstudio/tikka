import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { StorageService } from '../../../services/storage.service';
import { MAX_UPLOAD_BYTES } from '../../../config/upload.config';

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
    storageService = {
      uploadRaffleImage: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/42/addr/uuid.png',
        path: '42/addr/uuid.png',
        bucket: 'raffle-images',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RafflesController],
      providers: [
        { provide: RafflesService, useValue: {} },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    controller = module.get<RafflesController>(RafflesController);
  });

  it('uploads a valid image and returns URL', async () => {
    const file = createMockFile();
    const request = createMockRequest(file);

    const result = await controller.uploadImage(request, 'GABC123');

    expect(result).toEqual({ url: 'https://cdn.example.com/42/addr/uuid.png' });
    expect(storageService.uploadRaffleImage).toHaveBeenCalledWith({
      fileBuffer: expect.any(Buffer),
      mimeType: 'image/png',
      raffleId: 'draft',
      uploaderId: 'GABC123',
    });
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

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws PayloadTooLargeException when file exceeds max size', async () => {
    const oversizedBuffer = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    const file = createMockFile({ buffer: oversizedBuffer });
    const request = createMockRequest(file);

    await expect(controller.uploadImage(request, 'GABC123')).rejects.toThrow(
      PayloadTooLargeException,
    );
  });
});
