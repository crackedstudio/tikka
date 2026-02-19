import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { RafflesService } from './raffles.service';
import { UpsertMetadataPayload } from '../../../services/metadata.service';

@Controller('raffles')
export class RafflesController {
  constructor(private readonly rafflesService: RafflesService) {}

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
