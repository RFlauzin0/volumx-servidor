import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateParcelDto {
  @ApiProperty({ example: 'Parcel A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 5.5, description: 'Area in hectares' })
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
