import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class SyncChangeDto {
  @ApiProperty({ example: 'tree' })
  @IsString()
  @IsNotEmpty()
  entityType: string;

  @ApiProperty({ example: 'local-123' })
  @IsString()
  @IsNotEmpty()
  localId: string;

  @ApiProperty({ enum: ['create', 'update', 'delete'] })
  @IsString()
  @IsIn(['create', 'update', 'delete'])
  action: string;

  @ApiProperty()
  @IsObject()
  payload: Record<string, any>;

  @ApiProperty({ example: '2026-01-01T00:00:00Z' })
  @IsString()
  timestamp: string;
}

export class SyncPushDto {
  @ApiProperty({ type: [SyncChangeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncChangeDto)
  changes: SyncChangeDto[];
}
