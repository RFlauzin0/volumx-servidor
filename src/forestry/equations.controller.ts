import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EquationsService, EquationType } from './equations.service';

@ApiTags('Volume Equations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/equations')
export class EquationsController {
  constructor(private service: EquationsService) {}

  @Get()
  @ApiOperation({ summary: 'List volume equations available to the user' })
  list(@Req() req: Request, @Query('projectId') projectId?: string) {
    return this.service.list((req.user as any).id, projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a volume equation' })
  create(@Req() req: Request, @Body() body: any) {
    return this.service.create((req.user as any).id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a volume equation' })
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove((req.user as any).id, id);
  }

  @Post('fit/:projectId')
  @ApiOperation({ summary: 'Fit an equation from the rigorously cubed trees of a project' })
  fit(@Req() req: Request, @Param('projectId') projectId: string, @Body() body: any) {
    return this.service.fitFromProject(
      (req.user as any).id,
      projectId,
      (body?.type ?? 'schumacher') as EquationType,
      body?.heightBasis === 'commercial' ? 'commercial' : 'total',
    );
  }

  @Get('samples/:projectId')
  @ApiOperation({ summary: 'Count cubed trees available for fitting' })
  async samples(@Req() req: Request, @Param('projectId') projectId: string, @Query('heightBasis') heightBasis?: string) {
    const s = await this.service.gatherSamples(
      (req.user as any).id,
      projectId,
      heightBasis === 'commercial' ? 'commercial' : 'total',
    );
    return { count: s.length, samples: s };
  }

  @Post('apply/:projectId')
  @ApiOperation({ summary: 'Apply an equation to every standing tree of a project' })
  apply(@Req() req: Request, @Param('projectId') projectId: string, @Body() body: any) {
    return this.service.applyToProject((req.user as any).id, projectId, body?.equationId);
  }
}
