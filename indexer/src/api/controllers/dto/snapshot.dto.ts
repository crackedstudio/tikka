/**
 * Snapshot DTOs — admin snapshot export/import responses.
 * Hide implementation details of storage, processing, or file handling.
 */

export interface SnapshotExportResponseDto {
  message: string;
  filename: string;
}

export interface SnapshotImportResponseDto {
  message: string;
}
