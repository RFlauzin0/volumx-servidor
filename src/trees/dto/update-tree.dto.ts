import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTreeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  speciesName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  dbh?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  barkPercentage?: number;

  @ApiPropertyOptional({ example: 12.0, description: 'Commercial height (m) — up to the first big branch' })
  @IsOptional()
  @IsNumber()
  commercialHeight?: number;

  @ApiPropertyOptional({ example: 1.30, description: 'Point of measurement: height above ground where the diameter was taken (m)' })
  @IsOptional()
  @IsNumber()
  pom?: number;

  @ApiPropertyOptional({ example: 80.1, description: 'Circumference at the POM (cm)' })
  @IsOptional()
  @IsNumber()
  cap?: number;

  @ApiPropertyOptional({ description: 'How the tree was measured (AR-Volta, Manual-calibrado, ...)' })
  @IsOptional()
  @IsString()
  measurementMethod?: string;

  @ApiPropertyOptional({ example: 87, description: 'Measurement confidence 0-100' })
  @IsOptional()
  @IsNumber()
  measurementConfidence?: number;

  @ApiPropertyOptional({ description: 'Field tag (plaqueta) number' })
  @IsOptional()
  @IsString()
  tagNumber?: string;

  @ApiPropertyOptional({ description: 'Stem quality class 1-3' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  stemQuality?: number;

  @ApiPropertyOptional({ description: 'Sanity' })
  @IsOptional()
  @IsIn(['sadia', 'oca', 'podre', 'danificada'])
  sanity?: string;

  @ApiPropertyOptional({ description: 'Status in the cutting plan' })
  @IsOptional()
  @IsIn(['remanescente', 'explorar', 'porta-semente', 'protegida', 'morta'])
  treeStatus?: string;
}
