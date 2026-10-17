import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items, total, unreadCount };
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== userId) throw new NotFoundException('Notification not found');
    await this.prisma.notification.update({ where: { id }, data: { read: true } });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { success: true };
  }

  async registerToken(userId: string, token: string, deviceType?: string) {
    await this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, deviceType },
      create: { userId, token, deviceType },
    });
    return { success: true };
  }

  async removeToken(token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token } });
    return { success: true };
  }

  async sendPushNotification(userId: string, title: string, body: string, data?: Record<string, any>) {
    // Create in-app notification
    await this.prisma.notification.create({
      data: { userId, title, body, type: 'team_edit', data: data || {} },
    });

    // Send via Expo Push API
    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    for (const t of tokens) {
      try {
        const message = { to: t.token, sound: 'default', title, body, data: data || {} };
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        const result = await res.json();
        if (result.data?.status === 'error' && result.data?.details?.error === 'DeviceNotRegistered') {
          await this.prisma.pushToken.delete({ where: { id: t.id } });
        }
      } catch (e) {
        this.logger.error(`Failed to send push to ${t.token}`, e);
      }
    }
  }
}
