import { Controller, Post, Get, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncService } from './sync.service';
import { SyncPushDto } from './dto/sync-push.dto';

@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/sync')
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('push')
  @ApiOperation({ summary: 'Push offline changes to server' })
  push(@Req() req: Request, @Body() dto: SyncPushDto) {
    return this.syncService.push((req.user as any).id, dto.changes);
  }

  @Get('pull')
  @ApiOperation({ summary: 'Pull changes since timestamp' })
  @ApiQuery({ name: 'since', required: true, description: 'ISO8601 timestamp' })
  pull(@Req() req: Request, @Query('since') since: string) {
    return this.syncService.pull((req.user as any).id, since);
  }
}
