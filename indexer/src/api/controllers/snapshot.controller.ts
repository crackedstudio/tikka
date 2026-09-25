import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiSecurity } from '@nestjs/swagger';
import { SnapshotService } from '../../maintenance/snapshot.service';
import { ApiKeyGuard } from '../api-key.guard';
import {
  SnapshotExportResponseDto,
  SnapshotImportRequestDto,
  SnapshotImportResponseDto,
} from './dto/snapshot.dto';

@ApiTags('admin')
@ApiSecurity('api-key')
@Controller('admin/snapshot')
@UseGuards(ApiKeyGuard)
export class SnapshotController {
  private readonly logger = new Logger(SnapshotController.name);

  constructor(private readonly snapshotService: SnapshotService) {}

  @ApiOperation({ summary: 'Export snapshot' })
  @ApiResponse({ status: 201, type: SnapshotExportResponseDto })
  @Post('export')
  async export(): Promise<SnapshotExportResponseDto> {
    try {
      const filename = await this.snapshotService.exportSnapshot();
      return {
        message: 'Snapshot exported successfully',
        filename,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Export failed: ${message}`, stack);
      throw new HttpException(`Export failed: ${message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Import snapshot' })
  @ApiBody({ schema: { properties: { filename: { type: 'string' } } } })
  @ApiResponse({ status: 201, type: SnapshotImportResponseDto })
  @Post('import')
  async import(@Body() dto: SnapshotImportRequestDto): Promise<SnapshotImportResponseDto> {
    const { filename } = dto;
    if (!filename) {
      throw new HttpException('Filename is required', HttpStatus.BAD_REQUEST);
    }
    try {
      await this.snapshotService.importSnapshot(filename);
      return {
        message: 'Snapshot imported successfully',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Import failed: ${message}`, stack);
      throw new HttpException(`Import failed: ${message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
