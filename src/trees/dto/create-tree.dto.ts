import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateTreeDto {
  @ApiProperty({ example: 'Eucalyptus grandis' })
  @IsString()
  @IsNotEmpty()
  speciesName: string;

  @ApiProperty({ example: 25.5, description: 'Diameter at breast height (cm)' })
  @IsNumber()
  dbh: number;

  @ApiProperty({ example: 18.0, description: 'Height (m)' })
  @IsNumber()
  height: number;

  // Optional: a tree measured without GPS is still a valid record. Requiring
  // these forced the app to send 0/0, which is a real place in the Atlantic
  // and made the tree vanish from the map.
  @ApiPropertyOptional({ example: -23.5505 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -46.6333 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 12.5, description: 'Bark percentage' })
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

  @ApiPropertyOptional({ description: 'Original measurement date (ISO). Used when importing data from another server.' })
  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}
