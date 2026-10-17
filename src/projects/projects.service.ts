import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: { ...dto, userId },
    });
  }

  async findAll(userId: string, teamId?: string, search?: string) {
    // Get user's team IDs
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);

    const where: any = {
      OR: [
        { userId },
        { teamId: { in: teamIds } },
      ],
    };
    if (teamId) where.teamId = teamId;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        _count: { select: { parcels: true, trees: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Volume per project. The Analisar tab reads `totalVolume` from this list,
    // but it was never sent — so every project showed 0 m³ and the
    // "volume zerado" alert fired even after an equation had been applied.
    // Latest calculation per tree, same rule as the dashboard.
    const volTrees = await this.prisma.tree.findMany({
      where: { projectId: { in: projects.map((p) => p.id) } },
      select: {
        projectId: true,
        volumeCalculations: { orderBy: { calculatedAt: 'desc' }, take: 1, select: { totalVolume: true } },
      },
    });
    const volByProject = new Map<string, number>();
    for (const t of volTrees) {
      const v = t.volumeCalculations[0]?.totalVolume ?? 0;
      volByProject.set(t.projectId, (volByProject.get(t.projectId) ?? 0) + v);
    }

    return {
      items: projects.map((p) => ({
        ...p,
        parcelCount: p._count.parcels,
        treeCount: p._count.trees,
        totalVolume: parseFloat((volByProject.get(p.id) ?? 0).toFixed(4)),
        _count: undefined,
      })),
    };
  }

  async findOne(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        _count: { select: { parcels: true, trees: true } },
        team: { select: { id: true, name: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertAccess(project, userId);
    return { ...project, parcelCount: project._count.parcels, treeCount: project._count.trees, _count: undefined };
  }

  async update(id: string, userId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertAccess(project, userId);
    return this.prisma.project.update({ where: { id }, data: { ...dto } });
  }

  async remove(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('Only the creator can delete');
    await this.prisma.project.delete({ where: { id } });
    return { success: true };
  }

  /** Loads a project by id and checks the user may touch it. */
  async assertProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertAccess(project, userId);
    return project;
  }

  /**
   * Loads a tree and checks access through its project. Sections, volume and
   * photo endpoints only had the JWT guard, so any logged-in user who knew a
   * tree id could overwrite another consultancy's cubagem.
   */
  async assertTreeAccess(treeId: string, userId: string) {
    const tree = await this.prisma.tree.findUnique({ where: { id: treeId }, include: { project: true } });
    if (!tree) throw new NotFoundException('Tree not found');
    await this.assertAccess(tree.project, userId);
    return tree;
  }

  async assertAccess(project: { userId: string; teamId: string | null }, userId: string) {
    if (project.userId === userId) return;
    if (project.teamId) {
      const member = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: project.teamId, userId } },
      });
      if (member) return;
    }
    throw new ForbiddenException('No access to this project');
  }
}
