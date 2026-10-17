import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadService } from './upload.service';
import { PresignedUploadDto, CompleteUploadDto } from './dto/presigned-upload.dto';

@ApiTags('File Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('upload/presigned')
  @ApiOperation({ summary: 'Get presigned URL for file upload' })
  getPresignedUrl(@Body() dto: PresignedUploadDto) {
    return this.uploadService.getPresignedUrl(dto.fileName, dto.contentType, dto.isPublic || false);
  }

  @Post('upload/complete')
  @ApiOperation({ summary: 'Confirm file upload completion' })
  completeUpload(@Req() req: Request, @Body() dto: CompleteUploadDto) {
    return this.uploadService.completeUpload((req.user as any).id, dto.cloud_storage_path);
  }

  @Get('files/:id/url')
  @ApiOperation({ summary: 'Get file URL' })
  @ApiQuery({ name: 'mode', required: false, enum: ['view', 'download'] })
  getFileUrl(@Param('id') id: string, @Query('mode') mode?: string) {
    return this.uploadService.getFileUrl(id, mode || 'view');
  }

  @Delete('files/:id')
  @ApiOperation({ summary: 'Delete file' })
  deleteFile(@Param('id') id: string) {
    return this.uploadService.deleteFile(id);
  }
}
