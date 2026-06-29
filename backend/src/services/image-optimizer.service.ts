import { Injectable, Logger } from '@nestjs/common';
import * as sharp from 'sharp';
import { AllowedUploadMimeType } from '../config/upload.config';
import * as crypto from 'crypto';
import { MetricsService } from './metrics.service';

export interface ImageVariant {
  buffer: Buffer;
  width: number; // actual output width in pixels
  mimeType: 'image/webp';
}

export interface ProcessImageResult {
  primary: ImageVariant; // full-size WebP (or original if conversion fails)
  variants: ImageVariant[]; // 400w, 800w, 1200w (only those <= original width)
}

export interface ProcessImageInput {
  fileBuffer: Buffer;
  mimeType: AllowedUploadMimeType | string; // 'image/jpeg' | 'image/png' | 'image/webp'
}

const TARGET_WIDTHS = [400, 800, 1200] as const;
const WEBP_QUALITY = 80;

@Injectable()
export class ImageOptimizerService {
  private readonly logger = new Logger(ImageOptimizerService.name);
  // Simple in-memory cache for processed images
  private readonly cache = new Map<string, { primary: ImageVariant; variants: ImageVariant[] }>();

  // Generate deterministic cache key based on source buffer hash, requested transformations
  private generateCacheKey(buffer: Buffer, mimeType: string): string {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    // Include mimeType to differentiate between source formats
    return `${hash}:${mimeType}`;
  }

  constructor(private readonly metricsService: MetricsService) {}

  public async processImage(input: ProcessImageInput): Promise<ProcessImageResult> {
    const { fileBuffer, mimeType } = input;

    // Check cache first
    const cacheKey = this.generateCacheKey(fileBuffer, mimeType);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`ImageCache hit for key ${cacheKey}`);
      return cached;
    }
    this.logger.debug(`ImageCache miss for key ${cacheKey}`);

    // WebP inputs are passed through without re-encoding
    if (mimeType === 'image/webp') {
      const metadata = await sharp(fileBuffer).metadata();
      const originalWidth = metadata.width ?? 0;

      const variants = await this.generateVariants(fileBuffer, originalWidth);

      const result = {
        primary: {
          buffer: fileBuffer,
          width: originalWidth,
          mimeType: 'image/webp' as const,
        },
        variants,
      };
      // Store in cache
      this.cache.set(cacheKey, result);
      return result;
    }

    // JPEG/PNG: convert to WebP at quality 80
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();
    const originalWidth = metadata.width ?? 0;

    const primaryBuffer = await sharp(fileBuffer)
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const variants = await this.generateVariants(fileBuffer, originalWidth);

    const result = {
      primary: {
        buffer: primaryBuffer,
        width: originalWidth,
        mimeType: 'image/webp' as const,
      },
      variants,
    };
    // Store in cache
    this.cache.set(cacheKey, result);
    return result;
  }

  private async generateVariants(
    sourceBuffer: Buffer,
    originalWidth: number,
  ): Promise<ImageVariant[]> {
    const variants: ImageVariant[] = [];

    for (const targetWidth of TARGET_WIDTHS) {
      // Only generate variant if targetWidth <= originalWidth
      if (targetWidth > originalWidth) {
        continue;
      }

      try {
        const variantBuffer = await sharp(sourceBuffer)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();

        // Get actual output width from metadata
        const variantMeta = await sharp(variantBuffer).metadata();
        const actualWidth = variantMeta.width ?? targetWidth;

        variants.push({
          buffer: variantBuffer,
          width: actualWidth,
          mimeType: 'image/webp' as const,
        });
        this.metricsService.imageVariantGenerated.inc();
      } catch (err) {
        this.logger.warn(
          `Failed to generate ${targetWidth}w variant: ${(err as Error).message}`,
        );
        this.metricsService.imageProcessingFailures.inc();
        // Continue without throwing; fallback to original image without this variant.
      }
    }

    return variants;
  }
}
