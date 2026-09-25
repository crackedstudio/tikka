import sharp from 'sharp';
import { MAX_UPLOAD_BYTES } from '../../config/upload.config';
import { MetricsService } from '../metrics/metrics.service';
import { ImageOptimizerService } from './image-optimizer.service';

describe('ImageOptimizerService', () => {
  let service: ImageOptimizerService;
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
    service = new ImageOptimizerService(metrics);
  });

  it('converts a valid image and produces only variants within its width', async () => {
    const input = await sharp({
      create: { width: 800, height: 2, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();

    const result = await service.processImage({ fileBuffer: input, mimeType: 'image/png' });

    expect(result.primary.mimeType).toBe('image/webp');
    expect(result.primary.width).toBe(800);
    expect(result.variants.map((variant) => variant.width)).toEqual([400, 800]);
    expect((await sharp(result.primary.buffer).metadata()).format).toBe('webp');
  });

  it('rejects oversized input before decoding it', async () => {
    await expect(
      service.processImage({
        fileBuffer: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('Image exceeds the 5 MB upload limit');
  });

  it('rejects an unsupported MIME type even if the bytes are a valid image', async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();

    await expect(
      service.processImage({ fileBuffer: png, mimeType: 'image/gif' }),
    ).rejects.toThrow('Unsupported image format');
  });

  it('rejects corrupt image bytes without caching a result', async () => {
    const corrupt = Buffer.from('not an image');

    await expect(
      service.processImage({ fileBuffer: corrupt, mimeType: 'image/jpeg' }),
    ).rejects.toThrow();
    await expect(
      service.processImage({ fileBuffer: corrupt, mimeType: 'image/jpeg' }),
    ).rejects.toThrow();
  });
});
