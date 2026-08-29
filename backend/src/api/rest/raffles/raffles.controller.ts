import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  NotFoundException,
  Post,
  Query,
  Res,
  UseInterceptors,
  UsePipes,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth, ApiHeader, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { Public } from "../../../auth/decorators/public.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { RafflesService } from "./raffles.service";
import { env } from "../../../config/env.config";
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
  UpsertMetadataSchema,
  UpsertMetadataDto,
} from "./metadata.schema";
import { Throttle } from "@nestjs/throttler";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import { CacheHeadersInterceptor, CACHE_MAX_AGE_KEY } from "./cache-headers.interceptor";
import { SetMetadata } from "@nestjs/common";

const RAFFLE_CREATE_RATE_LIMIT = env.rateLimits.raffleCreateLimit;
const RAFFLE_CREATE_RATE_WINDOW_SECONDS = env.rateLimits.raffleCreateWindowSeconds;

@ApiTags("Raffles")
@Controller("raffles")
export class RafflesController {
  constructor(private readonly rafflesService: RafflesService) {}

  /**
   * GET /raffles — List raffles with optional filters and pagination.
   * Filters: status, category, creator, asset. Pagination: limit (1–100), offset.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: "List raffles with optional filters and pagination" })
  @ApiResponse({ status: 200, description: "Raffles list retrieved successfully" })
  @UseInterceptors(CacheHeadersInterceptor)
  @SetMetadata(CACHE_MAX_AGE_KEY, 10)
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
  @Get("metadata")
  @ApiOperation({ summary: "Batch fetch off-chain metadata for up to 100 raffle IDs" })
  @ApiResponse({ status: 200, description: "Batch metadata retrieved successfully" })
  @UseInterceptors(CacheHeadersInterceptor)
  @SetMetadata(CACHE_MAX_AGE_KEY, 15)
  @UsePipes(new (createZodPipe(BatchMetadataQuerySchema))())
  async getBatchMetadata(@Query() query: BatchMetadataQueryDto) {
    return this.rafflesService.getBatchMetadata(query.ids);
  }

  /**
   * GET /raffles/:id — Raffle detail with contract data + metadata merged.
   */
  @Public()
  @Get(":id")
  @ApiOperation({
    summary: "Get raffle detail by ID",
    description:
      "Returns merged contract and off-chain details for active, ended, or cancelled raffles (200 OK). Returns 404 Not Found for unknown IDs and 410 Gone for soft-deleted or permanently removed raffles.",
  })
  @ApiParam({ name: "id", description: "Internal raffle ID" })
  @ApiResponse({ status: 200, description: "Raffle details retrieved successfully (active, ended, or cancelled)" })
  @ApiResponse({ status: 404, description: "Raffle not found (unknown ID)" })
  @ApiResponse({ status: 410, description: "Raffle has been soft-deleted or permanently removed" })
  @UseInterceptors(CacheHeadersInterceptor)
  @SetMetadata(CACHE_MAX_AGE_KEY, 30)
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
  @UseInterceptors(CacheHeadersInterceptor)
  @SetMetadata(CACHE_MAX_AGE_KEY, 30)
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
}
