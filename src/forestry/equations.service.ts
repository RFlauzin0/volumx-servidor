import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

/**
 * Volume equations — the piece that turns VolumX from a tree-measuring tool
 * into an inventory tool.
 *
 * Before this, the only path to a volume was `logSections` (cubagem rigorosa),
 * which requires sectioning the stem. A standing tree measured with DBH and
 * height therefore contributed ZERO volume: the reports showed almost nothing,
 * and the sampling statistics computed a rigorous error over a variable that
 * was zero in nearly every plot.
 *
 * The standard forestry answer is to cube a small sample of trees rigorously,
 * fit an equation to that sample, and apply it to every standing tree. That
 * full cycle is implemented here.
 */

export type EquationType = 'schumacher' | 'spurr' | 'husch' | 'formFactor';
/**
 * Which height an equation is fitted on and applied with. Mixing them — some
 * sample trees with commercial height, others with total — fits one equation
 * to two different variables, so the basis is chosen explicitly.
 */
export type HeightBasis = 'total' | 'commercial';

function pickHeight(t: { height: number; commercialHeight: number | null }, basis: HeightBasis): number | null {
  const h = basis === 'commercial' ? t.commercialHeight : t.height;
  return h != null && h > 0 ? h : null;
}

export interface EquationCoefficients {
  b0?: number;
  b1?: number;
  b2?: number;
  /** Form factor, for type 'formFactor'. */
  f?: number;
  /**
   * Meyer correction factor, exp(s²/2), for models fitted in log space.
   * Back-transforming ln V gives the MEDIAN, not the mean, so every
   * log-fitted equation underestimates volume systematically unless this
   * factor multiplies the result. Absent (= 1) on equations saved before it.
   */
  meyer?: number;
}

export interface FitSample {
  dbh: number;
  height: number;
  volume: number;
}

export interface FitResult {
  type: EquationType;
  coefficients: EquationCoefficients;
  rSquared: number;
  sampleSize: number;
  /** Mean absolute percentage error over the fitting sample. */
  mape: number;
  warnings: string[];
}

@Injectable()
export class EquationsService {
  private readonly logger = new Logger(EquationsService.name);

  constructor(private prisma: PrismaService, private projects: ProjectsService) {}

  // -------------------------------------------------------------------------
  // Applying an equation
  // -------------------------------------------------------------------------

  /**
   * Basal area of a stem, in m², from DBH in cm.
   * g = pi * d² / 40000 (the 40000 converts cm² to m² and halves for radius).
   */
  static basalArea(dbhCm: number): number {
    return (Math.PI * dbhCm * dbhCm) / 40000;
  }

