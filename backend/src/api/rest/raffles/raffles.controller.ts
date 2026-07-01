import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  Sse,
  UseInterceptors,
  UsePipes,
  Header,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiConsumes, ApiBody, ApiBearerAuth, ApiHeader, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { FastifyRequest } from "fastify";
import { MultipartFile } from "@fastify/multipart";
import { Public } from "../../../auth/decorators/public.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { RafflesService } from "./raffles.service";
import { env } from "../../../config/env.config";
import { UpsertMetadataPayload } from "../../../services/metadata.service";
import {
  ListRafflesQuerySchema,
  ListRafflesQueryDto,
  BatchMetadataQuerySchema,
  type BatchMetadataQueryDto,
  PurchaseTicketSchema,
  PurchaseTicketDto,
  ParticipantListQuerySchema,
  ParticipantListQueryDto,
  ParticipantListResponseDto,
} from "./dto";
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
import { Throttle } from "@nestjs/throttler";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import { IdempotencyService } from "../../../common/idempotency/idempotency.service";
import * as fileType from "file-type";

interface FastifyRequestWithMultipart extends FastifyRequest {
  file: () => Promise<MultipartFile | undefined>;
}

const RAFFLE_CREATE_RATE_LIMIT = env.rateLimits.raffleCreateLimit;
const RAFFLE_CREATE_RATE_WINDOW_SECONDS = env.rateLimits.raffleCreateWindowSeconds;

@ApiTags("Raffles")
@Controller("raffles")
export class RafflesController {
  constructor(
    private readonly rafflesService: RafflesService,
    private readonly storageService: StorageService,
    private readonly idempotencyService: IdempotencyService,
    private readonly sseService: SseService,
  ) {}

  /**
   * GET /raffles — List raffles with optional filters and pagination.
   * Filters: status, category, creator, asset. Pagination: limit (1–100), offset.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: "List raffles with optional filters and pagination" })
  @ApiResponse({ status: 200, description: "Raffles list retrieved successfully" })
  @UsePipes(new (createZodPipe(ListRafflesQuerySchema))())
  async list(@Query() filters: ListRafflesQueryDto) {
    return this.rafflesService.list(filters);
  }

  /**
   * GET /raffles/metadata?ids=1,2,3 — Batch fetch off-chain metadata for up to 100 raffle IDs.
   * Returns an array of found metadata records; IDs with no metadata are omitted.
   * Must be declared before :id to prevent NestJS matching "metadata" as an id param.
   */
  @Public()
  @Get('metadata')
  @ApiOperation({ summary: "Batch fetch off-chain metadata for up to 100 raffle IDs" })
  @ApiResponse({ status: 200, description: "Batch metadata retrieved successfully" })
  @UsePipes(new (createZodPipe(BatchMetadataQuerySchema))())
  async getBatchMetadata(@Query() query: BatchMetadataQueryDto) {
    return this.rafflesService.getBatchMetadata(query.ids);
  }

  /**
   * GET /raffles/:id — Raffle detail with contract data + metadata merged.
   */
  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Get raffle detail by ID" })
  @ApiParam({ name: "id", description: "Internal raffle ID" })
  @ApiResponse({ status: 200, description: "Raffle details retrieved successfully" })
  async getById(@Param("id", ParseIntPipe) id: number) {
    return this.rafflesService.getById(id);
  }

