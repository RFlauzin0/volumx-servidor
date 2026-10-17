import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Eucalyptus Plantation 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Client' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Project type' })
  @IsOptional()
  @IsString()
  projectType?: string;

  @ApiPropertyOptional({ description: 'Total area, ha' })
  @IsOptional()
  @IsNumber()
  totalAreaHa?: number;

  @ApiPropertyOptional({ description: 'Municipality' })
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional({ description: 'State (UF)' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Technical lead' })
  @IsOptional()
  @IsString()
  technicalLead?: string;

  @ApiPropertyOptional({ description: 'ART number' })
  @IsOptional()
  @IsString()
  artNumber?: string;

  @ApiPropertyOptional({ description: 'Workflow status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Due date (ISO)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
