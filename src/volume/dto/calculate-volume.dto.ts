import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class CalculateVolumeDto {
  @ApiProperty({ enum: ['smalian', 'huber', 'newton'] })
  @IsString()
  @IsIn(['smalian', 'huber', 'newton'])
  method: string;

  @ApiPropertyOptional({ description: 'Bark as a percentage of diameter. Applies to all methods; the volume deduction is quadratic.' })
  @IsOptional()
  @IsNumber()
  barkPercentage?: number;

  @ApiPropertyOptional({ enum: ['diameter', 'volume'], description: "How barkPercentage is expressed: share of the diameter (deduction is quadratic) or share of the volume (linear). Default 'diameter'." })
  @IsOptional()
  @IsIn(['diameter', 'volume'])
  barkMode?: 'diameter' | 'volume';

  @ApiPropertyOptional({ description: 'Stump height (m). Added as a cylinder with the base diameter of section 1.' })
  @IsOptional()
  @IsNumber()
  stumpHeight?: number;

  @ApiPropertyOptional({ description: 'Top (ponteira) length (m). Added as a cone over the small-end diameter of the last section.' })
  @IsOptional()
  @IsNumber()
  topLength?: number;
}
