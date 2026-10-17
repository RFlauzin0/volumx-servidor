import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService, private projects: ProjectsService) {}

  async getUserDashboard(userId: string) {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);

    const projectWhere = { OR: [{ userId }, { teamId: { in: teamIds } }] };

    const totalProjects = await this.prisma.project.count({ where: projectWhere as any });
    const totalTrees = await this.prisma.tree.count({
      where: { project: projectWhere as any },
    });

    // Sum the LATEST calculation per tree rather than every row ever written.
    // A plain aggregate double-counts any tree that was recalculated.
    const treesWithVol = await this.prisma.tree.findMany({
      where: { project: projectWhere as any },
      select: {
        volumeCalculations: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
          select: { totalVolume: true },
        },
      },
    });
    const volumeSum = treesWithVol.reduce(
      (acc, t) => acc + (t.volumeCalculations[0]?.totalVolume ?? 0), 0,
    );

    const recentProjects = await this.prisma.project.findMany({
      where: projectWhere as any,
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { _count: { select: { trees: true, parcels: true } } },
    });

    const recentActivity = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    });

    return {
      totalProjects,
      totalTrees,
      totalVolume: parseFloat(volumeSum.toFixed(4)),
      recentProjects: recentProjects.map((p) => ({
        ...p,
        parcelCount: p._count.parcels,
        treeCount: p._count.trees,
        _count: undefined,
      })),
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        action: a.action,
        description: `${a.action} ${a.entityType}`,
        userName: a.user.name,
        timestamp: a.timestamp,
      })),
    };
  }

  async getProjectStats(projectId: string, userId: string) {
    // userId was received and ignored: any account could read any project's stats.
    await this.projects.assertProjectAccess(projectId, userId);

    const treeCount = await this.prisma.tree.count({ where: { projectId } });

    // Same fix as above: latest calculation per tree, never every row.
    const projTrees = await this.prisma.tree.findMany({
      where: { projectId },
      select: {
        volumeCalculations: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
          select: { totalVolume: true },
        },
      },
    });
    const projVolumeSum = projTrees.reduce(
      (acc, t) => acc + (t.volumeCalculations[0]?.totalVolume ?? 0), 0,
    );

    // Species distribution
    const speciesRaw = await this.prisma.tree.groupBy({
      by: ['speciesName'],
      where: { projectId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Diameter distribution (histogram buckets)
    const trees = await this.prisma.tree.findMany({
      where: { projectId },
      select: { dbh: true },
    });
    const buckets = [
      { range: '0-10', min: 0, max: 10 },
      { range: '10-20', min: 10, max: 20 },
      { range: '20-30', min: 20, max: 30 },
      { range: '30-40', min: 30, max: 40 },
      { range: '40-50', min: 40, max: 50 },
      { range: '50+', min: 50, max: Infinity },
    ];
    const diameterDistribution = buckets.map((b) => ({
      range: b.range,
      count: trees.filter((t) => t.dbh >= b.min && t.dbh < b.max).length,
    }));

    // Parcel stats
    const parcels = await this.prisma.parcel.findMany({
      where: { projectId },
      include: {
        _count: { select: { trees: true } },
        trees: {
          include: {
            volumeCalculations: {
              orderBy: { calculatedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const parcelStats = parcels.map((p) => {
      const volume = p.trees.reduce((sum, t) => {
        const latest = t.volumeCalculations[0];
        return sum + (latest?.totalVolume || 0);
      }, 0);
      return {
        parcelId: p.id,
        parcelName: p.name,
        treeCount: p._count.trees,
        volume: parseFloat(volume.toFixed(4)),
      };
    });

    return {
      treeCount,
      totalVolume: parseFloat(projVolumeSum.toFixed(4)),
      speciesDistribution: speciesRaw.map((s) => ({ species: s.speciesName, count: s._count.id })),
      diameterDistribution,
      parcelStats,
    };
  }
}
