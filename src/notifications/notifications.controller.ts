import { Controller, Get, Patch, Post, Delete, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get('notifications')
  @ApiOperation({ summary: 'List notifications (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Req() req: Request, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.notificationsService.findAll((req.user as any).id, parseInt(page || '1'), parseInt(limit || '20'));
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string, @Req() req: Request) {
    return this.notificationsService.markRead(id, (req.user as any).id);
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Req() req: Request) {
    return this.notificationsService.markAllRead((req.user as any).id);
  }

  @Post('push-tokens')
  @ApiOperation({ summary: 'Register Expo push token' })
  registerToken(@Req() req: Request, @Body() dto: RegisterTokenDto) {
    return this.notificationsService.registerToken((req.user as any).id, dto.token, dto.deviceType);
  }

  @Delete('push-tokens/:token')
  @ApiOperation({ summary: 'Remove push token' })
  removeToken(@Param('token') token: string) {
    return this.notificationsService.removeToken(token);
  }
}