  /**
   * GET /raffles/:id/participants?limit=&offset= — List ticket holders for a raffle.
   * Returns paginated list of participants with ticket counts.
   * limit: max 100, default 20
   * offset: default 0
   */
  @Public()
  @Get(":id/participants")
  @ApiOperation({ summary: "List participants (ticket holders) for a raffle" })
  @ApiParam({ name: "id", description: "Internal raffle ID" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Max 100, default 20" })
  @ApiQuery({ name: "offset", required: false, type: Number, description: "Offset for pagination, default 0" })
  @ApiResponse({ status: 200, description: "Participants list retrieved successfully", type: ParticipantListResponseDto })
  @UsePipes(new (createZodPipe(ParticipantListQuerySchema))())
  async getParticipants(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: ParticipantListQueryDto,
  ) {
    return this.rafflesService.getParticipants(id, query.limit, query.offset);
  }

  /**
   * GET /raffles/:id/ipfs — Redirect to IPFS metadata for the raffle.
   */
  @Public()
  @Get(":id/ipfs")
  @ApiOperation({ summary: "Redirect to IPFS metadata" })
  @ApiParam({ name: "id", description: "Internal raffle ID" })
  @ApiResponse({ status: 302, description: "Redirected to IPFS URL" })
  @ApiResponse({ status: 404, description: "IPFS metadata not found for raffle" })
  async redirectToIpfs(@Param("id", ParseIntPipe) id: number, @Res() res: any) {
    const detail = await this.rafflesService.getById(id);
    if (!detail.metadata_cid) {
      throw new NotFoundException(`IPFS metadata not found for raffle ${id}`);
    }
    const gateway = env.storage.ipfsGatewayUrl;
    res.redirect(`${gateway}${detail.metadata_cid}`);
  }

  /**
   * POST /raffles/:raffleId/metadata — Create or update raffle metadata.
   * Requires JWT (SIWS).
   */
  @ApiBearerAuth()
  @Throttle({
    raffleCreate: {
      limit: RAFFLE_CREATE_RATE_LIMIT,
      ttl: RAFFLE_CREATE_RATE_WINDOW_SECONDS * 1000,
    },
  })
  @Post(":raffleId/metadata")
  @ApiOperation({ summary: "Create or update raffle metadata" })
  @ApiParam({ name: "raffleId", description: "Internal raffle ID" })
  @ApiHeader({ name: "Idempotency-Key", description: "Client-generated UUID for safe retries. Prevents duplicate metadata writes if request is retried within 24 hours.", required: false })
  @ApiResponse({ status: 201, description: "Metadata created/updated successfully" })
  @ApiResponse({ status: 409, description: "Conflict — request with this Idempotency-Key is already in progress" })
  @UseInterceptors(IdempotencyInterceptor)
  async upsertMetadata(
    @Param("raffleId", ParseIntPipe) raffleId: number,
    @CurrentUser("address") address: string,
    @Body(new (createZodPipe(UpsertMetadataSchema))())
    payload: UpsertMetadataDto,
  ) {
    return this.rafflesService.upsertMetadata(raffleId, payload, address);
  }

  /**
   * DELETE /raffles/:raffleId/metadata — Soft-delete raffle metadata.
   * Creator can delete their own raffle's metadata; admin can delete any.
   * Requires JWT (SIWS).
   */
  @ApiBearerAuth()
  @Delete(":raffleId/metadata")
  @ApiOperation({ summary: "Soft-delete raffle metadata (creator or admin)" })
  @ApiParam({ name: "raffleId", description: "Internal raffle ID" })
  @ApiResponse({ status: 200, description: "Metadata soft-deleted successfully" })
  @ApiResponse({ status: 403, description: "Forbidden — not the creator" })
  @ApiResponse({ status: 404, description: "Raffle or metadata not found" })
  async deleteMetadata(
    @Param("raffleId", ParseIntPipe) raffleId: number,
    @CurrentUser("address") address: string,
  ) {
    return this.rafflesService.deleteMetadata(raffleId, address);
  }

  /**
   * POST /raffles/:raffleId/purchase — Purchase tickets for a raffle.
   * Idempotent: supply Idempotency-Key header to safely retry on network failure.
   * Requires JWT (SIWS).
   */
  @ApiBearerAuth()
  @Post(":raffleId/purchase")
  @ApiOperation({ summary: "Purchase tickets for a raffle" })
  @ApiParam({ name: "raffleId", description: "Internal raffle ID" })
  @ApiHeader({ name: "Idempotency-Key", description: "Client-generated unique key for safe retries", required: false })
  @ApiResponse({ status: 201, description: "Ticket purchase submitted, returns transaction hash" })
  @HttpCode(201)
  @UseInterceptors(IdempotencyInterceptor)
  async purchaseTickets(
    @Param("raffleId", ParseIntPipe) raffleId: number,
    @CurrentUser("address") address: string,
    @Body(new (createZodPipe(PurchaseTicketSchema))()) payload: PurchaseTicketDto,
  ) {
    return this.rafflesService.purchaseTickets(raffleId, payload, address);
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
    const file = await request.file();
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    const buffer = await file.toBuffer();
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

    const raffleId = this.extractRaffleId(file);
    const upload = await this.storageService.uploadRaffleImage({
      fileBuffer: buffer,
      mimeType,
      raffleId,
      uploaderId: address,
    });

    return { url: upload.url, variantUrls: upload.variantUrls };
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

  /**
   * GET /raffles/:id/og — Returns a dynamic Open Graph image (PNG) for the raffle.
   */
  @Public()
  @Get(":id/og")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=60")
  async getRaffleOgImage(
    @Param("id", ParseIntPipe) id: number,
    @Res() reply: any,
  ): Promise<void> {
    const cacheKey = `og:raffle:${id}`;

    if (this.metadataRedis.isEnabled()) {
      const cached = await this.metadataRedis.get(cacheKey);
      if (cached) {
        const buffer = Buffer.from(cached, "base64");
        reply.status(200).send(buffer);
        return;
      }
    }

    let raffle;
    try {
      raffle = await this.rafflesService.getById(id);
    } catch {
      const defaultBuffer = await this.generateDefaultOgImage();
      reply.status(200).send(defaultBuffer);
      return;
    }

    const title = raffle.title || `Raffle #${raffle.id}`;
    const prize_amount = raffle.prize_amount || "10,000";
    const tickets_sold = raffle.tickets_sold || 0;
    const max_tickets = raffle.max_tickets || 100;
    const end_time = raffle.end_time || "";
    const image_url = raffle.image_url || "";

    let base64Image = "";
    if (image_url) {
      try {
        const res = await fetch(image_url);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const contentType = res.headers.get("content-type") || "image/png";
          base64Image = `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
        }
      } catch (err) {
        // ignore image fetch error
      }
    }

    const pngBuffer = await this.renderOgImage(
      title,
      prize_amount,
      tickets_sold,
      max_tickets,
      end_time,
      base64Image,
    );

    if (this.metadataRedis.isEnabled()) {
      await this.metadataRedis.setEx(cacheKey, 60, pngBuffer.toString("base64"));
    }

    reply.status(200).send(pngBuffer);
  }

  private async renderOgImage(
    title: string,
    prize_amount: string,
    tickets_sold: number,
    max_tickets: number,
    end_time: string,
    base64Image: string,
  ): Promise<Buffer> {
    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Wrap title
    const words = title.split(" ");
    let line1 = "";
    let line2 = "";
    for (const word of words) {
      if ((line1 + " " + word).length < 25) {
        line1 = (line1 + " " + word).trim();
      } else if ((line2 + " " + word).length < 25) {
        line2 = (line2 + " " + word).trim();
      } else {
        if (line2) {
          line2 = line2 + "...";
          break;
        }
        line2 = word;
      }
    }
    if (!line1) {
      line1 = title;
    }

    const sold = tickets_sold;
    const max = max_tickets || 1;
    const percent = Math.min(1, sold / max);
    const fillWidth = Math.round(580 * percent);

    const parseEndTime = (endTimeStr?: string): string => {
      if (!endTimeStr) return "No end time";
      const endTime = parseInt(endTimeStr, 10);
      if (isNaN(endTime) || endTime === 0) return "No end time";
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;
      if (diff <= 0) return "Ended";
      const days = Math.floor(diff / 86400);
      if (days > 0) return `${days}d left`;
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      return `${hours}h ${minutes}m left`;
    };

    const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0c"/>
      <stop offset="50%" stop-color="#111115"/>
      <stop offset="100%" stop-color="#1c1917"/>
    </linearGradient>
    <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <clipPath id="rect-clip">
      <rect x="730" y="100" width="390" height="390" rx="30" ry="30" />
    </clipPath>
  </defs>
  
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1100" cy="100" r="300" fill="#6366f1" opacity="0.05" />
  <circle cx="100" cy="500" r="200" fill="#ec4899" opacity="0.03" />

  <g transform="translate(80, 80)">
    <rect width="40" height="40" rx="8" fill="#6366f1" />
    <text x="20" y="27" text-anchor="middle" fill="#ffffff" font-size="20" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900">T</text>
    <text x="55" y="28" fill="#ffffff" font-size="24" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold" letter-spacing="1">tikka</text>
  </g>

  <text x="80" y="210" fill="#ffffff" font-size="48" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">${esc(line1)}</text>
  \${line2 ? \`<text x="80" y="270" fill="#ffffff" font-size="48" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">\${esc(line2)}</text>\` : ""}

  <g transform="translate(80, \${line2 ? 320 : 280})">
    <text x="0" y="30" fill="#9ca3af" font-size="20" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="600" letter-spacing="1">PRIZE POOL</text>
    <text x="0" y="80" fill="#818cf8" font-size="44" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">\${esc(prize_amount)} XLM</text>
  </g>

  <g transform="translate(80, 440)">
    <rect width="580" height="14" rx="7" fill="#1f2937"/>
    <rect width="\${fillWidth}" height="14" rx="7" fill="url(#progress-gradient)"/>
    <text x="0" y="45" fill="#e5e7eb" font-size="18" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">\${sold} / \${max} Tickets Sold (\${Math.round(percent * 100)}%)</text>
    <text x="580" y="45" text-anchor="end" fill="#f43f5e" font-size="18" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">\${esc(parseEndTime(end_time))}</text>
  </g>

  \${base64Image ? \`
    <rect x="725" y="95" width="400" height="400" rx="35" ry="35" fill="#111115" stroke="#1f2937" stroke-width="2" />
    <image href="\${base64Image}" x="730" y="100" width="390" height="390" clip-path="url(#rect-clip)" preserveAspectRatio="xMidYMid slice" />
  \` : \`
    <g transform="translate(730, 100)">
      <rect width="390" height="390" rx="30" ry="30" fill="#18181b" stroke="#27272a" stroke-width="3" />
      <text x="195" y="220" text-anchor="middle" fill="#6366f1" font-size="100" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">🎟️</text>
    </g>
  \`}
</svg>`;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  private async generateDefaultOgImage(): Promise<Buffer> {
    return this.renderOgImage(
      "Tikka Raffles",
      "Decentralized",
      0,
      100,
      "",
      "",
    );
  }
}
