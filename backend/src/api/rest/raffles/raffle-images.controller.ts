/// <reference path="../../../types/file-type.d.ts" />
import {
  BadRequestException,
  Controller,
  PayloadTooLargeException,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { FastifyRequest } from "fastify";
import { MultipartFile } from "@fastify/multipart";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  AllowedUploadMimeType,
  MAX_UPLOAD_IMAGE_HEIGHT,
  MAX_UPLOAD_IMAGE_PIXELS,
  MAX_UPLOAD_IMAGE_WIDTH,
  MAX_UPLOAD_BYTES,
} from "../../../config/upload.config";
import { StorageService } from "../../../services/storage.service";
import { ImageOptimizerService } from "../../../services/image-optimizer.service";
import * as fileType from "file-type";
import sharp, { type Metadata } from "sharp";

interface FastifyRequestWithMultipart extends FastifyRequest {
  file: () => Promise<MultipartFile | undefined>;
}

@ApiTags("Raffles")
@Controller("raffles")
export class RaffleImagesController {
  constructor(
    private readonly storageService: StorageService,
    private readonly imageOptimizerService: ImageOptimizerService,
  ) {}

  /**
   * POST /raffles/upload-image — Upload raffle image to Supabase Storage.
   * Accepts multipart/form-data with a single image file and optional raffleId field.
   * Max 5 MB. Allowed types: JPEG, PNG, WebP.
   * Requires JWT (SIWS).
   */
  @ApiBearerAuth()
  @Post("upload-image")
  @ApiOperation({ summary: "Upload raffle image to storage" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({ status: 201, description: "Image uploaded successfully" })
  @ApiResponse({ status: 400, description: "Bad Request" })
  @ApiResponse({ status: 413, description: "Payload Too Large" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        raffleId: {
          type: "string",
          description: "Optional raffle ID (defaults to 'draft')",
        },
      },
      required: ["file"],
    },
  })
  async uploadImage(
    @Req() request: FastifyRequestWithMultipart,
    @CurrentUser("address") address: string,
  ): Promise<{ url: string; variantUrls: string[] }> {
    let file: MultipartFile | undefined;
    try {
      file = await request.file();
    } catch (error) {
      if (this.isMultipartLimitError(error)) {
        throw this.createPayloadTooLargeException();
      }
      throw error;
    }

    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (error) {
      if (this.isMultipartLimitError(error)) {
        throw this.createPayloadTooLargeException();
      }
      throw error;
    }

    const detectedFileType = await fileType.fromBuffer(buffer);
    const mimeType = detectedFileType?.mime as AllowedUploadMimeType | undefined;

    if (!mimeType || !ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type "${detectedFileType?.mime ?? file.mimetype}". Allowed: ${ALLOWED_UPLOAD_MIME_TYPES.join(", ")}`,
      );
    }

    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
      );
    }

    await this.assertImageDimensionsWithinLimits(buffer);

    const raffleId = this.extractRaffleId(file);
    const upload = await this.storageService.uploadRaffleImage({
      fileBuffer: buffer,
      mimeType,
      raffleId,
      uploaderId: address,
    });

    return { url: upload.url, variantUrls: upload.variantUrls };
  }

  private async assertImageDimensionsWithinLimits(buffer: Buffer): Promise<void> {
    let metadata: Metadata;

    try {
      metadata = await sharp(buffer, {
        limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS + 1,
      }).metadata();
    } catch {
      throw new BadRequestException("Invalid or unreadable image file");
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const pixels = width * height;

    if (width <= 0 || height <= 0) {
      throw new BadRequestException("Image dimensions could not be determined");
    }

    if (
      width > MAX_UPLOAD_IMAGE_WIDTH ||
      height > MAX_UPLOAD_IMAGE_HEIGHT ||
      pixels > MAX_UPLOAD_IMAGE_PIXELS
    ) {
      throw new BadRequestException(
        `Image dimensions exceed limit (${width}x${height}). Max: ${MAX_UPLOAD_IMAGE_WIDTH}x${MAX_UPLOAD_IMAGE_HEIGHT}`,
      );
    }
  }

  private isMultipartLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const maybeMultipartError = error as Error & { code?: string; statusCode?: number };
    return (
      maybeMultipartError.code === "FST_REQ_FILE_TOO_LARGE" ||
      maybeMultipartError.statusCode === 413 ||
      /file too large/i.test(maybeMultipartError.message)
    );
  }

  private createPayloadTooLargeException(): PayloadTooLargeException {
    return new PayloadTooLargeException(
      `File too large. Max: ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    );
  }

  private extractRaffleId(file: MultipartFile): string {
    const rawRaffleId = file.fields?.raffleId;
    const raffleId =
      rawRaffleId &&
      "value" in rawRaffleId &&
      typeof rawRaffleId.value === "string"
        ? rawRaffleId.value.trim()
        : "";

    return raffleId.length > 0 ? raffleId : "draft";
  }
}
