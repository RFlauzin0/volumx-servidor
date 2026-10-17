import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Forest Team Alpha' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
