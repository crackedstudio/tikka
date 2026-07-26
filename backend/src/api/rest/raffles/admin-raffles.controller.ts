import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";
import { Public } from "../../../auth/decorators/public.decorator";
import { AdminGuard } from "../monitor/admin.guard";
import { RafflesService } from "./raffles.service";

@ApiTags("Admin - Raffles")
@Controller("admin/raffles")
@UseGuards(AdminGuard)
@Public()
export class AdminRafflesController {
  constructor(private readonly rafflesService: RafflesService) {}

  /**
   * GET /admin/raffles/archived — List all soft-deleted raffle metadata records.
   * Admin only.
   */
  @Get("archived")
  @ApiOperation({ summary: "List all archived (soft-deleted) raffle metadata" })
  @ApiResponse({ status: 200, description: "Archived metadata retrieved successfully" })
  async getArchived() {
    return this.rafflesService.getArchivedMetadata();
  }

  /**
   * DELETE /admin/raffles/:raffleId/metadata — Admin soft-delete of any raffle metadata.
   * Bypasses creator check.
   */
  @Delete(":raffleId/metadata")
  @ApiOperation({ summary: "Admin soft-delete of raffle metadata" })
  @ApiParam({ name: "raffleId", description: "Internal raffle ID" })
  @ApiResponse({ status: 200, description: "Metadata soft-deleted successfully" })
  @ApiResponse({ status: 404, description: "Active metadata not found for raffle" })
  async deleteMetadata(@Param("raffleId", ParseIntPipe) raffleId: number) {
    return this.rafflesService.softDeleteMetadata(raffleId);
  }

  /**
   * POST /admin/raffles/:raffleId/restore — Restore a soft-deleted raffle metadata record.
   * Admin only.
   */
  @Post(":raffleId/restore")
  @ApiOperation({ summary: "Restore archived raffle metadata" })
  @ApiParam({ name: "raffleId", description: "Internal raffle ID" })
  @ApiResponse({ status: 201, description: "Metadata restored successfully" })
  @ApiResponse({ status: 404, description: "Archived metadata not found for raffle" })
  async restoreMetadata(@Param("raffleId", ParseIntPipe) raffleId: number) {
    return this.rafflesService.restoreMetadata(raffleId);
  }
}
