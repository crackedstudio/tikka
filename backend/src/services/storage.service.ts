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
  ) {}

  async uploadRaffleImage(
    input: UploadRaffleImageInput,
  ): Promise<UploadRaffleImageResult> {
    const extension = MIME_TO_EXTENSION[input.mimeType];
    const fileName = `${randomUUID()}.${extension}`;
    const raffleSegment = this.sanitizePathSegment(input.raffleId);
    const uploaderSegment = this.sanitizePathSegment(input.uploaderId);
    const path = `${raffleSegment}/${uploaderSegment}/${fileName}`;

    this.logger.log(
      `Uploading image for raffle=${raffleSegment} by=${uploaderSegment} (${input.mimeType}, ${input.fileBuffer.length} bytes)`,
    );

    const { error } = await this.client.storage
      .from(RAFFLE_IMAGE_BUCKET)
      .upload(path, input.fileBuffer, {
        contentType: input.mimeType,
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
