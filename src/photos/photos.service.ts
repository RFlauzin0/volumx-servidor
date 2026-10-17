import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getFileUrl, deleteFile } from '../lib/s3';

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(private prisma: PrismaService) {}

  async create(treeId: string, cloud_storage_path: string, caption?: string) {
    const tree = await this.prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) throw new NotFoundException('Tree not found');
    return this.prisma.treePhoto.create({
      data: { treeId, cloudStoragePath: cloud_storage_path, caption, isPublic: false },
    });
  }

  async findAll(treeId: string) {
    const photos = await this.prisma.treePhoto.findMany({ where: { treeId }, orderBy: { createdAt: 'desc' } });
    const items = await Promise.all(
      photos.map(async (p) => {
        const url = await getFileUrl(p.cloudStoragePath, p.isPublic);
        return { ...p, url };
      }),
    );
    return { items };
  }

  async remove(treeId: string, id: string) {
    const photo = await this.prisma.treePhoto.findUnique({ where: { id } });
    if (!photo || photo.treeId !== treeId) throw new NotFoundException('Photo not found');
    try {
      await deleteFile(photo.cloudStoragePath);
    } catch (e) {
      this.logger.warn(`Failed to delete S3 file: ${photo.cloudStoragePath}`, e);
    }
    await this.prisma.treePhoto.delete({ where: { id } });
    return { success: true };
  }
}
