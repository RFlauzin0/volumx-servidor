import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'Get audit history for entity' })
  getHistory(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.auditService.getHistory(entityType, entityId);
  }
}
