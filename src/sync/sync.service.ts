import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncChangeDto } from './dto/sync-push.dto';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private prisma: PrismaService) {}

  async push(userId: string, changes: SyncChangeDto[]) {
    const results: { entityType: string; localId: string; serverId: string; status: string }[] = [];

    for (const change of changes) {
      try {
        let serverId = '';
        switch (change.action) {
          case 'create': {
            serverId = await this.handleCreate(userId, change);
            break;
          }
          case 'update': {
            serverId = await this.handleUpdate(userId, change);
            break;
          }
          case 'delete': {
            serverId = await this.handleDelete(change);
            break;
          }
        }
        results.push({ entityType: change.entityType, localId: change.localId, serverId, status: 'success' });
      } catch (e: any) {
        this.logger.error(`Sync error for ${change.entityType}/${change.localId}`, e.message);
        results.push({ entityType: change.entityType, localId: change.localId, serverId: '', status: `error: ${e.message}` });
      }
    }

    return { results };
  }

  private async handleCreate(userId: string, change: SyncChangeDto): Promise<string> {
    const { entityType, payload } = change;
    switch (entityType) {
      case 'project': {
        const p = await this.prisma.project.create({ data: { ...payload, userId } as any });
        return p.id;
      }
      case 'parcel': {
        const p = await this.prisma.parcel.create({ data: payload as any });
        return p.id;
      }
      case 'tree': {
        const t = await this.prisma.tree.create({ data: { ...payload, measuredByUserId: userId } as any });
        return t.id;
      }
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  private async handleUpdate(userId: string, change: SyncChangeDto): Promise<string> {
    const { entityType, payload } = change;
    const id = payload.id;
    if (!id) throw new Error('Missing id in payload for update');
    switch (entityType) {
      case 'project':
        await this.prisma.project.update({ where: { id }, data: payload as any });
        return id;
      case 'parcel':
        await this.prisma.parcel.update({ where: { id }, data: payload as any });
        return id;
      case 'tree':
        await this.prisma.tree.update({ where: { id }, data: payload as any });
        return id;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  private async handleDelete(change: SyncChangeDto): Promise<string> {
    const { entityType, payload } = change;
    const id = payload.id;
    if (!id) throw new Error('Missing id in payload for delete');
    switch (entityType) {
      case 'project':
        await this.prisma.project.delete({ where: { id } });
        return id;
      case 'parcel':
        await this.prisma.parcel.delete({ where: { id } });
        return id;
      case 'tree':
        await this.prisma.tree.delete({ where: { id } });
        return id;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  async pull(userId: string, since: string) {
    const sinceDate = new Date(since);

    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);
    const projectWhere = { OR: [{ userId }, { teamId: { in: teamIds } }] };

    const projects = await this.prisma.project.findMany({
      where: { ...projectWhere, updatedAt: { gte: sinceDate } } as any,
    });

    const projectIds = (await this.prisma.project.findMany({
      where: projectWhere as any,
      select: { id: true },
    })).map((p) => p.id);

    const parcels = await this.prisma.parcel.findMany({
      where: { projectId: { in: projectIds }, updatedAt: { gte: sinceDate } },
    });

    const trees = await this.prisma.tree.findMany({
      where: { projectId: { in: projectIds }, updatedAt: { gte: sinceDate } },
    });

    // Get deleted entities from audit log
    const deletedLogs = await this.prisma.auditLog.findMany({
      where: {
        action: 'delete',
        timestamp: { gte: sinceDate },
        userId,
      },
    });

    return {
      projects,
      parcels,
      trees,
      deletedIds: deletedLogs.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
      syncedAt: new Date().toISOString(),
    };
  }
}
