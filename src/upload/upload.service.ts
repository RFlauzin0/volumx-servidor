import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as s3 from '../lib/s3';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private prisma: PrismaService) {}

  async getPresignedUrl(fileName: string, contentType: string, isPublic: boolean) {
    return s3.generatePresignedUploadUrl(fileName, contentType, isPublic);
  }

  async completeUpload(userId: string, cloud_storage_path: string, fileName?: string, contentType?: string, isPublic?: boolean) {
    const file = await this.prisma.file.create({
      data: {
        userId,
        fileName: fileName || cloud_storage_path.split('/').pop() || 'unknown',
        cloudStoragePath: cloud_storage_path,
        isPublic: isPublic || false,
        contentType: contentType || 'application/octet-stream',
      },
    });
    return { cloud_storage_path: file.cloudStoragePath };
  }

  async getFileUrl(id: string, mode: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    const url = await s3.getFileUrl(file.cloudStoragePath, file.isPublic);
    return { url };
  }

  async deleteFile(id: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    try {
      await s3.deleteFile(file.cloudStoragePath);
    } catch (e) {
      this.logger.warn(`Failed to delete S3 file`, e);
    }
    await this.prisma.file.delete({ where: { id } });
    return { success: true };
  }
}
