import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/teams')
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a team' })
  create(@Req() req: Request, @Body() dto: CreateTeamDto) {
    return this.teamsService.create((req.user as any).id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my teams' })
  findAll(@Req() req: Request) {
    return this.teamsService.findAll((req.user as any).id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get team details' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.teamsService.findOne(id, (req.user as any).id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update team' })
  update(@Param('id') id: string, @Req() req: Request, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, (req.user as any).id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete team (owner only)' })
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.teamsService.remove(id, (req.user as any).id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add member to team' })
  addMember(@Param('id') id: string, @Req() req: Request, @Body() dto: AddMemberDto) {
    return this.teamsService.addMember(id, (req.user as any).id, dto);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove member from team' })
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: Request) {
    return this.teamsService.removeMember(id, memberId, (req.user as any).id);
  }

  @Patch(':id/members/:memberId')
  @ApiOperation({ summary: 'Update member role' })
  updateMemberRole(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() dto: UpdateMemberRoleDto) {
    return this.teamsService.updateMemberRole(id, memberId, (req.user as any).id, dto.role);
  }
}
