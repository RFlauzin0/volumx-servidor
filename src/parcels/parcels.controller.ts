import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ParcelsService } from './parcels.service';
import { CreateParcelDto } from './dto/create-parcel.dto';
import { UpdateParcelDto } from './dto/update-parcel.dto';

@ApiTags('Parcels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api')
export class ParcelsController {
  constructor(private parcelsService: ParcelsService) {}

  @Post('projects/:projectId/parcels')
  @ApiOperation({ summary: 'Create parcel' })
  create(@Param('projectId') projectId: string, @Req() req: Request, @Body() dto: CreateParcelDto) {
    return this.parcelsService.create(projectId, (req.user as any).id, dto);
  }

  @Get('projects/:projectId/parcels')
  @ApiOperation({ summary: 'List parcels in project' })
  findAll(@Param('projectId') projectId: string, @Req() req: Request) {
    return this.parcelsService.findAll(projectId, (req.user as any).id);
  }

  @Get('projects/:projectId/parcels/:id')
  @ApiOperation({ summary: 'Get parcel details' })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @Req() req: Request) {
    return this.parcelsService.findOne(projectId, id, (req.user as any).id);
  }

  @Patch('projects/:projectId/parcels/:id')
  @ApiOperation({ summary: 'Update parcel' })
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Req() req: Request, @Body() dto: UpdateParcelDto) {
    return this.parcelsService.update(projectId, id, (req.user as any).id, dto);
  }

  @Delete('projects/:projectId/parcels/:id')
  @ApiOperation({ summary: 'Delete parcel' })
  remove(@Param('projectId') projectId: string, @Param('id') id: string, @Req() req: Request) {
    return this.parcelsService.remove(projectId, id, (req.user as any).id);
  }
}
