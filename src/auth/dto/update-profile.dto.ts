import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * NOTE: without this field declared, the global ValidationPipe
   * ({ whitelist: true }) SILENTLY strips avatarUrl from the request body,
   * so the photo appeared to upload but never persisted.
   */
  @ApiPropertyOptional({ description: 'S3 cloud storage path or URL of the profile photo' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
