import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateParcelDto } from './dto/create-parcel.dto';
import { UpdateParcelDto } from './dto/update-parcel.dto';

@Injectable()
export class ParcelsService {
  private readonly logger = new Logger(ParcelsService.name);

  constructor(
    private prisma: PrismaService,
    private projectsService: ProjectsService,
  ) {}

  async create(projectId: string, userId: string, dto: CreateParcelDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.projectsService.assertAccess(project, userId);
    return this.prisma.parcel.create({ data: { ...dto, projectId } });
  }

  async findAll(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.projectsService.assertAccess(project, userId);

    const parcels = await this.prisma.parcel.findMany({
      where: { projectId },
      include: { _count: { select: { trees: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { items: parcels.map((p) => ({ ...p, treeCount: p._count.trees, _count: undefined })) };
  }

  async findOne(projectId: string, id: string, userId: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { id },
      include: { _count: { select: { trees: true } }, project: true },
    });
    if (!parcel || parcel.projectId !== projectId) throw new NotFoundException('Parcel not found');
    await this.projectsService.assertAccess(parcel.project, userId);
    return { ...parcel, treeCount: parcel._count.trees, _count: undefined, project: undefined };
  }

  async update(projectId: string, id: string, userId: string, dto: UpdateParcelDto) {
    const parcel = await this.prisma.parcel.findUnique({ where: { id }, include: { project: true } });
    if (!parcel || parcel.projectId !== projectId) throw new NotFoundException('Parcel not found');
    await this.projectsService.assertAccess(parcel.project, userId);
    return this.prisma.parcel.update({ where: { id }, data: dto });
  }

  async remove(projectId: string, id: string, userId: string) {
    const parcel = await this.prisma.parcel.findUnique({ where: { id }, include: { project: true } });
    if (!parcel || parcel.projectId !== projectId) throw new NotFoundException('Parcel not found');
    await this.projectsService.assertAccess(parcel.project, userId);
    await this.prisma.parcel.delete({ where: { id } });
    return { success: true };
  }
}
