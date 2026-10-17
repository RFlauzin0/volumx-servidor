import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxx]' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ example: 'android' })
  @IsOptional()
  @IsString()
  deviceType?: string;
}
