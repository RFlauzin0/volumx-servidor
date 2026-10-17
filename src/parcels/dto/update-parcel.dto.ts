import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateParcelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  area?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Stratum label for stratified sampling' })
  @IsOptional()
  @IsString()
  stratum?: string;

  @ApiPropertyOptional({ description: 'Plot centre latitude' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Plot centre longitude' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
