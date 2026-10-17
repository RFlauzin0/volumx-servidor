import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ProjectsService } from '../projects/projects.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SectionsService } from './sections.service';
import { CreateSectionsDto } from './dto/create-sections.dto';

@ApiTags('Log Sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/trees/:treeId/sections')
export class SectionsController {
  constructor(private sectionsService: SectionsService, private projects: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Add/replace log sections (bulk)' })
  async replace(@Param('treeId') treeId: string, @Req() req: Request, @Body() dto: CreateSectionsDto) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.sectionsService.replaceSections(treeId, dto.sections);
  }

  @Get()
  @ApiOperation({ summary: 'Get all sections ordered by number' })
  async findAll(@Param('treeId') treeId: string, @Req() req: Request) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.sectionsService.findAll(treeId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all sections for tree' })
  async removeAll(@Param('treeId') treeId: string, @Req() req: Request) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.sectionsService.removeAll(treeId);
  }
}
