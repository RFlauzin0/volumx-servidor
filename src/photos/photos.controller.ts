import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from '../projects/projects.service';
import { PhotosService } from './photos.service';
import { CreatePhotoDto } from './dto/create-photo.dto';

@ApiTags('Tree Photos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/trees/:treeId/photos')
export class PhotosController {
  constructor(private photosService: PhotosService, private projects: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Add photo reference to tree' })
  async create(@Param('treeId') treeId: string, @Req() req: Request, @Body() dto: CreatePhotoDto) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.photosService.create(treeId, dto.cloud_storage_path, dto.caption);
  }

  @Get()
  @ApiOperation({ summary: 'List tree photos with URLs' })
  async findAll(@Param('treeId') treeId: string, @Req() req: Request) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.photosService.findAll(treeId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tree photo' })
  async remove(@Param('treeId') treeId: string, @Param('id') id: string, @Req() req: Request) {
    await this.projects.assertTreeAccess(treeId, (req.user as any).id);
    return this.photosService.remove(treeId, id);
  }
}
