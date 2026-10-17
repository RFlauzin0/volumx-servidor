import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

export class LogSectionInput {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  sectionNumber: number;

  @ApiProperty({ example: 2.0, description: 'Length in meters' })
  @IsNumber()
  length: number;

  @ApiProperty({ example: 15.0, description: 'Diameter small end (cm)' })
  @IsNumber()
  diameterSmallEnd: number;

  @ApiProperty({ example: 20.0, description: 'Diameter large end (cm)' })
  @IsNumber()
  diameterLargeEnd: number;

  @ApiPropertyOptional({ example: 17.5, description: 'Diameter middle (cm)' })
  @IsOptional()
  @IsNumber()
  diameterMiddle?: number;
}

export class CreateSectionsDto {
  @ApiProperty({ type: [LogSectionInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogSectionInput)
  sections: LogSectionInput[];
}
