import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard & Statistics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get user dashboard overview' })
  getDashboard(@Req() req: Request) {
    return this.dashboardService.getUserDashboard((req.user as any).id);
  }

  @Get('projects/:projectId/stats')
  @ApiOperation({ summary: 'Get project statistics' })
  getProjectStats(@Param('projectId') projectId: string, @Req() req: Request) {
    return this.dashboardService.getProjectStats(projectId, (req.user as any).id);
  }
}
