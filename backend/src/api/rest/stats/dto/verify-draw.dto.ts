import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyDrawBodyDto {
  @ApiProperty({ description: 'Oracle public key used for the draw' })
  @IsString()
  @IsNotEmpty()
  oracle_public_key!: string;

  @ApiProperty({ description: 'VRF request identifier' })
  @IsString()
  @IsNotEmpty()
  request_id!: string;

  @ApiProperty({ description: 'VRF proof payload' })
  @IsString()
  @IsNotEmpty()
  proof!: string;

  @ApiProperty({ description: 'VRF seed' })
  @IsString()
  @IsNotEmpty()
  seed!: string;
}

export class VerifyDrawQueryDto {
  @ApiProperty({ description: 'Transaction hash containing the draw' })
  @IsString()
  @IsNotEmpty()
  txHash!: string;
}
