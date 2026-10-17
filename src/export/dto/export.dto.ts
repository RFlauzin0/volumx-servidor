import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class ExportDto {
  @ApiProperty({ enum: ['pdf', 'excel'] })
  @IsString()
  @IsIn(['pdf', 'excel'])
  format: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includePhotos?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeMap?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeVolumes?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeStats?: boolean;
}
