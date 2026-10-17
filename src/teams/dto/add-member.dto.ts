import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsIn } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ['admin', 'member'], default: 'member' })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'member'])
  role?: string;
}
