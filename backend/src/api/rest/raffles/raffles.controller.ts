import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Body,
  Query,
  UsePipes,
} from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator';
import { RafflesService } from './raffles.service';
import { UpsertMetadataPayload } from '../../../services/metadata.service';
import {
  ListRafflesQuerySchema,
  type ListRafflesQueryDto,
  BatchMetadataQuerySchema,
  type BatchMetadataQueryDto,
} from './dto';
import { createZodPipe } from './pipes/zod-validation.pipe';

@Controller('raffles')
export class RafflesController {
  constructor(private readonly rafflesService: RafflesService) {}

  /**
   * GET /raffles — List raffles with optional filters and pagination.
   * Filters: status, category, creator, asset. Pagination: limit (1–100), offset.
   */
  @Public()
  @Get()
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
  @UsePipes(new (createZodPipe(BatchMetadataQuerySchema))())
  async getBatchMetadata(@Query() query: BatchMetadataQueryDto) {
    return this.rafflesService.getBatchMetadata(query.ids);
  }

  /**
   * GET /raffles/:id — Raffle detail with contract data + metadata merged.
   */
  @Public()
  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.rafflesService.getById(id);
  }

  /**
   * POST /raffles/:raffleId/metadata — Create or update raffle metadata.
   * Requires JWT (SIWS).
   */
  @Post(':raffleId/metadata')
  async upsertMetadata(
    @Param('raffleId', ParseIntPipe) raffleId: number,
    @Body() payload: UpsertMetadataPayload,
  ) {
    return this.rafflesService.upsertMetadata(raffleId, payload);
  }
}
