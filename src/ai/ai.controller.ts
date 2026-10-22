import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { geminiEnabled, geminiDiagnostics } from './gemini';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/ai')
export class AiController {
  constructor(private ai: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the AI features are enabled on this server' })
  status() {
    return { enabled: geminiEnabled() || !!process.env.ANTHROPIC_API_KEY, ...geminiDiagnostics() };
  }

  @Post('chat')
  @ApiOperation({ summary: 'Ask the VolumX forestry assistant' })
  chat(@Req() req: Request, @Body() body: any) {
    return this.ai.chat((req.user as any).id, body);
  }
}
