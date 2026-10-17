import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTeamDto) {
    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        ownerId: userId,
        members: { create: { userId, role: 'owner' } },
      },
    });
    return team;
  }

  async findAll(userId: string) {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      include: { team: { include: { owner: { select: { id: true, name: true, email: true } } } } },
    });
    return { items: memberships.map((m) => ({ ...m.team, myRole: m.role })) };
  }

  async findOne(id: string, userId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!team) throw new NotFoundException('Team not found');
    await this.assertMember(id, userId);
    return { ...team, members: team.members.map((m) => ({ id: m.id, userId: m.userId, role: m.role, joinedAt: m.joinedAt, user: m.user })) };
  }

  async update(id: string, userId: string, dto: UpdateTeamDto) {
    await this.assertAdminOrOwner(id, userId);
    return this.prisma.team.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    if (team.ownerId !== userId) throw new ForbiddenException('Only the owner can delete the team');
    await this.prisma.team.delete({ where: { id } });
    return { success: true };
  }

  async addMember(teamId: string, userId: string, dto: AddMemberDto) {
    await this.assertAdminOrOwner(teamId, userId);
    const targetUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!targetUser) throw new NotFoundException('User not found with that email');

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUser.id } },
    });
    if (existing) throw new BadRequestException('User is already a member');

    const member = await this.prisma.teamMember.create({
      data: { teamId, userId: targetUser.id, role: dto.role || 'member' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return member;
  }

  async removeMember(teamId: string, memberId: string, userId: string) {
    await this.assertAdminOrOwner(teamId, userId);
    const member = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!member || member.teamId !== teamId) throw new NotFoundException('Member not found');
    if (member.role === 'owner') throw new ForbiddenException('Cannot remove the owner');
    await this.prisma.teamMember.delete({ where: { id: memberId } });
    return { success: true };
  }

  async updateMemberRole(teamId: string, memberId: string, userId: string, role: string) {
    await this.assertAdminOrOwner(teamId, userId);
    const member = await this.prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!member || member.teamId !== teamId) throw new NotFoundException('Member not found');
    if (member.role === 'owner') throw new ForbiddenException('Cannot change owner role');
    return this.prisma.teamMember.update({ where: { id: memberId }, data: { role } });
  }

  private async assertMember(teamId: string, userId: string) {
    const m = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!m) throw new ForbiddenException('Not a team member');
    return m;
  }

  private async assertAdminOrOwner(teamId: string, userId: string) {
    const m = await this.assertMember(teamId, userId);
    if (m.role !== 'owner' && m.role !== 'admin') throw new ForbiddenException('Requires admin or owner role');
    return m;
  }
}
