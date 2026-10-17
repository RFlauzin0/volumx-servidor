import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create project' })
  create(@Req() req: Request, @Body() dto: CreateProjectDto) {
    return this.projectsService.create((req.user as any).id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects' })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Req() req: Request, @Query('teamId') teamId?: string, @Query('search') search?: string) {
    return this.projectsService.findAll((req.user as any).id, teamId, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.projectsService.findOne(id, (req.user as any).id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project' })
  update(@Param('id') id: string, @Req() req: Request, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, (req.user as any).id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project' })
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.projectsService.remove(id, (req.user as any).id);
  }
}
