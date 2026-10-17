import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PresignedUploadDto {
  @ApiProperty({ example: 'tree-photo.jpg' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class CompleteUploadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cloud_storage_path: string;
}
