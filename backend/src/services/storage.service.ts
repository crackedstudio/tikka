import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AllowedUploadMimeType,
  RAFFLE_IMAGE_BUCKET,
} from '../config/upload.config';
import { SUPABASE_CLIENT } from './supabase.provider';
import { ImageOptimizerService } from './image-optimizer.service';

export interface UploadRaffleImageInput {
  fileBuffer: Buffer;
  mimeType: AllowedUploadMimeType;
  raffleId: string;
  uploaderId: string;
}

export interface UploadRaffleImageResult {
  url: string;
  path: string;
  bucket: string;
  variantUrls: string[];
}

const MIME_TO_EXTENSION: Record<AllowedUploadMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
    private readonly imageOptimizerService: ImageOptimizerService,
  ) {}

  async uploadRaffleImage(
    input: UploadRaffleImageInput,
  ): Promise<UploadRaffleImageResult> {
    const uuid = randomUUID();
    const raffleSegment = this.sanitizePathSegment(input.raffleId);
    const uploaderSegment = this.sanitizePathSegment(input.uploaderId);

    this.logger.log(
      `Uploading image for raffle=${raffleSegment} by=${uploaderSegment} (${input.mimeType}, ${input.fileBuffer.length} bytes)`,
    );

    // Attempt WebP conversion and variant generation
    let primaryBuffer: Buffer = input.fileBuffer;
    let primaryMimeType: string = input.mimeType;
    let primaryExtension = 'webp';
    let variantUrls: string[] = [];

    try {
      const optimized = await this.imageOptimizerService.processImage({
        fileBuffer: input.fileBuffer,
        mimeType: input.mimeType,
      });

      primaryBuffer = optimized.primary.buffer;
      primaryMimeType = 'image/webp';
      primaryExtension = 'webp';

      // Upload each variant; skip on individual failure
      for (const variant of optimized.variants) {
        const variantPath = `${raffleSegment}/${uploaderSegment}/${uuid}-${variant.width}w.webp`;
        try {
          const { error: variantError } = await this.client.storage
            .from(RAFFLE_IMAGE_BUCKET)
            .upload(variantPath, variant.buffer, {
              contentType: 'image/webp',
              upsert: false,
            });

          if (variantError) {
            this.logger.error(
              `Variant upload failed for path=${variantPath}: ${variantError.message}`,
            );
            continue;
          }

          const { data: variantData } = this.client.storage
            .from(RAFFLE_IMAGE_BUCKET)
            .getPublicUrl(variantPath);

          variantUrls.push(variantData.publicUrl);
        } catch (variantErr) {
          this.logger.error(
            `Variant upload threw for path=${variantPath}: ${(variantErr as Error).message}`,
          );
          // Skip this variant and continue
        }
      }
    } catch (optimizerErr) {
      // Total optimizer failure: fall back to original buffer
      this.logger.error(
        `ImageOptimizerService failed, falling back to original buffer: ${(optimizerErr as Error).message}`,
      );
      primaryBuffer = input.fileBuffer;
      primaryMimeType = input.mimeType;
      primaryExtension = MIME_TO_EXTENSION[input.mimeType];
      variantUrls = [];
    }

    const path = `${raffleSegment}/${uploaderSegment}/${uuid}.${primaryExtension}`;

    const { error } = await this.client.storage
      .from(RAFFLE_IMAGE_BUCKET)
      .upload(path, primaryBuffer, {
        contentType: primaryMimeType,
        upsert: false,
      });

    if (error) {
      this.logger.error(`Upload failed for path=${path}: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to upload image to storage: ${error.message}`,
      );
    }

    const { data } = this.client.storage
      .from(RAFFLE_IMAGE_BUCKET)
      .getPublicUrl(path);

    this.logger.log(`Upload succeeded: ${path}`);

    return {
      url: data.publicUrl,
      path,
      bucket: RAFFLE_IMAGE_BUCKET,
      variantUrls,
    };
  }

  async deleteRaffleImage(path: string): Promise<void> {
    this.logger.log(`Deleting image at path=${path}`);

    const { error } = await this.client.storage
      .from(RAFFLE_IMAGE_BUCKET)
      .remove([path]);

    if (error) {
      this.logger.error(`Delete failed for path=${path}: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to delete image from storage: ${error.message}`,
      );
    }
  }

  private sanitizePathSegment(raw: string): string {
    const sanitized = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    return sanitized.length > 0 ? sanitized : 'unknown';
  }
}
