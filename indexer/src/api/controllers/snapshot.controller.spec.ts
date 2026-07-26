import { HttpException, HttpStatus } from "@nestjs/common";
import { SnapshotController } from "./snapshot.controller";
import { SnapshotService } from "../../maintenance/snapshot.service";
import {
  SnapshotExportResponseDto,
  SnapshotImportResponseDto,
} from "./dto/snapshot.dto";

describe("SnapshotController", () => {
  let controller: SnapshotController;
  let snapshotService: any;

  beforeEach(() => {
    snapshotService = {
      exportSnapshot: jest.fn(),
      importSnapshot: jest.fn(),
    };

    controller = new SnapshotController(snapshotService);
  });

  describe("export", () => {
    it("should return snapshot export response with correct DTO shape", async () => {
      const filename = "snapshot-2024-01-01.zip";
      snapshotService.exportSnapshot.mockResolvedValue(filename);

      const result = (await controller.export()) as SnapshotExportResponseDto;

      // Verify DTO shape
      expect(result).toHaveProperty("message", "Snapshot exported successfully");
      expect(result).toHaveProperty("filename", filename);
    });

    it("should throw HttpException on export failure", async () => {
      const error = new Error("Export failed: disk full");
      snapshotService.exportSnapshot.mockRejectedValue(error);

      try {
        await controller.export();
        fail("Should have thrown HttpException");
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });
  });

  describe("import", () => {
    it("should return snapshot import response with correct DTO shape", async () => {
      const filename = "snapshot-2024-01-01.zip";
      snapshotService.importSnapshot.mockResolvedValue(undefined);

      const result = (await controller.import(filename)) as SnapshotImportResponseDto;

      // Verify DTO shape
      expect(result).toHaveProperty("message", "Snapshot imported successfully");
      expect(snapshotService.importSnapshot).toHaveBeenCalledWith(filename);
    });

    it("should throw BadRequest when filename is missing", async () => {
      try {
        await controller.import("");
        fail("Should have thrown HttpException");
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it("should throw BadRequest when filename is null", async () => {
      try {
        await controller.import(null as any);
        fail("Should have thrown HttpException");
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it("should throw HttpException on import failure", async () => {
      const filename = "snapshot-2024-01-01.zip";
      const error = new Error("Import failed: invalid file format");
      snapshotService.importSnapshot.mockRejectedValue(error);

      try {
        await controller.import(filename);
        fail("Should have thrown HttpException");
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });
  });
});
