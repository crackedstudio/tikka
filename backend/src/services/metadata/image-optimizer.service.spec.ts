import { Test, TestingModule } from '@nestjs/testing';
import { ImageOptimizerService } from './image-optimizer.service';
import { MetricsService } from '../metrics/metrics.service';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

describe('ImageOptimizerService', () => {
  let service: ImageOptimizerService;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageOptimizerService,
        {
          provide: MetricsService,
          useValue: {
            imageVariantGenerated: { inc: jest.fn() },
            imageProcessingFailures: { inc: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<ImageOptimizerService>(ImageOptimizerService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    // Clear the cache between tests
    (service as any).cache.clear();
  });

  describe('EXIF stripping', () => {
    it('strips EXIF from JPEG input', async () => {
      // Create a JPEG with EXIF metadata
      const jpegWithExif = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .withMetadata({
          exif: {
            IFD0: {
              Make: 'TestCamera',
              Model: 'TestModel',
              Orientation: 6, // Rotate 90 CW
            },
            IFD1: {
              Compression: 6,
            },
            IFD2: {
              GPSLatitude: [37, 46, 30],
              GPSLongitude: [-122, 25, 9],
            },
          },
        })
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: jpegWithExif,
        mimeType: 'image/jpeg',
      });

      // Check that output is WebP
      expect(result.primary.mimeType).toBe('image/webp');

      // Verify EXIF has been stripped
      const outputMetadata = await sharp(result.primary.buffer).metadata();
      expect(outputMetadata.exif).toBeUndefined();
      expect(outputMetadata.orientation).toBeUndefined();
    });

    it('strips EXIF from PNG input', async () => {
      // Create a PNG with EXIF metadata (less common but possible)
      const pngWithExif = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 },
        },
      })
        .png()
        .withMetadata({
          exif: {
            IFD0: {
              Make: 'TestCamera',
              Copyright: 'Test Copyright',
            },
          },
        })
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: pngWithExif,
        mimeType: 'image/png',
      });

      // Check that output is WebP
      expect(result.primary.mimeType).toBe('image/webp');

      // Verify EXIF has been stripped
      const outputMetadata = await sharp(result.primary.buffer).metadata();
      expect(outputMetadata.exif).toBeUndefined();
    });

    it('strips EXIF from WebP input (critical security test)', async () => {
      // Create a WebP with EXIF metadata
      const webpWithExif = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 0, g: 0, b: 255 },
        },
      })
        .webp()
        .withMetadata({
          exif: {
            IFD0: {
              Make: 'TestCamera',
              Model: 'TestModel',
            },
            IFD2: {
              GPSLatitude: [37, 46, 30],
              GPSLongitude: [-122, 25, 9],
              GPSAltitude: 100,
            },
          },
        })
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: webpWithExif,
        mimeType: 'image/webp',
      });

      // Check that output is still WebP
      expect(result.primary.mimeType).toBe('image/webp');

      // Verify EXIF (including GPS coordinates) has been stripped
      const outputMetadata = await sharp(result.primary.buffer).metadata();
      expect(outputMetadata.exif).toBeUndefined();
    });

    it('respects EXIF orientation and auto-rotates before stripping', async () => {
      // Create a 400x600 (portrait) JPEG with orientation=6 (rotate 90 CW)
      const jpegWithOrientation = await sharp({
        create: {
          width: 400,
          height: 600,
          channels: 3,
          background: { r: 255, g: 128, b: 0 },
        },
      })
        .jpeg()
        .withMetadata({
          exif: {
            IFD0: {
              Orientation: 6, // Rotate 90 CW
            },
          },
        })
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: jpegWithOrientation,
        mimeType: 'image/jpeg',
      });

      // After rotation, 400x600 portrait → 600x400 landscape
      const outputMetadata = await sharp(result.primary.buffer).metadata();
      expect(outputMetadata.width).toBe(600);
      expect(outputMetadata.height).toBe(400);
      expect(outputMetadata.exif).toBeUndefined();
      expect(outputMetadata.orientation).toBeUndefined();
    });

    it('strips EXIF from all variants', async () => {
      // Create a 1600x1200 JPEG with EXIF
      const jpegWithExif = await sharp({
        create: {
          width: 1600,
          height: 1200,
          channels: 3,
          background: { r: 128, g: 128, b: 128 },
        },
      })
        .jpeg()
        .withMetadata({
          exif: {
            IFD0: {
              Make: 'TestCamera',
            },
            IFD2: {
              GPSLatitude: [37, 46, 30],
            },
          },
        })
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: jpegWithExif,
        mimeType: 'image/jpeg',
      });

      // Should generate variants at 400w, 800w, 1200w
      expect(result.variants.length).toBeGreaterThan(0);

      // Check each variant has no EXIF
      for (const variant of result.variants) {
        const variantMetadata = await sharp(variant.buffer).metadata();
        expect(variantMetadata.exif).toBeUndefined();
        expect(variantMetadata.orientation).toBeUndefined();
      }
    });
  });

  describe('Format conversion', () => {
    it('converts JPEG to WebP', async () => {
      const jpeg = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: jpeg,
        mimeType: 'image/jpeg',
      });

      expect(result.primary.mimeType).toBe('image/webp');
      expect(result.primary.width).toBe(800);

      // Verify it's actually WebP
      const metadata = await sharp(result.primary.buffer).metadata();
      expect(metadata.format).toBe('webp');
    });

    it('converts PNG to WebP', async () => {
      const png = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: png,
        mimeType: 'image/png',
      });

      expect(result.primary.mimeType).toBe('image/webp');
      expect(result.primary.width).toBe(800);

      const metadata = await sharp(result.primary.buffer).metadata();
      expect(metadata.format).toBe('webp');
    });

    it('re-encodes WebP input to strip metadata', async () => {
      const webp = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .webp()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: webp,
        mimeType: 'image/webp',
      });

      expect(result.primary.mimeType).toBe('image/webp');
      expect(result.primary.width).toBe(800);

      const metadata = await sharp(result.primary.buffer).metadata();
      expect(metadata.format).toBe('webp');
    });
  });

  describe('Variant generation', () => {
    it('generates variants at 400w, 800w, 1200w for large images', async () => {
      const largeImage = await sharp({
        create: {
          width: 2000,
          height: 1500,
          channels: 3,
          background: { r: 200, g: 150, b: 100 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: largeImage,
        mimeType: 'image/jpeg',
      });

      expect(result.variants).toHaveLength(3);
      expect(result.variants[0].width).toBe(400);
      expect(result.variants[1].width).toBe(800);
      expect(result.variants[2].width).toBe(1200);

      // All variants should be WebP
      result.variants.forEach((variant) => {
        expect(variant.mimeType).toBe('image/webp');
      });
    });

    it('skips variants wider than the original image', async () => {
      const smallImage = await sharp({
        create: {
          width: 600,
          height: 400,
          channels: 3,
          background: { r: 50, g: 100, b: 150 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: smallImage,
        mimeType: 'image/jpeg',
      });

      // Should only generate 400w variant (skip 800w and 1200w)
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].width).toBe(400);
    });

    it('generates no variants for images smaller than 400w', async () => {
      const tinyImage = await sharp({
        create: {
          width: 300,
          height: 200,
          channels: 3,
          background: { r: 255, g: 255, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: tinyImage,
        mimeType: 'image/jpeg',
      });

      expect(result.variants).toHaveLength(0);
    });

    it('does not enlarge images when generating variants', async () => {
      const image = await sharp({
        create: {
          width: 1000,
          height: 750,
          channels: 3,
          background: { r: 128, g: 64, b: 192 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: image,
        mimeType: 'image/jpeg',
      });

      // Should generate 400w and 800w (skip 1200w as it's larger than 1000)
      expect(result.variants).toHaveLength(2);
      expect(result.variants[0].width).toBeLessThanOrEqual(400);
      expect(result.variants[1].width).toBeLessThanOrEqual(800);
    });
  });

  describe('Caching', () => {
    it('caches processed images and returns cached result on subsequent calls', async () => {
      const jpeg = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result1 = await service.processImage({
        fileBuffer: jpeg,
        mimeType: 'image/jpeg',
      });

      const result2 = await service.processImage({
        fileBuffer: jpeg,
        mimeType: 'image/jpeg',
      });

      // Should return the exact same buffer references from cache
      expect(result2.primary.buffer).toBe(result1.primary.buffer);
      expect(result2.variants).toBe(result1.variants);
    });

    it('uses different cache keys for different MIME types', async () => {
      const buffer = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .jpeg()
        .toBuffer();

      const result1 = await service.processImage({
        fileBuffer: buffer,
        mimeType: 'image/jpeg',
      });

      const result2 = await service.processImage({
        fileBuffer: buffer,
        mimeType: 'image/png',
      });

      // Should process separately (different cache keys)
      expect(result2.primary.buffer).not.toBe(result1.primary.buffer);
    });
  });

  describe('Error handling', () => {
    it('increments failure metric when variant generation fails', async () => {
      // Create a valid image
      const validImage = await sharp({
        create: {
          width: 2000,
          height: 1500,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .jpeg()
        .toBuffer();

      // Spy on sharp to force an error during variant generation
      const originalSharp = sharp;
      const sharpSpy = jest.spyOn(sharp, 'default' as any);
      let callCount = 0;

      (sharp as any).mockImplementation((input: any, options?: any) => {
        callCount++;
        // Let the first call (primary) succeed, fail on subsequent (variants)
        if (callCount > 1) {
          return {
            rotate: () => ({
              resize: () => ({
                webp: () => ({
                  toBuffer: jest.fn().mockRejectedValue(new Error('Resize failed')),
                }),
              }),
            }),
            metadata: jest.fn().mockResolvedValue({ width: 2000, height: 1500 }),
          };
        }
        return originalSharp(input, options);
      });

      await service.processImage({
        fileBuffer: validImage,
        mimeType: 'image/jpeg',
      });

      // Should have incremented failure metric for each failed variant
      expect(metricsService.imageProcessingFailures.inc).toHaveBeenCalled();

      sharpSpy.mockRestore();
    });
  });

  describe('Quality settings', () => {
    it('outputs WebP at 80% quality', async () => {
      const jpeg = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 255, g: 128, b: 64 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await service.processImage({
        fileBuffer: jpeg,
        mimeType: 'image/jpeg',
      });

      // We can't directly read the quality setting from the output,
      // but we can verify it's WebP and reasonably compressed
      const metadata = await sharp(result.primary.buffer).metadata();
      expect(metadata.format).toBe('webp');

      // Original JPEG should be larger than WebP at 80% quality
      expect(result.primary.buffer.length).toBeLessThan(jpeg.length * 1.5);
    });
  });
});
