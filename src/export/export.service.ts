import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as s3Lib from '../lib/s3';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private prisma: PrismaService) {}

  async exportProject(projectId: string, format: string, userId: string) {
    this.logger.log(`Exporting project ${projectId} as ${format} for user ${userId}`);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        parcels: {
          include: {
            trees: {
              include: {
                volumeCalculations: { orderBy: { calculatedAt: 'desc' }, take: 1 },
                logSections: { orderBy: { sectionNumber: 'asc' } },
                measuredBy: { select: { name: true } },
              },
            },
          },
        },
        user: { select: { name: true } },
      },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado');

    try {
      if (format === 'pdf') {
        return await this.generatePdf(project);
      } else {
        return await this.generateExcel(project);
      }
    } catch (err) {
      this.logger.error(`Export failed for project ${projectId}: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  private async uploadBuffer(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
    const cloud_storage_path = await s3Lib.putBuffer(fileName, contentType, buffer);
    return await s3Lib.getFileUrl(cloud_storage_path, false);
  }

  private computeStats(project: any) {
    let totalTrees = 0;
    let totalVolume = 0;
    let totalDbh = 0;
    let totalHeight = 0;
    let minDbh = Infinity;
    let maxDbh = 0;
    let minHeight = Infinity;
    let maxHeight = 0;
    const speciesCount: Record<string, number> = {};
    const methodCount: Record<string, number> = {};

    for (const parcel of project.parcels ?? []) {
      for (const tree of parcel.trees ?? []) {
        totalTrees++;
        const dbh = tree?.dbh ?? 0;
        const h = tree?.height ?? 0;
        totalDbh += dbh;
        totalHeight += h;
        if (dbh > 0) { minDbh = Math.min(minDbh, dbh); maxDbh = Math.max(maxDbh, dbh); }
        if (h > 0) { minHeight = Math.min(minHeight, h); maxHeight = Math.max(maxHeight, h); }
        const sp = tree?.speciesName ?? 'Desconhecida';
        speciesCount[sp] = (speciesCount[sp] ?? 0) + 1;
        if ((tree?.volumeCalculations?.length ?? 0) > 0) {
          const vol = tree.volumeCalculations[0];
          totalVolume += vol?.totalVolume ?? 0;
          const m = vol?.method ?? 'N/A';
          methodCount[m] = (methodCount[m] ?? 0) + 1;
        }
      }
    }
    // Diameter classes are the standard way forestry reports present a stand:
    // 10 cm wide classes show whether the stand is young, mature or uneven-aged.
    const dbhClasses: Record<string, number> = {};
    const speciesVolume: Record<string, number> = {};
    let totalArea = 0;
    for (const parcel of project.parcels ?? []) {
      totalArea += parcel?.area ?? 0;
      for (const tree of parcel.trees ?? []) {
        const dbh = tree?.dbh ?? 0;
        if (dbh > 0) {
          const lower = Math.floor(dbh / 10) * 10;
          const key = `${lower}-${lower + 10}`;
          dbhClasses[key] = (dbhClasses[key] ?? 0) + 1;
        }
        const sp = tree?.speciesName ?? 'Desconhecida';
        const v = (tree?.volumeCalculations?.length ?? 0) > 0
          ? (tree.volumeCalculations[0]?.totalVolume ?? 0) : 0;
        speciesVolume[sp] = (speciesVolume[sp] ?? 0) + v;
      }
    }

    return {
      totalTrees,
      totalVolume,
      avgDbh: totalTrees > 0 ? totalDbh / totalTrees : 0,
      avgHeight: totalTrees > 0 ? totalHeight / totalTrees : 0,
      minDbh: minDbh === Infinity ? 0 : minDbh,
      maxDbh,
      minHeight: minHeight === Infinity ? 0 : minHeight,
      maxHeight,
      speciesCount,
      speciesVolume,
      dbhClasses,
      methodCount,
      totalArea,
      avgVolumePerTree: totalTrees > 0 ? totalVolume / totalTrees : 0,
      volumePerHa: totalArea > 0 ? totalVolume / totalArea : 0,
      treesPerHa: totalArea > 0 ? totalTrees / totalArea : 0,
      totalSpecies: Object.keys(speciesCount).length,
      totalParcels: project.parcels?.length ?? 0,
    };
  }

  private async generatePdf(project: any) {
    const pdfMod: any = await import('pdfkit');
    const PDFDocument = pdfMod.default ?? pdfMod;
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];

    const stats = this.computeStats(project);
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');

    return new Promise<{ downloadUrl: string; expiresAt: string }>(async (resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const fileName = `relatorio-${project.name.replace(/\s+/g, '-')}-${Date.now()}.pdf`;
          const downloadUrl = await this.uploadBuffer(buffer, fileName, 'application/pdf');
          resolve({ downloadUrl, expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() });
        } catch (e) {
          this.logger.error('PDF upload failed', e);
          reject(e);
        }
      });
      doc.on('error', (e: any) => { this.logger.error('PDF generation error', e); reject(e); });

      // ---- Design tokens ----
      const GREEN = '#2F6B3A';
      const GREEN_LT = '#5FA86E';
      const DARK = '#0D1F0A';
      const AMBER = '#C4943A';
      const INK = '#1F2620';
      const MUTED = '#6B7268';
      const RULE = '#DCDCD2';
      const ZEBRA = '#F7F7F2';
      const M = 44;                       // page margin
      const pageW = doc.page.width - M * 2;
      const bottomLimit = doc.page.height - 62;

      // ---- Drawing helpers ----
      const money = (n: number, d = 3) =>
        (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

      const ensure = (need: number) => {
        if (doc.y + need > bottomLimit) { doc.addPage(); doc.y = M; }
      };

      const sectionTitle = (text: string, sub?: string) => {
        ensure(46);
        doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text(text, M, doc.y);
        if (sub) {
          doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(sub, M, doc.y + 1);
        }
        const y = doc.y + 4;
        doc.rect(M, y, 46, 2.4).fill(AMBER);
        doc.rect(M + 50, y + 0.7, pageW - 50, 1).fill(RULE);
        doc.y = y + 13;
      };

      /** Horizontal bar chart — far easier to read than a bare number column. */
      const barChart = (
        rows: { label: string; value: number; extra?: string }[],
        opts: { unit?: string; max?: number; color?: string } = {},
      ) => {
        const color = opts.color ?? GREEN;
        const labelW = 132;
        const valueW = 92;
        const barW = pageW - labelW - valueW - 12;
        const max = opts.max ?? Math.max(...rows.map((r) => r.value), 1);

        doc.fontSize(8.5).font('Helvetica');
        rows.forEach((r, i) => {
          ensure(17);
          const y = doc.y;
          if (i % 2 === 0) doc.rect(M, y - 2.5, pageW, 16).fill(ZEBRA);

          doc.fillColor(INK).font('Helvetica')
            .text(r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label, M + 5, y + 1, {
              width: labelW - 8, lineBreak: false,
            });

          const w = Math.max(2, (r.value / max) * barW);
          doc.roundedRect(M + labelW, y + 1.5, w, 8.5, 2).fill(color);

          doc.fillColor(INK).font('Helvetica-Bold')
            .text(r.extra ?? `${r.value}${opts.unit ?? ''}`, M + labelW + barW + 8, y + 1, {
              width: valueW, align: 'right', lineBreak: false,
            });

          doc.y = y + 14;
        });
        doc.y += 6;
      };

      /** Table with a repeating header and zebra rows. */
      const table = (
        headers: string[],
        widths: number[],
        rows: string[][],
        aligns: ('left' | 'center' | 'right')[],
      ) => {
        const drawHead = () => {
          const y = doc.y;
          doc.rect(M, y, pageW, 17).fill(DARK);
          doc.fillColor('#FFFFFF').fontSize(7.8).font('Helvetica-Bold');
          let cx = M + 5;
          headers.forEach((h, i) => {
            doc.text(h, cx, y + 5, { width: widths[i] - 6, align: aligns[i], lineBreak: false });
            cx += widths[i];
          });
          doc.y = y + 17;
        };

        ensure(40);
        drawHead();

        doc.font('Helvetica').fontSize(7.8);
        rows.forEach((row, idx) => {
          if (doc.y + 14 > bottomLimit) { doc.addPage(); doc.y = M; drawHead(); doc.font('Helvetica').fontSize(7.8); }
          const y = doc.y;
          if (idx % 2 === 1) doc.rect(M, y, pageW, 13.5).fill(ZEBRA);
          let cx = M + 5;
          doc.fillColor(INK);
          row.forEach((v, i) => {
            doc.text(v, cx, y + 3.4, { width: widths[i] - 6, align: aligns[i], lineBreak: false });
            cx += widths[i];
          });
          doc.y = y + 13.5;
        });
        doc.rect(M, doc.y, pageW, 0.8).fill(RULE);
        doc.y += 10;
      };

      // =====================================================================
      // COVER PAGE
      // =====================================================================
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FFFFFF');
      doc.rect(0, 0, doc.page.width, 232).fill(DARK);
      doc.rect(0, 232, doc.page.width, 5).fill(AMBER);

      doc.fillColor(AMBER).fontSize(9).font('Helvetica-Bold')
        .text('VOLUMX  ·  INVENTÁRIO FLORESTAL', M, 52, { characterSpacing: 2.2 });

      doc.fillColor('#FFFFFF').fontSize(30).font('Helvetica-Bold')
        .text('Relatório de Inventário', M, 78, { width: pageW });
      doc.fillColor(GREEN_LT).fontSize(30).font('Helvetica-Bold')
        .text(project.name ?? '', M, 112, { width: pageW });

      doc.fillColor('#C9D3C6').fontSize(10).font('Helvetica')
        .text(`${project.location ?? 'Localização não informada'}`, M, 162, { width: pageW });
      doc.fillColor('#8E9A8B').fontSize(9)
        .text(`Responsável: ${project.user?.name ?? 'N/A'}   ·   Emitido em ${dateStr}`, M, 178, { width: pageW });

      // Headline figures on the cover
      const kpiY = 272;
      const kpis = [
        { label: 'ÁRVORES', value: String(stats.totalTrees) },
        { label: 'VOLUME TOTAL', value: `${money(stats.totalVolume)} m³` },
        { label: 'ESPÉCIES', value: String(stats.totalSpecies) },
        { label: 'PARCELAS', value: String(stats.totalParcels) },
      ];
      const kW = (pageW - 3 * 10) / 4;
      kpis.forEach((k, i) => {
        const x = M + i * (kW + 10);
        doc.roundedRect(x, kpiY, kW, 62, 6).lineWidth(1).fillAndStroke('#F4F6F2', RULE);
        doc.rect(x, kpiY, kW, 3).fill(i % 2 === 0 ? GREEN : AMBER);
        doc.fillColor(MUTED).fontSize(6.8).font('Helvetica-Bold')
          .text(k.label, x + 9, kpiY + 13, { width: kW - 18, characterSpacing: 0.8 });
        doc.fillColor(DARK).fontSize(16).font('Helvetica-Bold')
          .text(k.value, x + 9, kpiY + 28, { width: kW - 18 });
      });

      // Secondary indicators
      const sec = [
        ['DAP médio', `${stats.avgDbh.toFixed(1)} cm`, `variação ${stats.minDbh.toFixed(0)}–${stats.maxDbh.toFixed(0)} cm`],
        ['Altura média', `${stats.avgHeight.toFixed(1)} m`, `variação ${stats.minHeight.toFixed(0)}–${stats.maxHeight.toFixed(0)} m`],
        ['Volume médio/árvore', `${money(stats.avgVolumePerTree, 4)} m³`, `${stats.totalTrees} árvores medidas`],
      ];
      let sy = kpiY + 84;
      doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold').text('Indicadores do povoamento', M, sy);
      sy += 20;
      sec.forEach(([label, value, note], i) => {
        if (i > 0) { doc.rect(M, sy - 6, pageW, 0.8).fill(RULE); }
        doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(label, M + 4, sy, { width: 200 });
        doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold').text(value, M + 210, sy - 2, { width: 130 });
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(note, M + 345, sy, { width: pageW - 345, align: 'right' });
        sy += 26;
      });

      if (stats.totalArea > 0) {
        doc.roundedRect(M, sy + 6, pageW, 52, 6).lineWidth(1).fillAndStroke('#F4F6F2', RULE);
        doc.fillColor(GREEN).fontSize(8).font('Helvetica-Bold')
          .text('RENDIMENTO POR HECTARE', M + 12, sy + 16, { characterSpacing: 0.8 });
        doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
          .text(`${money(stats.volumePerHa)} m³/ha`, M + 12, sy + 31);
        doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
          .text(`${stats.treesPerHa.toFixed(1)} árvores/ha`, M + 180, sy + 31);
        doc.fillColor(MUTED).fontSize(8).font('Helvetica')
          .text(`Área inventariada: ${stats.totalArea.toFixed(2)} ha`, M + 360, sy + 34, {
            width: pageW - 372, align: 'right',
          });
      }

      // =====================================================================
      // PAGE 2 — COMPOSITION
      // =====================================================================
      doc.addPage();
      doc.y = M;

      const speciesEntries = Object.entries(stats.speciesCount).sort((a, b) => b[1] - a[1]);
      if (speciesEntries.length > 0) {
        sectionTitle('Composição por espécie', 'Número de indivíduos e participação no volume total');
        barChart(
          speciesEntries.slice(0, 14).map(([sp, count]) => {
            const pct = stats.totalTrees > 0 ? (count / stats.totalTrees) * 100 : 0;
            return { label: sp, value: count, extra: `${count}  (${pct.toFixed(1)}%)` };
          }),
        );

        const volEntries = Object.entries(stats.speciesVolume)
          .filter(([, v]) => (v as number) > 0)
          .sort((a, b) => (b[1] as number) - (a[1] as number));
        if (volEntries.length > 0) {
          sectionTitle('Volume por espécie');
          table(
            ['Espécie', 'Árvores', 'Volume (m³)', '% do volume', 'Vol. médio (m³)'],
            [pageW * 0.34, pageW * 0.13, pageW * 0.19, pageW * 0.17, pageW * 0.17],
            volEntries.map(([sp, v]) => {
              const n = stats.speciesCount[sp] ?? 0;
              const pct = stats.totalVolume > 0 ? ((v as number) / stats.totalVolume) * 100 : 0;
              return [
                sp,
                String(n),
                money(v as number),
                `${pct.toFixed(1)}%`,
                money(n > 0 ? (v as number) / n : 0, 4),
              ];
            }),
            ['left', 'center', 'right', 'right', 'right'],
          );
        }
      }

      const classEntries = Object.entries(stats.dbhClasses)
        .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
      if (classEntries.length > 0) {
        sectionTitle('Distribuição diamétrica', 'Classes de 10 cm — indica a estrutura e a maturidade do povoamento');
        barChart(
          classEntries.map(([cls, count]) => {
            const pct = stats.totalTrees > 0 ? (count / stats.totalTrees) * 100 : 0;
            return { label: `${cls} cm`, value: count, extra: `${count}  (${pct.toFixed(1)}%)` };
          }),
          { color: GREEN_LT },
        );
      }

      const methodEntries = Object.entries(stats.methodCount).sort((a, b) => b[1] - a[1]);
      if (methodEntries.length > 0) {
        sectionTitle('Métodos de cubagem utilizados');
        table(
          ['Método', 'Árvores', '% do total'],
          [pageW * 0.5, pageW * 0.25, pageW * 0.25],
          methodEntries.map(([m, c]) => [
            m,
            String(c),
            `${stats.totalTrees > 0 ? ((c / stats.totalTrees) * 100).toFixed(1) : '0'}%`,
          ]),
          ['left', 'center', 'right'],
        );
      }

      // =====================================================================
      // PARCEL DETAIL
      // =====================================================================
      for (const parcel of project.parcels ?? []) {
        doc.addPage();
        doc.y = M;

        const trees = parcel.trees ?? [];
        const pVol = trees.reduce((sum: number, t: any) =>
          sum + ((t?.volumeCalculations?.length ?? 0) > 0 ? (t.volumeCalculations[0]?.totalVolume ?? 0) : 0), 0);
        const pDbh = trees.length > 0
          ? trees.reduce((sum: number, t: any) => sum + (t?.dbh ?? 0), 0) / trees.length : 0;

        doc.rect(M, doc.y, pageW, 54).fill('#F4F6F2');
        doc.rect(M, doc.y, 3.5, 54).fill(AMBER);
        doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold')
          .text(parcel.name ?? 'Parcela', M + 14, doc.y + 9, { width: pageW - 28 });
        doc.fillColor(MUTED).fontSize(8.5).font('Helvetica')
          .text(
            `${trees.length} árvores   ·   ${parcel.area ? parcel.area + ' ha' : 'área não informada'}` +
            `   ·   ${money(pVol)} m³   ·   DAP médio ${pDbh.toFixed(1)} cm`,
            M + 14, doc.y + 30, { width: pageW - 28 },
          );
        doc.y += 66;

        if (parcel.description) {
          doc.fillColor(MUTED).fontSize(8.5).font('Helvetica-Oblique')
            .text(parcel.description, M, doc.y, { width: pageW });
          doc.y += 16;
        }

        if (trees.length > 0) {
          sectionTitle('Árvores medidas');
          table(
            ['#', 'Espécie', 'DAP', 'H tot.', 'H com.', 'POM', 'Volume (m³)', 'Método'],
            [pageW * 0.05, pageW * 0.25, pageW * 0.09, pageW * 0.09, pageW * 0.09, pageW * 0.08, pageW * 0.15, pageW * 0.20],
            trees.map((tree: any, idx: number) => {
              const vol = (tree?.volumeCalculations?.length ?? 0) > 0 ? tree.volumeCalculations[0] : null;
              return [
                String(idx + 1),
                tree?.speciesName ?? '—',
                tree?.dbh != null ? Number(tree.dbh).toFixed(1) : '—',
                tree?.height != null ? Number(tree.height).toFixed(1) : '—',
                tree?.commercialHeight != null ? Number(tree.commercialHeight).toFixed(1) : '—',
                // POM is only worth printing when it departs from the 1.30 m
                // standard, which is what a management plan needs flagged.
                tree?.pom != null && Math.abs(tree.pom - 1.3) > 0.05
                  ? Number(tree.pom).toFixed(2) : '1,30',
                vol ? money(vol?.totalVolume ?? 0, 4) : '—',
                vol?.method === 'equation' ? 'Equação' : (vol?.method ?? '—'),
              ];
            }),
            ['center', 'left', 'right', 'right', 'right', 'right', 'right', 'left'],
          );
        } else {
          doc.fillColor(MUTED).fontSize(9).font('Helvetica-Oblique')
            .text('Nenhuma árvore medida nesta parcela.', M, doc.y, { width: pageW });
        }
      }

      // =====================================================================
      // FOOTERS — skip the cover so it stays clean
      // =====================================================================
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        if (i === range.start) continue;
        doc.rect(M, doc.page.height - 44, pageW, 0.8).fill(RULE);
        doc.fillColor(MUTED).fontSize(7).font('Helvetica')
          .text(`VolumX · ${project.name ?? ''}`, M, doc.page.height - 36, {
            width: pageW / 2, align: 'left', lineBreak: false,
          });
        doc.fillColor(MUTED).fontSize(7)
          .text(`${dateStr}   ·   Página ${i + 1 - range.start} de ${range.count - 1}`,
            M + pageW / 2, doc.page.height - 36, {
              width: pageW / 2, align: 'right', lineBreak: false,
            });
      }

      doc.end();
    });
  }

  private async generateExcel(project: any) {
    // exceljs is CommonJS: a dynamic import gives the module under .default,
    // so `new ExcelJS.Workbook()` failed and every Excel export returned 500.
    const excelMod: any = await import('exceljs');
    const ExcelJS = excelMod.default ?? excelMod;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VolumX';
    workbook.created = new Date();

    const stats = this.computeStats(project);
    const dateStr = new Date().toLocaleDateString('pt-BR');

    const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D1F0A' } };
    const headerFont: any = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const accentFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A7D44' } };
    const lightFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F0' } };
    const borderStyle: any = { style: 'thin', color: { argb: 'FFCCCCCC' } };
    const border: any = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };

    // === RESUMO ===
    const summary = workbook.addWorksheet('Resumo');
    summary.properties.defaultColWidth = 18;

    // Title
    summary.mergeCells('A1:D1');
    const titleCell = summary.getCell('A1');
    titleCell.value = 'VolumX - Relatório de Inventário Florestal';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF0D1F0A' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4D9' } };

    summary.mergeCells('A2:D2');
    summary.getCell('A2').value = `Gerado em ${dateStr}`;
    summary.getCell('A2').font = { italic: true, color: { argb: 'FF999999' } };

    const infoStart = 4;
    const infoRows: [string, any][] = [
      ['Projeto', project.name ?? ''],
      ['Localização', project.location ?? 'N/A'],
      ['Responsável', project.user?.name ?? 'N/A'],
      ['— IDENTIFICAÇÃO —', ''],
      ['Total de Parcelas', stats.totalParcels],
      ['Área Inventariada (ha)', Number(stats.totalArea.toFixed(2))],
      ['Total de Espécies', stats.totalSpecies],
      ['Total de Árvores', stats.totalTrees],
      ['— VOLUME —', ''],
      ['Volume Total (m³)', Number(stats.totalVolume.toFixed(4))],
      ['Volume Médio por Árvore (m³)', Number(stats.avgVolumePerTree.toFixed(4))],
      ['Volume por Hectare (m³/ha)', Number(stats.volumePerHa.toFixed(3))],
      ['Árvores por Hectare', Number(stats.treesPerHa.toFixed(1))],
      ['— DENDROMETRIA —', ''],
      ['DAP Médio (cm)', Number(stats.avgDbh.toFixed(1))],
      ['DAP Mínimo (cm)', Number(stats.minDbh.toFixed(1))],
      ['DAP Máximo (cm)', Number(stats.maxDbh.toFixed(1))],
      ['Altura Média (m)', Number(stats.avgHeight.toFixed(1))],
      ['Altura Mínima (m)', Number(stats.minHeight.toFixed(1))],
      ['Altura Máxima (m)', Number(stats.maxHeight.toFixed(1))],
    ];
    infoRows.forEach((row, i) => {
      const r = summary.getRow(infoStart + i);
      const isGroup = String(row[0]).startsWith('—');

      if (isGroup) {
        // Section divider — makes a long list of figures scannable.
        summary.mergeCells(`A${infoStart + i}:B${infoStart + i}`);
        const c = r.getCell(1);
        c.value = String(row[0]).replace(/—/g, '').trim();
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        c.fill = accentFill;
        c.alignment = { horizontal: 'left', vertical: 'middle' };
        r.height = 18;
        return;
      }

      r.getCell(1).value = row[0];
      r.getCell(1).font = { bold: true, color: { argb: 'FF3A3A32' } };
      r.getCell(1).fill = lightFill;
      r.getCell(1).border = border;
      r.getCell(1).alignment = { vertical: 'middle' };

      const c2 = r.getCell(2);
      c2.value = row[1];
      c2.border = border;
      c2.alignment = { horizontal: 'right', vertical: 'middle' };
      if (typeof row[1] === 'number') {
        c2.font = { bold: true };
        c2.numFmt = Number.isInteger(row[1]) ? '#,##0' : '#,##0.000';
      }
    });

    // Species distribution
    const spStart = infoStart + infoRows.length + 2;
    summary.mergeCells(`A${spStart}:C${spStart}`);
    summary.getCell(`A${spStart}`).value = 'Distribuição por Espécie';
    summary.getCell(`A${spStart}`).font = { bold: true, size: 12, color: { argb: 'FF0D1F0A' } };

    const spHeaderRow = summary.getRow(spStart + 1);
    ['Espécie', 'Quantidade', '% do Total', 'Volume (m³)', '% do Volume'].forEach((h, i) => {
      const c = spHeaderRow.getCell(i + 1);
      c.value = h; c.fill = accentFill; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.border = border;
    });

    const speciesEntries = Object.entries(stats.speciesCount).sort((a, b) => b[1] - a[1]);
    speciesEntries.forEach(([sp, count], i) => {
      const r = summary.getRow(spStart + 2 + i);
      r.getCell(1).value = sp; r.getCell(1).border = border;
      r.getCell(2).value = count; r.getCell(2).border = border; r.getCell(2).alignment = { horizontal: 'center' };
      const pct = stats.totalTrees > 0 ? (count / stats.totalTrees) * 100 : 0;
      r.getCell(3).value = pct / 100; r.getCell(3).numFmt = '0.0%'; r.getCell(3).border = border; r.getCell(3).alignment = { horizontal: 'center' };

      const spVol = (stats.speciesVolume as any)[sp] ?? 0;
      r.getCell(4).value = Number(spVol.toFixed(4));
      r.getCell(4).numFmt = '#,##0.0000';
      r.getCell(4).border = border;
      r.getCell(4).alignment = { horizontal: 'right' };

      const volPct = stats.totalVolume > 0 ? spVol / stats.totalVolume : 0;
      r.getCell(5).value = volPct;
      r.getCell(5).numFmt = '0.0%';
      r.getCell(5).border = border;
      r.getCell(5).alignment = { horizontal: 'center' };

      if (i % 2 === 0) { for (let c = 1; c <= 5; c++) r.getCell(c).fill = lightFill; }
    });

    // === CLASSES DIAMÉTRICAS ===
    // Kept on its own sheet so it can be charted directly in Excel.
    const classSheet = workbook.addWorksheet('Classes Diamétricas');
    classSheet.mergeCells('A1:D1');
    classSheet.getCell('A1').value = 'Distribuição Diamétrica (classes de 10 cm)';
    classSheet.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF0D1F0A' } };
    classSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4D9' } };
    classSheet.getRow(1).height = 22;

    const clsHeader = classSheet.getRow(3);
    ['Classe (cm)', 'Nº de Árvores', '% do Total', '% Acumulado'].forEach((h, i) => {
      const c = clsHeader.getCell(i + 1);
      c.value = h; c.fill = headerFill; c.font = headerFont; c.border = border;
      c.alignment = { horizontal: 'center' };
    });
    classSheet.getRow(3).height = 20;

    const classEntries = Object.entries(stats.dbhClasses)
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
    let cumulative = 0;
    classEntries.forEach(([cls, count], i) => {
      cumulative += count as number;
      const r = classSheet.getRow(4 + i);
      r.getCell(1).value = `${cls}`;
      r.getCell(2).value = count;
      r.getCell(3).value = stats.totalTrees > 0 ? (count as number) / stats.totalTrees : 0;
      r.getCell(3).numFmt = '0.0%';
      r.getCell(4).value = stats.totalTrees > 0 ? cumulative / stats.totalTrees : 0;
      r.getCell(4).numFmt = '0.0%';
      for (let c = 1; c <= 4; c++) {
        r.getCell(c).border = border;
        r.getCell(c).alignment = { horizontal: c === 1 ? 'left' : 'center' };
        if (i % 2 === 0) r.getCell(c).fill = lightFill;
      }
    });
    [16, 16, 14, 16].forEach((w, i) => { classSheet.getColumn(i + 1).width = w; });
    classSheet.views = [{ state: 'frozen', ySplit: 3 }];

    summary.getColumn(1).width = 30;
    summary.getColumn(2).width = 22;
    summary.getColumn(3).width = 14;
    summary.getColumn(4).width = 16;
    summary.getColumn(5).width = 14;
    summary.getRow(1).height = 26;
    summary.views = [{ state: 'frozen', ySplit: 2 }];

    // === ÁRVORES ===
    const treesSheet = workbook.addWorksheet('Árvores');
    const treeHeaders = [
      '#', 'Plaqueta', 'Parcela', 'Estrato', 'Espécie', 'CAP (cm)', 'DAP (cm)', 'POM (m)',
      'Altura total (m)', 'Altura com. (m)', 'Latitude', 'Longitude',
      'Casca (%)', 'Volume (m³)', 'Método volume', 'Método medição',
      'Confiança (%)', 'Qualidade fuste', 'Sanidade', 'Situação', 'Medido por', 'Observações',
    ];
    const treeHeaderRow = treesSheet.getRow(1);
    treeHeaders.forEach((h, i) => {
      const c = treeHeaderRow.getCell(i + 1);
      c.value = h; c.fill = headerFill; c.font = headerFont; c.border = border; c.alignment = { horizontal: 'center' };
    });
    treesSheet.getRow(1).height = 22;

    let treeIdx = 0;
    for (const parcel of project.parcels ?? []) {
      for (const tree of parcel.trees ?? []) {
        treeIdx++;
        const vol = (tree?.volumeCalculations?.length ?? 0) > 0 ? tree.volumeCalculations[0] : null;
        const r = treesSheet.getRow(treeIdx + 1);
        const vals = [
          treeIdx, tree?.tagNumber ?? '', parcel.name ?? '', parcel?.stratum ?? '', tree?.speciesName ?? '',
          // CAP is recorded as measured; when absent it is derived from DBH so
          // the column is never empty for a tree that has a diameter.
          tree?.cap ?? (tree?.dbh != null ? parseFloat((tree.dbh * Math.PI).toFixed(1)) : ''),
          tree?.dbh ?? '',
          tree?.pom ?? 1.3,
          tree?.height ?? '', tree?.commercialHeight ?? '',
          tree?.latitude ?? '', tree?.longitude ?? '',
          tree?.barkPercentage ?? '', vol?.totalVolume ?? '',
          vol?.method === 'equation' ? 'Equação' : (vol?.method ?? ''),
          tree?.measurementMethod ?? '',
          tree?.measurementConfidence ?? '',
          tree?.stemQuality ?? '', tree?.sanity ?? '', tree?.treeStatus ?? '',
          tree?.measuredBy?.name ?? '', tree?.notes ?? '',
        ];
        vals.forEach((v, i) => {
          const c = r.getCell(i + 1);
          c.value = v; c.border = border;
          if (i >= 5 && i <= 19) c.alignment = { horizontal: 'center' };
        });
        if (treeIdx % 2 === 0) vals.forEach((_, i) => { r.getCell(i + 1).fill = lightFill; });
      }
    }

    [5, 10, 16, 14, 20, 10, 10, 9, 12, 12, 12, 12, 9, 12, 13, 16, 11, 10, 11, 14, 15, 25]
      .forEach((w, i) => { treesSheet.getColumn(i + 1).width = w; });
    treesSheet.autoFilter = { from: 'A1', to: `Q${treeIdx + 1}` };
    treesSheet.views = [{ state: 'frozen', ySplit: 1 }];
    // Coordinates need 6 decimals to be useful; volumes need 4.
    treesSheet.getColumn(9).numFmt = '0.000000';
    treesSheet.getColumn(10).numFmt = '0.000000';
    treesSheet.getColumn(12).numFmt = '#,##0.0000';
    treesSheet.getColumn(6).numFmt = '0.00';

    // === VOLUMES ===
    const volumesSheet = workbook.addWorksheet('Volumes');
    const volHeaders = ['#', 'Parcela', 'Espécie', 'DAP (cm)', 'Altura (m)', 'Método', 'Volume Total (m³)', 'Casca (%)'];
    const volHeaderRow = volumesSheet.getRow(1);
    volHeaders.forEach((h, i) => {
      const c = volHeaderRow.getCell(i + 1);
      c.value = h; c.fill = headerFill; c.font = headerFont; c.border = border; c.alignment = { horizontal: 'center' };
    });

    let volIdx = 0;
    for (const parcel of project.parcels ?? []) {
      for (const tree of parcel.trees ?? []) {
        for (const vol of tree?.volumeCalculations ?? []) {
          volIdx++;
          const r = volumesSheet.getRow(volIdx + 1);
          const vals = [
            volIdx, parcel.name ?? '', tree?.speciesName ?? '',
            tree?.dbh ?? '', tree?.height ?? '',
            vol?.method ?? '', vol?.totalVolume ?? '', vol?.barkPercentage ?? '',
          ];
          vals.forEach((v, i) => {
            const c = r.getCell(i + 1);
            c.value = v; c.border = border;
            if (i >= 3) c.alignment = { horizontal: 'center' };
          });
          if (volIdx % 2 === 0) vals.forEach((_, i) => { r.getCell(i + 1).fill = lightFill; });
        }
      }
    }
    [5, 18, 22, 10, 10, 12, 14, 10].forEach((w, i) => { volumesSheet.getColumn(i + 1).width = w; });

    // === PARCELAS ===
    const parcelsSheet = workbook.addWorksheet('Parcelas');
    const parcelHeaders = ['#', 'Nome', 'Área (ha)', 'Descrição', 'Nº Árvores'];
    const parcelHeaderRow = parcelsSheet.getRow(1);
    parcelHeaders.forEach((h, i) => {
      const c = parcelHeaderRow.getCell(i + 1);
      c.value = h; c.fill = headerFill; c.font = headerFont; c.border = border; c.alignment = { horizontal: 'center' };
    });

    (project.parcels ?? []).forEach((parcel: any, idx: number) => {
      const r = parcelsSheet.getRow(idx + 2);
      const vals = [idx + 1, parcel.name ?? '', parcel.area ?? '', parcel.description ?? '', parcel.trees?.length ?? 0];
      vals.forEach((v, i) => {
        const c = r.getCell(i + 1);
        c.value = v; c.border = border;
      });
      if (idx % 2 === 0) vals.forEach((_, i) => { r.getCell(i + 1).fill = lightFill; });
    });
    [5, 22, 12, 35, 12].forEach((w, i) => { parcelsSheet.getColumn(i + 1).width = w; });

    // === SEÇÕES DE TORA ===
    const sectionsSheet = workbook.addWorksheet('Seções de Tora');
    const secHeaders = ['#', 'Parcela', 'Espécie', 'Seção', 'Comp. (m)', 'Diâm. Maior (cm)', 'Diâm. Menor (cm)', 'Volume (m³)'];
    const secHeaderRow = sectionsSheet.getRow(1);
    secHeaders.forEach((h, i) => {
      const c = secHeaderRow.getCell(i + 1);
      c.value = h; c.fill = headerFill; c.font = headerFont; c.border = border; c.alignment = { horizontal: 'center' };
    });

    let secIdx = 0;
    for (const parcel of project.parcels ?? []) {
      for (const tree of parcel.trees ?? []) {
        for (const sec of tree?.logSections ?? []) {
          secIdx++;
          const r = sectionsSheet.getRow(secIdx + 1);
          const vals = [
            secIdx, parcel.name ?? '', tree?.speciesName ?? '',
            sec?.sectionNumber ?? '', sec?.length ?? '', sec?.largerDiameter ?? '',
            sec?.smallerDiameter ?? '', sec?.volume ?? '',
          ];
          vals.forEach((v, i) => {
            const c = r.getCell(i + 1);
            c.value = v; c.border = border;
            if (i >= 3) c.alignment = { horizontal: 'center' };
          });
          if (secIdx % 2 === 0) vals.forEach((_, i) => { r.getCell(i + 1).fill = lightFill; });
        }
      }
    }
    [5, 18, 22, 8, 10, 14, 14, 12].forEach((w, i) => { sectionsSheet.getColumn(i + 1).width = w; });

    const buffer = await workbook.xlsx.writeBuffer() as Buffer;
    const fileName = `relatorio-${project.name.replace(/\s+/g, '-')}-${Date.now()}.xlsx`;
    const downloadUrl = await this.uploadBuffer(
      Buffer.from(buffer),
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return { downloadUrl, expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() };
  }
}
