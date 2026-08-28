import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class IndexerEventBodyDto {
  @ApiProperty({ example: 'RaffleFinalized' })
  @IsString()
  @IsNotEmpty()
  eventType!: string;
}
