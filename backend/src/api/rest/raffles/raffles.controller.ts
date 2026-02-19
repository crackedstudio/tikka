import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { RafflesService } from './raffles.service';
import { UpsertMetadataPayload } from '../../../services/metadata.service';

@Controller('raffles')
export class RafflesController {
  constructor(private readonly rafflesService: RafflesService) {}

  /**
   * GET /raffles — List raffles with optional filters (status, category, creator, asset).
   */
  @Get()
  async list(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('creator') creator?: string,
    @Query('asset') asset?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters = {
      ...(status && { status }),
      ...(category && { category }),
      ...(creator && { creator }),
      ...(asset && { asset }),
      ...(limit != null && { limit: parseInt(limit, 10) }),
      ...(offset != null && { offset: parseInt(offset, 10) }),
    };
    return this.rafflesService.list(filters);
  }

  /**
   * GET /raffles/:id — Raffle detail with contract data + metadata merged.
   */
  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.rafflesService.getById(id);
  }

  /**
   * POST /raffles/:raffleId/metadata — Create or update raffle metadata.
   * Auth: optional for first version (add SIWS guard later).
   */
  @Post(':raffleId/metadata')
  async upsertMetadata(
    @Param('raffleId', ParseIntPipe) raffleId: number,
    @Body() payload: UpsertMetadataPayload,
  ) {
    return this.rafflesService.upsertMetadata(raffleId, payload);
  }
}
