import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LogPileService, LogPileResult, QuickScanResult } from './logpile.service';

class AnalyzeLogPileDto {
  @ApiProperty({ description: 'Base64 encoded image' })
  @IsString()
  imageBase64: string;

  @ApiProperty({ description: 'Length of logs in meters' })
  @IsNumber()
  logLengthM: number;

  @ApiProperty({ description: 'Optional reference scale in cm', required: false })
  @IsNumber()
  @IsOptional()
  referenceScaleCm?: number;
}

class QuickScanDto {
  @ApiProperty({ description: 'Base64 encoded image (low res for speed)' })
  @IsString()
  imageBase64: string;
}

@ApiTags('Log Pile Analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/logpile')
export class LogPileController {
  private readonly logger = new Logger(LogPileController.name);

  constructor(private logPileService: LogPileService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Full analysis: detect logs, measure diameters, calculate volume' })
  @ApiBody({ type: AnalyzeLogPileDto })
  async analyzeLogPile(@Body() body: AnalyzeLogPileDto): Promise<LogPileResult> {
    this.logger.log(`Full analysis, length=${body?.logLengthM}m`);
    return this.logPileService.analyzeLogPile(
      body?.imageBase64 ?? '',
      body?.logLengthM ?? 2,
      body?.referenceScaleCm,
    );
  }

  @Post('quick-scan')
  @ApiOperation({ summary: 'Quick scan: fast count and rough positions of logs for real-time preview' })
  @ApiBody({ type: QuickScanDto })
  async quickScan(@Body() body: QuickScanDto): Promise<QuickScanResult> {
    this.logger.log('Quick scan requested');
    return this.logPileService.quickScan(body?.imageBase64 ?? '');
  }
}
