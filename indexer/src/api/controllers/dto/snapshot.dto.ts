import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SnapshotExportResponseDto {
  @ApiProperty() message: string;
  @ApiProperty() filename: string;
}

export class SnapshotImportRequestDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;
}

export class SnapshotImportResponseDto {
  @ApiProperty() message: string;
}