  /**
   * Volume in m³ from DBH (cm) and height (m).
   *
   *  schumacher  V = b0 · D^b1 · H^b2      (Schumacher-Hall, the most used)
   *  spurr       V = b0 + b1 · (D²·H)      (combined variable)
   *  husch       V = b0 · D^b1            (when height is unavailable)
   *  formFactor  V = g · H · f            (simplest, least accurate)
   */
  static applyEquation(
    type: EquationType,
    coef: EquationCoefficients,
    dbhCm: number,
    heightM: number,
  ): number | null {
    if (!(dbhCm > 0)) return null;

    switch (type) {
      case 'schumacher': {
        if (coef.b0 == null || coef.b1 == null || coef.b2 == null) return null;
        if (!(heightM > 0)) return null;
        const v = coef.b0 * Math.pow(dbhCm, coef.b1) * Math.pow(heightM, coef.b2) * (coef.meyer ?? 1);
        return isFinite(v) && v > 0 ? v : null;
      }
      case 'spurr': {
        if (coef.b0 == null || coef.b1 == null) return null;
        if (!(heightM > 0)) return null;
        const v = coef.b0 + coef.b1 * (dbhCm * dbhCm * heightM);
        return isFinite(v) && v > 0 ? v : null;
      }
      case 'husch': {
        if (coef.b0 == null || coef.b1 == null) return null;
        const v = coef.b0 * Math.pow(dbhCm, coef.b1) * (coef.meyer ?? 1);
        return isFinite(v) && v > 0 ? v : null;
      }
      case 'formFactor': {
        if (coef.f == null) return null;
        if (!(heightM > 0)) return null;
        const v = EquationsService.basalArea(dbhCm) * heightM * coef.f;
        return isFinite(v) && v > 0 ? v : null;
      }
      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Linear algebra for fitting
  // -------------------------------------------------------------------------

  /** Gauss-Jordan with partial pivoting. */
  private solve(A: number[][], b: number[]): number[] | null {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      const d = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (f === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row) => row[n]);
  }

  /** Ordinary least squares for y = X·beta, X already including the intercept. */
  private ols(X: number[][], y: number[]): number[] | null {
    const p = X[0].length;
    const A: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
    const b: number[] = new Array(p).fill(0);
    for (let i = 0; i < X.length; i++) {
      for (let r = 0; r < p; r++) {
        for (let c = 0; c < p; c++) A[r][c] += X[i][r] * X[i][c];
        b[r] += X[i][r] * y[i];
      }
    }
    return this.solve(A, b);
  }

  /** exp(s²/2) from the residuals of a log-space fit. */
  private meyerFactor(X: number[][], y: number[], beta: number[]): number {
    const df = y.length - beta.length;
    if (df <= 0) return 1;
    let sse = 0;
    for (let i = 0; i < y.length; i++) {
      const pred = X[i].reduce((s, x, j) => s + x * beta[j], 0);
      sse += (y[i] - pred) ** 2;
    }
    const f = Math.exp(sse / df / 2);
    return isFinite(f) ? Math.round(f * 1e6) / 1e6 : 1;
  }

  // -------------------------------------------------------------------------
  // Fitting
  // -------------------------------------------------------------------------

  /**
   * Fits an equation to rigorously cubed trees.
   *
   * Note on the log transform: Schumacher-Hall and Husch are fitted in log
   * space because that linearises them, but R² and the error are reported on
   * the ORIGINAL scale. A great R² in log space can hide a poor fit in cubic
   * metres, which is what the user actually cares about.
   */
  fit(samples: FitSample[], type: EquationType): FitResult {
    const warnings: string[] = [];
    const clean = (samples ?? []).filter(
      (s) => s && s.dbh > 0 && s.volume > 0 && (type === 'husch' || s.height > 0),
    );

    const minRequired = type === 'schumacher' ? 5 : type === 'formFactor' ? 3 : 4;
    if (clean.length < minRequired) {
      throw new BadRequestException(
        `São necessárias pelo menos ${minRequired} árvores cubadas para ajustar esta equação. Encontradas: ${clean.length}.`,
      );
    }

    let coefficients: EquationCoefficients;

    if (type === 'formFactor') {
      // f is the ratio between the real volume and the volume of a cylinder
      // with the same basal area and height.
      let sumReal = 0;
      let sumCyl = 0;
      for (const s of clean) {
        sumReal += s.volume;
        sumCyl += EquationsService.basalArea(s.dbh) * s.height;
      }
      if (!(sumCyl > 0)) throw new BadRequestException('Dados insuficientes para o fator de forma.');
      coefficients = { f: sumReal / sumCyl };
      if (coefficients.f! < 0.3 || coefficients.f! > 0.9) {
        warnings.push(
          `Fator de forma de ${coefficients.f!.toFixed(3)} está fora da faixa usual (0,40 a 0,75). Verifique as cubagens.`,
        );
      }
    } else if (type === 'spurr') {
      // Linear in the combined variable D²H — no transform needed.
      const X = clean.map((s) => [1, s.dbh * s.dbh * s.height]);
      const y = clean.map((s) => s.volume);
      const beta = this.ols(X, y);
      if (!beta) throw new BadRequestException('Não foi possível ajustar: dados degenerados.');
      coefficients = { b0: beta[0], b1: beta[1] };
    } else if (type === 'husch') {
      // ln V = ln b0 + b1 · ln D
      const X = clean.map((s) => [1, Math.log(s.dbh)]);
      const y = clean.map((s) => Math.log(s.volume));
      const beta = this.ols(X, y);
      if (!beta) throw new BadRequestException('Não foi possível ajustar: dados degenerados.');
      coefficients = { b0: Math.exp(beta[0]), b1: beta[1], meyer: this.meyerFactor(X, y, beta) };
    } else {
      // Schumacher-Hall: ln V = ln b0 + b1 · ln D + b2 · ln H
      const X = clean.map((s) => [1, Math.log(s.dbh), Math.log(s.height)]);
      const y = clean.map((s) => Math.log(s.volume));
      const beta = this.ols(X, y);
      if (!beta) throw new BadRequestException('Não foi possível ajustar: dados degenerados.');
      coefficients = { b0: Math.exp(beta[0]), b1: beta[1], b2: beta[2], meyer: this.meyerFactor(X, y, beta) };
      if (beta[1] < 1 || beta[1] > 3.2) {
        warnings.push(
          `O expoente do diâmetro (${beta[1].toFixed(2)}) está fora do usual (1,7 a 2,3). Pode indicar amostra pequena ou cubagens inconsistentes.`,
        );
      }
    }

    // R² and MAPE on the original scale.
    const meanObs = clean.reduce((s, x) => s + x.volume, 0) / clean.length;
    let ssRes = 0;
    let ssTot = 0;
    let absPct = 0;
    for (const s of clean) {
      const pred = EquationsService.applyEquation(type, coefficients, s.dbh, s.height) ?? 0;
      ssRes += (s.volume - pred) ** 2;
      ssTot += (s.volume - meanObs) ** 2;
      absPct += Math.abs((pred - s.volume) / s.volume);
    }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const mape = (absPct / clean.length) * 100;

    if (clean.length < 10) {
      warnings.push(`Amostra pequena (${clean.length} árvores). O ideal são 15 a 30 para uma equação confiável.`);
    }
    if (rSquared < 0.85) {
      warnings.push(`R² de ${rSquared.toFixed(3)} é baixo. A equação explica pouco da variação do volume.`);
    }

    // Warn about extrapolation range — applying an equation outside the
    // diameter range it was fitted on is a classic and silent source of error.
    const dbhs = clean.map((s) => s.dbh);
    warnings.push(
      `Ajustada para DAP entre ${Math.min(...dbhs).toFixed(0)} e ${Math.max(...dbhs).toFixed(0)} cm. Fora dessa faixa o resultado é extrapolação.`,
    );

    return {
      type,
      coefficients,
      rSquared: Math.round(rSquared * 10000) / 10000,
      sampleSize: clean.length,
      mape: Math.round(mape * 100) / 100,
      warnings,
    };
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  async list(userId: string, projectId?: string) {
    const items = await this.prisma.volumeEquation.findMany({
      where: {
        userId,
        ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
      },
      orderBy: [{ isFitted: 'desc' }, { createdAt: 'desc' }],
    });
    return { items };
  }

  async create(userId: string, data: any) {
    const type = data?.type as EquationType;
    if (!['schumacher', 'spurr', 'husch', 'formFactor'].includes(type)) {
      throw new BadRequestException('Tipo de equação inválido.');
    }
    // Reject an equation that cannot produce a number — better to fail here
    // than to silently write zeros across an entire inventory.
    const test = EquationsService.applyEquation(type, data?.coefficients ?? {}, 30, 20);
    if (test == null) {
      throw new BadRequestException('Coeficientes incompletos ou inválidos para este tipo de equação.');
    }
    return this.prisma.volumeEquation.create({
      data: {
        userId,
        name: data?.name ?? 'Equação',
        type,
        coefficients: data?.coefficients ?? {},
        speciesName: data?.speciesName ?? null,
        projectId: data?.projectId ?? null,
        rSquared: data?.rSquared ?? null,
        sampleSize: data?.sampleSize ?? null,
        isFitted: !!data?.isFitted,
        heightBasis: data?.heightBasis === 'commercial' ? 'commercial' : 'total',
        notes: data?.notes ?? null,
      },
    });
  }

  async remove(userId: string, id: string) {
    const eq = await this.prisma.volumeEquation.findFirst({ where: { id, userId } });
    if (!eq) throw new BadRequestException('Equação não encontrada.');
    await this.prisma.volumeEquation.delete({ where: { id } });
    return { success: true };
  }

  /** Collects the rigorously cubed trees of a project as fitting samples. */
  async gatherSamples(userId: string, projectId: string, heightBasis: HeightBasis = 'total'): Promise<FitSample[]> {
    // Team members may fit equations too; `project: { userId }` only matched
    // the owner, so a team member saw "0 árvores cubadas" on a team project.
    await this.projects.assertProjectAccess(projectId, userId);
    // Only RIGOROUS cubagem is a sample. After an equation was applied, every
    // standing tree had a calculation with method 'equation', and the next fit
    // took those estimates as if they were measurements — the equation was
    // fitted to its own output and reported an R² near 1.
    const trees = await this.prisma.tree.findMany({
      where: { projectId },
      include: {
        volumeCalculations: {
          where: { method: { not: 'equation' } },
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });
    return trees
      .filter((t) => (t.volumeCalculations?.length ?? 0) > 0)
      .map((t) => ({
        dbh: t.dbh,
        height: pickHeight(t, heightBasis) ?? 0,
        volume: t.volumeCalculations[0].totalVolume,
      }))
      .filter((s) => s.dbh > 0 && s.volume > 0);
  }

  async fitFromProject(userId: string, projectId: string, type: EquationType, heightBasis: HeightBasis = 'total') {
    const samples = await this.gatherSamples(userId, projectId, heightBasis);
    return { ...this.fit(samples, type), samples: samples.length, heightBasis };
  }

  /**
   * Recomputes a tree's ESTIMATED volume after its DBH or height was edited.
   * Without this the old estimate stayed in place and the inventory silently
   * disagreed with the tree's own measurements. Rigorous cubagem is never
   * touched — it does not depend on DBH/height.
   */
  async recalcTree(treeId: string) {
    const calc = await this.prisma.volumeCalculation.findFirst({
      where: { treeId, method: 'equation' },
      orderBy: { calculatedAt: 'desc' },
    });
    if (!calc) return null;
    const meta = Array.isArray(calc.sectionVolumes) ? (calc.sectionVolumes as any[])[0] : null;
    const equationId = meta?.equationId;
    if (!equationId) return null;
    const eq = await this.prisma.volumeEquation.findUnique({ where: { id: equationId } });
    const tree = await this.prisma.tree.findUnique({ where: { id: treeId } });
    if (!eq || !tree) return null;
    const h = pickHeight(tree, (eq.heightBasis as HeightBasis) ?? 'total');
    const v = EquationsService.applyEquation(eq.type as EquationType, eq.coefficients as EquationCoefficients, tree.dbh, h ?? 0);
    if (v == null) {
      // The new measurements no longer support the equation: drop the stale estimate.
      await this.prisma.volumeCalculation.delete({ where: { id: calc.id } });
      return null;
    }
    const withBark = !eq.isFitted && tree.barkPercentage && tree.barkPercentage > 0
      ? v * Math.pow(1 - tree.barkPercentage / 100, 2)
      : v;
    return this.prisma.volumeCalculation.update({
      where: { id: calc.id },
      data: {
        totalVolume: parseFloat(withBark.toFixed(6)),
        sectionVolumes: [{ ...meta, dbh: tree.dbh, height: h }],
        calculatedAt: new Date(),
      },
    });
  }

  /**
   * Applies an equation to every standing tree of a project that has no
   * rigorous cubagem, writing a VolumeCalculation for each.
   *
   * Trees that were cubed are left untouched: a measured volume always beats
   * an estimated one, and overwriting it would destroy the very data the
   * equation was fitted on.
   */
  async applyToProject(userId: string, projectId: string, equationId: string) {
    const eq = await this.prisma.volumeEquation.findFirst({ where: { id: equationId, userId } });
    if (!eq) throw new BadRequestException('Equação não encontrada.');
    await this.projects.assertProjectAccess(projectId, userId);

    const trees = await this.prisma.tree.findMany({
      where: { projectId },
      include: { volumeCalculations: { select: { method: true } } },
    });

    let applied = 0;
    let skippedCubed = 0;
    let skippedInvalid = 0;
    let totalVolume = 0;

    for (const t of trees) {
      const alreadyMeasured = (t.volumeCalculations ?? []).some((c) => c.method !== 'equation');
      if (alreadyMeasured) { skippedCubed += 1; continue; }

      if (eq.speciesName && t.speciesName !== eq.speciesName) { skippedInvalid += 1; continue; }

      const h = pickHeight(t, (eq.heightBasis as HeightBasis) ?? 'total');
      const v = EquationsService.applyEquation(
        eq.type as EquationType,
        eq.coefficients as EquationCoefficients,
        t.dbh,
        h ?? 0,
      );
      if (v == null) { skippedInvalid += 1; continue; }

      // Bark is a share of the DIAMETER, so the deduction is quadratic.
      // But only for literature equations: a FITTED equation was fitted on
      // cubagem volumes that already had bark removed (volume.service deducts
      // it), so deducting again here removed the bark twice.
      const withBark = !eq.isFitted && t.barkPercentage && t.barkPercentage > 0
        ? v * Math.pow(1 - t.barkPercentage / 100, 2)
        : v;

      // Replace a previous estimate rather than piling up duplicates.
      await this.prisma.volumeCalculation.deleteMany({
        where: { treeId: t.id, method: 'equation' },
      });
      await this.prisma.volumeCalculation.create({
        data: {
          treeId: t.id,
          method: 'equation',
          totalVolume: parseFloat(withBark.toFixed(6)),
          sectionVolumes: [{ equationId: eq.id, equation: eq.name, type: eq.type, dbh: t.dbh, height: h }],
          barkPercentage: t.barkPercentage ?? null,
          calculatedByUserId: userId,
        },
      });
      applied += 1;
      totalVolume += withBark;
    }

    this.logger.log(`Equation ${eq.name} applied to ${applied} trees in project ${projectId}`);
    return {
      applied,
      skippedCubed,
      skippedInvalid,
      totalVolume: parseFloat(totalVolume.toFixed(4)),
      equationName: eq.name,
    };
  }
}
