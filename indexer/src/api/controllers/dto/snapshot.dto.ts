import { ApiProperty } from '@nestjs/swagger';

export class SnapshotExportResponseDto {
  @ApiProperty() message: string;
  @ApiProperty() filename: string;
}

export class SnapshotImportResponseDto {
  @ApiProperty() message: string;
}
