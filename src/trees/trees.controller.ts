import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TreesService } from './trees.service';
import { CreateTreeDto } from './dto/create-tree.dto';
import { UpdateTreeDto } from './dto/update-tree.dto';

@ApiTags('Trees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api')
export class TreesController {
  constructor(private treesService: TreesService) {}

  @Post('parcels/:parcelId/trees')
  @ApiOperation({ summary: 'Create tree in parcel' })
  create(@Param('parcelId') parcelId: string, @Req() req: Request, @Body() dto: CreateTreeDto) {
    return this.treesService.create(parcelId, (req.user as any).id, dto);
  }

  @Get('parcels/:parcelId/trees')
  @ApiOperation({ summary: 'List trees in parcel' })
  @ApiQuery({ name: 'species', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  findByParcel(@Param('parcelId') parcelId: string, @Req() req: Request, @Query('species') species?: string, @Query('sortBy') sortBy?: string, @Query('order') order?: string) {
    return this.treesService.findByParcel(parcelId, (req.user as any).id, species, sortBy, order);
  }

  @Get('projects/:projectId/trees')
  @ApiOperation({ summary: 'List all trees in project' })
  @ApiQuery({ name: 'parcelId', required: false })
  @ApiQuery({ name: 'species', required: false })
  findByProject(@Param('projectId') projectId: string, @Req() req: Request, @Query('parcelId') parcelId?: string, @Query('species') species?: string) {
    return this.treesService.findByProject(projectId, (req.user as any).id, parcelId, species);
  }

  @Get('trees/:id')
  @ApiOperation({ summary: 'Get tree details with photos, sections, volumes' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.treesService.findOne(id, (req.user as any).id);
  }

  @Patch('trees/:id')
  @ApiOperation({ summary: 'Update tree (creates audit log)' })
  update(@Param('id') id: string, @Req() req: Request, @Body() dto: UpdateTreeDto) {
    return this.treesService.update(id, (req.user as any).id, dto);
  }

  @Delete('trees/:id')
  @ApiOperation({ summary: 'Delete tree' })
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.treesService.remove(id, (req.user as any).id);
  }
}
