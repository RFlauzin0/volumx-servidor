import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(entityType: string, entityId: string, action: string, changes: any, userId: string) {
    try {
      await this.prisma.auditLog.create({
        data: { entityType, entityId, action, changes, userId },
      });
    } catch (e) {
      this.logger.error(`Failed to create audit log: ${entityType}/${entityId}`, e);
    }
  }

  async getHistory(entityType: string, entityId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { user: { select: { name: true } } },
      orderBy: { timestamp: 'desc' },
    });
    return {
      items: logs.map((l) => ({
        id: l.id,
        action: l.action,
        changes: l.changes,
        userName: l.user.name,
        timestamp: l.timestamp,
      })),
    };
  }
}
