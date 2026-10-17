import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateTreeDto } from './dto/create-tree.dto';
import { UpdateTreeDto } from './dto/update-tree.dto';
import { AuditService } from '../audit/audit.service';
import { EquationsService } from '../forestry/equations.service';

/** Fields the tree list may be sorted by. Anything else used to crash Prisma with a 500. */
const SORTABLE = new Set(['createdAt', 'measuredAt', 'speciesName', 'dbh', 'height', 'tagNumber']);

@Injectable()
export class TreesService {
  private readonly logger = new Logger(TreesService.name);

  constructor(
    private prisma: PrismaService,
    private projectsService: ProjectsService,
    private auditService: AuditService,
    private equations: EquationsService,
  ) {}

  async create(parcelId: string, userId: string, dto: CreateTreeDto) {
    const parcel = await this.prisma.parcel.findUnique({ where: { id: parcelId }, include: { project: true } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    await this.projectsService.assertAccess(parcel.project, userId);

    const tree = await this.prisma.tree.create({
      data: {
        ...dto,
        parcelId,
        projectId: parcel.projectId,
        measuredByUserId: userId,
      },
      include: { measuredBy: { select: { id: true, name: true } }, _count: { select: { photos: true } } },
    });

    await this.auditService.log('tree', tree.id, 'create', null, userId);
    return { ...tree, measuredByName: tree.measuredBy.name, photoCount: tree._count.photos, measuredBy: undefined, _count: undefined };
  }

  async findByParcel(parcelId: string, userId: string, species?: string, sortBy?: string, order?: string) {
    const parcel = await this.prisma.parcel.findUnique({ where: { id: parcelId }, include: { project: true } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    await this.projectsService.assertAccess(parcel.project, userId);

    const where: any = { parcelId };
    if (species) where.speciesName = { contains: species, mode: 'insensitive' };

    const orderBy: any = {};
    if (sortBy && SORTABLE.has(sortBy)) orderBy[sortBy] = order === 'desc' ? 'desc' : 'asc';
    else orderBy.createdAt = 'desc';

    const trees = await this.prisma.tree.findMany({
      where,
      include: { measuredBy: { select: { id: true, name: true } }, _count: { select: { photos: true } } },
      orderBy,
    });
    return { items: trees.map((t) => ({ ...t, measuredByName: t.measuredBy.name, photoCount: t._count.photos, measuredBy: undefined, _count: undefined })) };
  }

  async findByProject(projectId: string, userId: string, parcelId?: string, species?: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.projectsService.assertAccess(project, userId);

    const where: any = { projectId };
    if (parcelId) where.parcelId = parcelId;
    if (species) where.speciesName = { contains: species, mode: 'insensitive' };

    // The sampling screen sums `volumeCalculations[0].totalVolume` per plot,
    // but this listing never included it — every plot came out at 0 m³/ha and
    // the sampling error was computed over zeros. Latest calculation only.
    const trees = await this.prisma.tree.findMany({
      where,
      include: {
        measuredBy: { select: { id: true, name: true } },
        _count: { select: { photos: true } },
        volumeCalculations: { orderBy: { calculatedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items: trees.map((t) => ({ ...t, measuredByName: t.measuredBy.name, photoCount: t._count.photos, measuredBy: undefined, _count: undefined })) };
  }

  async findOne(id: string, userId: string) {
    const tree = await this.prisma.tree.findUnique({
      where: { id },
      include: {
        measuredBy: { select: { id: true, name: true } },
        photos: true,
        volumeCalculations: { orderBy: { calculatedAt: 'desc' } },
        logSections: { orderBy: { sectionNumber: 'asc' } },
        _count: { select: { photos: true } },
        project: true,
      },
    });
    if (!tree) throw new NotFoundException('Tree not found');
    await this.projectsService.assertAccess(tree.project, userId);
    return {
      ...tree,
      measuredByName: tree.measuredBy.name,
      photoCount: tree._count.photos,
      measuredBy: undefined,
      _count: undefined,
      project: undefined,
    };
  }

  async update(id: string, userId: string, dto: UpdateTreeDto) {
    const tree = await this.prisma.tree.findUnique({ where: { id }, include: { project: true } });
    if (!tree) throw new NotFoundException('Tree not found');
    await this.projectsService.assertAccess(tree.project, userId);

    const before = { speciesName: tree.speciesName, dbh: tree.dbh, height: tree.height, notes: tree.notes, barkPercentage: tree.barkPercentage };
    const updated = await this.prisma.tree.update({
      where: { id },
      data: dto,
      include: { measuredBy: { select: { id: true, name: true } }, _count: { select: { photos: true } } },
    });

    await this.auditService.log('tree', id, 'update', { before, after: dto }, userId);

    const dimsChanged = (dto.dbh != null && dto.dbh !== tree.dbh)
      || (dto.height != null && dto.height !== tree.height)
      || (dto.commercialHeight !== undefined && dto.commercialHeight !== tree.commercialHeight)
      || (dto.barkPercentage !== undefined && dto.barkPercentage !== tree.barkPercentage);
    if (dimsChanged) await this.equations.recalcTree(id);
    return { ...updated, measuredByName: updated.measuredBy.name, photoCount: updated._count.photos, measuredBy: undefined, _count: undefined };
  }

  async remove(id: string, userId: string) {
    const tree = await this.prisma.tree.findUnique({ where: { id }, include: { project: true } });
    if (!tree) throw new NotFoundException('Tree not found');
    await this.projectsService.assertAccess(tree.project, userId);
    await this.prisma.tree.delete({ where: { id } });
    await this.auditService.log('tree', id, 'delete', null, userId);
    return { success: true };
  }
}
