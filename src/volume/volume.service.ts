import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VolumeService {
  private readonly logger = new Logger(VolumeService.name);

  constructor(private prisma: PrismaService) {}

  private crossSectionArea(diameterCm: number): number {
    // Convert cm to m: d/100, radius = d/200
    // A = π * (d/200)²
    const radiusM = diameterCm / 200;
    return Math.PI * radiusM * radiusM;
  }

  /** Converts a bark percentage into the factor that multiplies the volume. */
  static barkFactor(barkPercentage: number | null | undefined, mode: 'diameter' | 'volume' = 'diameter'): number {
    if (barkPercentage == null || !(barkPercentage > 0) || barkPercentage >= 100) return 1;
    // Share of the DIAMETER: volume goes with d², so the deduction is quadratic.
    // Share of the VOLUME (how many field sheets express it): linear.
    return mode === 'volume' ? 1 - barkPercentage / 100 : Math.pow(1 - barkPercentage / 100, 2);
  }

  async calculate(
    treeId: string,
    method: string,
    barkPercentage: number | undefined,
    userId: string,
    opts: { barkMode?: 'diameter' | 'volume'; stumpHeight?: number; topLength?: number } = {},
  ) {
    const tree = await this.prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) throw new NotFoundException('Tree not found');

    const sections = await this.prisma.logSection.findMany({
      where: { treeId },
      orderBy: { sectionNumber: 'asc' },
    });
    if (sections.length === 0) throw new BadRequestException('No log sections defined for this tree');

    const sectionVolumes: { sectionNumber: number; volume: number }[] = [];
    let totalVolume = 0;

    for (const s of sections) {
      let volume: number;

      switch (method) {
        case 'smalian': {
          // V = (L/2) * (A_small + A_large)
          const aSmall = this.crossSectionArea(s.diameterSmallEnd);
          const aLarge = this.crossSectionArea(s.diameterLargeEnd);
          volume = (s.length / 2) * (aSmall + aLarge);
          break;
        }
        case 'huber': {
          // V = L * A_middle
          if (s.diameterMiddle == null) {
            throw new BadRequestException(`Huber method requires diameterMiddle for section ${s.sectionNumber}`);
          }
          const aMiddle = this.crossSectionArea(s.diameterMiddle);
          volume = s.length * aMiddle;
          break;
        }
        case 'newton': {
          // V = (L/6) * (A_small + 4*A_middle + A_large)
          if (s.diameterMiddle == null) {
            throw new BadRequestException(`Newton method requires diameterMiddle for section ${s.sectionNumber}`);
          }
          const aSmallN = this.crossSectionArea(s.diameterSmallEnd);
          const aMiddleN = this.crossSectionArea(s.diameterMiddle);
          const aLargeN = this.crossSectionArea(s.diameterLargeEnd);
          volume = (s.length / 6) * (aSmallN + 4 * aMiddleN + aLargeN);
          break;
        }
        default:
          throw new BadRequestException(`Unknown method: ${method}`);
      }

      // BARK DEDUCTION — applies to EVERY method.
      // It used to sit inside the Newton branch only, so Smalian and Huber
      // silently ignored bark entirely and over-reported timber volume.
      //
      // It is also quadratic, not linear: barkPercentage is a share of the
      // DIAMETER, and volume goes with the square of the diameter. Deducting
      // it linearly understated the deduction by roughly half.
      volume = volume * VolumeService.barkFactor(barkPercentage, opts.barkMode);

      sectionVolumes.push({ sectionNumber: s.sectionNumber, volume: parseFloat(volume.toFixed(6)) });
      totalVolume += volume;
    }

    // STUMP and TOP. Summing the sections alone leaves out the stump (a
    // cylinder from the ground to the first cut) and the top above the last
    // section (a cone). Both are part of the stem volume in standard cubagem.
    const bf = VolumeService.barkFactor(barkPercentage, opts.barkMode);
    let stumpVolume = 0;
    let topVolume = 0;
    if (opts.stumpHeight && opts.stumpHeight > 0) {
      stumpVolume = this.crossSectionArea(sections[0].diameterLargeEnd) * opts.stumpHeight * bf;
      sectionVolumes.push({ sectionNumber: 0, volume: parseFloat(stumpVolume.toFixed(6)) });
    }
    if (opts.topLength && opts.topLength > 0) {
      const last = sections[sections.length - 1];
      topVolume = (this.crossSectionArea(last.diameterSmallEnd) * opts.topLength / 3) * bf;
      sectionVolumes.push({ sectionNumber: sections.length + 1, volume: parseFloat(topVolume.toFixed(6)) });
    }
    totalVolume += stumpVolume + topVolume;

    // ONE calculation per tree.
    //
    // Without this, recalculating a tree (say Smalian and then Newton) left two
    // rows behind. The dashboard sums every row, so the total volume doubled,
    // while the report reads only the newest row — the two screens disagreed
    // and neither said why. Keeping a single current calculation makes every
    // consumer agree by construction.
    await this.prisma.volumeCalculation.deleteMany({ where: { treeId } });

    const calc = await this.prisma.volumeCalculation.create({
      data: {
        treeId,
        method,
        totalVolume: parseFloat(totalVolume.toFixed(6)),
        sectionVolumes,
        barkPercentage: barkPercentage ?? null,
        calculatedByUserId: userId,
      },
    });

    return {
      id: calc.id,
      treeId: calc.treeId,
      method: calc.method,
      totalVolume: calc.totalVolume,
      sectionVolumes,
      barkPercentage: calc.barkPercentage,
      calculatedAt: calc.calculatedAt,
      calculatedByUserId: calc.calculatedByUserId,
    };
  }

  async findAll(treeId: string) {
    const calcs = await this.prisma.volumeCalculation.findMany({
      where: { treeId },
      orderBy: { calculatedAt: 'desc' },
    });
    return { items: calcs };
  }
}
