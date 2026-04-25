import { Injectable, Logger } from '@nestjs/common';
import * as sharp from 'sharp';
import { AllowedUploadMimeType } from '../config/upload.config';

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

  async processImage(input: ProcessImageInput): Promise<ProcessImageResult> {
    const { fileBuffer, mimeType } = input;

    // WebP inputs are passed through without re-encoding
    if (mimeType === 'image/webp') {
      const metadata = await sharp(fileBuffer).metadata();
      const originalWidth = metadata.width ?? 0;

      const variants = await this.generateVariants(fileBuffer, originalWidth);

      return {
        primary: {
          buffer: fileBuffer,
          width: originalWidth,
          mimeType: 'image/webp',
        },
        variants,
      };
    }

    // JPEG/PNG: convert to WebP at quality 80
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();
    const originalWidth = metadata.width ?? 0;

    const primaryBuffer = await sharp(fileBuffer)
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const variants = await this.generateVariants(fileBuffer, originalWidth);

    return {
      primary: {
        buffer: primaryBuffer,
        width: originalWidth,
        mimeType: 'image/webp',
      },
      variants,
    };
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
          mimeType: 'image/webp',
        });
      } catch (err) {
        this.logger.error(
          `Failed to generate ${targetWidth}w variant: ${(err as Error).message}`,
        );
        throw err;
      }
    }

    return variants;
  }
}
