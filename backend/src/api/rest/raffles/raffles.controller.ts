import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UsePipes,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiConsumes, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { FastifyRequest } from "fastify";
import { MultipartFile } from "@fastify/multipart";
import { Public } from "../../../auth/decorators/public.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { RafflesService } from "./raffles.service";
import { UpsertMetadataPayload } from "../../../services/metadata.service";
import { ListRafflesQuerySchema, ListRafflesQueryDto } from "./dto";
import { createZodPipe } from "./pipes/zod-validation.pipe";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  AllowedUploadMimeType,
  MAX_UPLOAD_BYTES,
} from "../../../config/upload.config";
import { StorageService } from "../../../services/storage.service";
import {
  UpsertMetadataSchema,
  UpsertMetadataDto,
} from "./metadata.schema";

interface FastifyRequestWithMultipart extends FastifyRequest {
  file: () => Promise<MultipartFile | undefined>;
}

@ApiTags("Raffles")
@Controller("raffles")
export class RafflesController {
  constructor(
    private readonly rafflesService: RafflesService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * GET /raffles — List raffles with optional filters and pagination.
   * Filters: status, category, creator, asset. Pagination: limit (1–100), offset.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: "List raffles with optional filters and pagination" })
  @UsePipes(new (createZodPipe(ListRafflesQuerySchema))())
  async list(@Query() filters: ListRafflesQueryDto) {
    return this.rafflesService.list(filters);
  }

  /**
   * GET /raffles/:id — Raffle detail with contract data + metadata merged.
   */
  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Get raffle detail by ID" })
  @ApiParam({ name: "id", description: "Internal raffle ID" })
  async getById(@Param("id", ParseIntPipe) id: number) {
    return this.rafflesService.getById(id);
  }

  /**
   * POST /raffles/:raffleId/metadata — Create or update raffle metadata.
   * Requires JWT (SIWS).
   */
  @ApiBearerAuth()
  @Post(":raffleId/metadata")
  @ApiOperation({ summary: "Create or update raffle metadata" })
  @ApiParam({ name: "raffleId", description: "Internal raffle ID" })
  async upsertMetadata(
    @Param("raffleId", ParseIntPipe) raffleId: number,
    @Body(new (createZodPipe(UpsertMetadataSchema))())
    payload: UpsertMetadataDto,
  ) {
    return this.rafflesService.upsertMetadata(raffleId, payload);
  }

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
  ): Promise<{ url: string }> {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    const mimeType = file.mimetype as AllowedUploadMimeType;
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: ${ALLOWED_UPLOAD_MIME_TYPES.join(", ")}`,
      );
    }

    const buffer = await file.toBuffer();
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
      );
    }

    const raffleId = this.extractRaffleId(file);
    const upload = await this.storageService.uploadRaffleImage({
      fileBuffer: buffer,
      mimeType,
      raffleId,
      uploaderId: address,
    });

    return { url: upload.url };
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
