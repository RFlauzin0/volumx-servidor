import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogSectionInput } from './dto/create-sections.dto';

@Injectable()
export class SectionsService {
  private readonly logger = new Logger(SectionsService.name);

  constructor(private prisma: PrismaService) {}

  async replaceSections(treeId: string, sections: LogSectionInput[]) {
    const tree = await this.prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) throw new NotFoundException('Tree not found');

    // Delete existing sections and create new ones in a transaction
    await this.prisma.$transaction([
      this.prisma.logSection.deleteMany({ where: { treeId } }),
      ...sections.map((s) =>
        this.prisma.logSection.create({
          data: {
            treeId,
            sectionNumber: s.sectionNumber,
            length: s.length,
            diameterSmallEnd: s.diameterSmallEnd,
            diameterLargeEnd: s.diameterLargeEnd,
            diameterMiddle: s.diameterMiddle,
          },
        }),
      ),
    ]);

    const result = await this.prisma.logSection.findMany({
      where: { treeId },
      orderBy: { sectionNumber: 'asc' },
    });
    return { items: result };
  }

  async findAll(treeId: string) {
    const sections = await this.prisma.logSection.findMany({
      where: { treeId },
      orderBy: { sectionNumber: 'asc' },
    });
    return { items: sections };
  }

  async removeAll(treeId: string) {
    await this.prisma.logSection.deleteMany({ where: { treeId } });
    return { success: true };
  }
}
