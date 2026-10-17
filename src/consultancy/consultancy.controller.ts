import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConsultancyService } from './consultancy.service';

const uid = (req: Request) => (req.user as any).id;

@ApiTags('Consultancy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api')
export class ConsultancyController {
  constructor(private service: ConsultancyService) {}

  @Get('clients')
  @ApiOperation({ summary: 'List clients' })
  listClients(@Req() req: Request) {
    return this.service.listClients(uid(req));
  }

  @Get('clients/:id')
  @ApiOperation({ summary: 'Client with projects and licences' })
  getClient(@Req() req: Request, @Param('id') id: string) {
    return this.service.getClient(uid(req), id);
  }

  @Post('clients')
  createClient(@Req() req: Request, @Body() body: any) {
    return this.service.createClient(uid(req), body);
  }

  @Patch('clients/:id')
  updateClient(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.updateClient(uid(req), id, body);
  }

  @Delete('clients/:id')
  removeClient(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeClient(uid(req), id);
  }

  @Get('licenses')
  @ApiOperation({ summary: 'List licences and deadlines' })
  listLicenses(@Req() req: Request, @Query('clientId') clientId?: string, @Query('projectId') projectId?: string) {
    return this.service.listLicenses(uid(req), { clientId, projectId });
  }

  @Get('licenses/upcoming')
  @ApiOperation({ summary: 'Licences expiring soon or expired' })
  upcoming(@Req() req: Request) {
    return this.service.upcoming(uid(req));
  }

  @Post('licenses')
  createLicense(@Req() req: Request, @Body() body: any) {
    return this.service.createLicense(uid(req), body);
  }

  @Patch('licenses/:id')
  updateLicense(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.updateLicense(uid(req), id, body);
  }

  @Delete('licenses/:id')
  removeLicense(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeLicense(uid(req), id);
  }
}
