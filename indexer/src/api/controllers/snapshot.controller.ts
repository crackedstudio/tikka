import { Controller, Post, Body, UseGuards, Logger, HttpException, HttpStatus } from "@nestjs/common";
import { SnapshotService } from "../../maintenance/snapshot.service";
import { ApiKeyGuard } from "../api-key.guard";

@Controller("admin/snapshot")
@UseGuards(ApiKeyGuard)
export class SnapshotController {
  private readonly logger = new Logger(SnapshotController.name);

  constructor(private readonly snapshotService: SnapshotService) {}

  @Post("export")
  async export() {
    try {
      const filename = await this.snapshotService.exportSnapshot();
      return {
        message: "Snapshot exported successfully",
        filename,
      };
    } catch (error) {
      this.logger.error(`Export failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Export failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post("import")
  async import(@Body("filename") filename: string) {
    if (!filename) {
      throw new HttpException("Filename is required", HttpStatus.BAD_REQUEST);
    }
    try {
      await this.snapshotService.importSnapshot(filename);
      return {
        message: "Snapshot imported successfully",
      };
    } catch (error) {
      this.logger.error(`Import failed: ${error.message}`, error.stack);
      throw new HttpException(
        `Import failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
