import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePhotoDto {
  @ApiProperty({ description: 'S3 cloud storage path' })
  @IsString()
  @IsNotEmpty()
  cloud_storage_path: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;
}
