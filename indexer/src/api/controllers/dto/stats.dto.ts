import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformStatDto {
  @ApiPropertyOptional({ nullable: true }) date: string | null;
  @ApiProperty() total_raffles: number;
  @ApiProperty() total_tickets: number;
  @ApiProperty() total_volume_xlm: string;
  @ApiProperty() unique_participants: number;
  @ApiProperty() prizes_distributed_xlm: string;
  @ApiProperty() active_raffles: number;
  @ApiProperty() total_users: number;
}
