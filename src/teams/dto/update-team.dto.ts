import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateTeamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}
