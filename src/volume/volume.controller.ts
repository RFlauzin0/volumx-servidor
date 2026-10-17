import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VolumeService } from './volume.service';
import { ProjectsService } from '../projects/projects.service';
import { CalculateVolumeDto } from './dto/calculate-volume.dto';

@ApiTags('Volume Calculations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/trees/:treeId')
export class VolumeController {
  constructor(private volumeService: VolumeService, private projects: ProjectsService) {}

  @Post('calculate-volume')
  @ApiOperation({ summary: 'Calculate tree volume using chosen method' })
  async calculate(@Param('treeId') treeId: string, @Req() req: Request, @Body() dto: CalculateVolumeDto) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.volumeService.calculate(treeId, dto.method, dto.barkPercentage, (req.user as any).id, {
      barkMode: dto.barkMode,
      stumpHeight: dto.stumpHeight,
      topLength: dto.topLength,
    });
  }

  @Get('volumes')
  @ApiOperation({ summary: 'Get all volume calculations for tree' })
  async findAll(@Param('treeId') treeId: string, @Req() req: Request) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.volumeService.findAll(treeId);
  }
}
