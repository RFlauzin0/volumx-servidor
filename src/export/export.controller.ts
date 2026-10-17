import { Controller, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExportService } from './export.service';
import { ExportDto } from './dto/export.dto';

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/projects/:projectId/export')
export class ExportController {
  constructor(private exportService: ExportService) {}

  @Post()
  @ApiOperation({ summary: 'Export project as PDF or Excel' })
  export(@Param('projectId') projectId: string, @Req() req: Request, @Body() dto: ExportDto) {
    return this.exportService.exportProject(projectId, dto.format, (req.user as any).id);
  }
}
