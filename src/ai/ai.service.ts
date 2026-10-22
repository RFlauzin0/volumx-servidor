import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { geminiGenerate, GeminiTurn, imagePart } from './gemini';

const SYSTEM = `Você é o Assistente VolumX, um engenheiro florestal experiente que ajuda consultores
e técnicos de campo no Brasil, principalmente na Amazônia (Acre).

Ajude com: inventário florestal, dendrometria, cubagem (Smalian, Huber, Newton), equações de
volume (Schumacher-Hall, Spurr), amostragem (casual simples, estratificada), fitossociologia
(IVI, IVC, Shannon), manejo florestal sustentável (PMFS, POA, DMC, porta-sementes, intensidade de
corte), legislação ambiental brasileira (Código Florestal, CONAMA 406/2009, IN MMA 05/2006, DOF,
CAR, licenciamento), biomassa e carbono, identificação de espécies e uso do app VolumX.

Regras:
- Responda em português do Brasil, de forma clara e prática, com números quando ajudar.
- Quando houver dados do projeto no contexto, use-os e diga de onde vem cada número.
- Não invente dados do projeto. Se faltar informação, diga o que medir ou cadastrar.
- Em questões legais, cite a norma e lembre que a legislação estadual e o órgão ambiental
  podem ter regras próprias; recomende conferir a versão vigente.
- Seja conciso: prefira listas curtas e passos numerados.`;

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService, private projects: ProjectsService) {}

  /** Short factual summary of a project, given to the assistant as context. */
  private async projectContext(projectId: string, userId: string): Promise<string> {
    const project = await this.projects.assertProjectAccess(projectId, userId);
    const parcels = await this.prisma.parcel.findMany({ where: { projectId }, select: { name: true, area: true, stratum: true } });
    const trees = await this.prisma.tree.findMany({
      where: { projectId },
      select: {
        speciesName: true, dbh: true, height: true, commercialHeight: true, treeStatus: true, stemQuality: true,
        volumeCalculations: { orderBy: { calculatedAt: 'desc' }, take: 1, select: { totalVolume: true, method: true } },
      },
    });
    const area = parcels.reduce((s, p) => s + (p.area ?? 0), 0);
    const g = (d: number) => (Math.PI * d * d) / 40000;
    const vol = trees.reduce((s, t) => s + (t.volumeCalculations[0]?.totalVolume ?? 0), 0);
    const G = trees.reduce((s, t) => s + g(t.dbh), 0);
    const bySp = new Map<string, { n: number; dbh: number; v: number }>();
    for (const t of trees) {
      const e = bySp.get(t.speciesName) ?? { n: 0, dbh: 0, v: 0 };
      e.n++; e.dbh += t.dbh; e.v += t.volumeCalculations[0]?.totalVolume ?? 0;
      bySp.set(t.speciesName, e);
    }
    const top = [...bySp.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15)
      .map(([sp, e]) => `  - ${sp}: ${e.n} árvores, DAP médio ${(e.dbh / e.n).toFixed(1)} cm, volume ${e.v.toFixed(2)} m³`);
    const cubed = trees.filter((t) => t.volumeCalculations[0] && t.volumeCalculations[0].method !== 'equation').length;
    const status = trees.reduce<Record<string, number>>((acc, t) => { if (t.treeStatus) acc[t.treeStatus] = (acc[t.treeStatus] ?? 0) + 1; return acc; }, {});
    const p: any = project;
    return [
      `PROJETO ATIVO: ${p.name}${p.projectType ? ` (${p.projectType})` : ''}`,
      p.municipality || p.state ? `Local: ${[p.municipality, p.state].filter(Boolean).join('/')}` : '',
      p.totalAreaHa ? `Área total do imóvel/povoamento: ${p.totalAreaHa} ha` : '',
      `Parcelas: ${parcels.length} (área amostrada ${area.toFixed(3)} ha)${parcels.some((x) => x.stratum) ? `, estratos: ${[...new Set(parcels.map((x) => x.stratum).filter(Boolean))].join(', ')}` : ''}`,
      `Árvores medidas: ${trees.length} (${cubed} com cubagem rigorosa)`,
      `Volume total registrado: ${vol.toFixed(2)} m³${area > 0 ? ` (${(vol / area).toFixed(1)} m³/ha)` : ''}`,
      area > 0 ? `Área basal: ${(G / area).toFixed(2)} m²/ha; densidade ${(trees.length / area).toFixed(0)} árv./ha` : '',
      Object.keys(status).length ? `Situação das árvores: ${Object.entries(status).map(([k, v]) => `${k} ${v}`).join(', ')}` : '',
      top.length ? `Espécies mais frequentes:\n${top.join('\n')}` : '',
    ].filter(Boolean).join('\n');
  }

  async chat(userId: string, body: { messages?: { role: string; content: string }[]; projectId?: string; imageBase64?: string }) {
    const msgs = (body?.messages ?? []).filter((m) => m && typeof m.content === 'string' && m.content.trim()).slice(-20);
    if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user') {
      throw new BadRequestException('Envie uma pergunta.');
    }
    let system = SYSTEM;
    if (body.projectId) {
      try { system += `\n\nDADOS DO PROJETO (do banco do VolumX):\n${await this.projectContext(body.projectId, userId)}`; } catch {}
    }
    const turns: GeminiTurn[] = msgs.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.slice(0, 8000) }],
    }));
    // Optional photo on the last question (e.g. "que espécie é esta?").
    if (body.imageBase64) {
      const uri = body.imageBase64.startsWith('data:') ? body.imageBase64 : `data:image/jpeg;base64,${body.imageBase64}`;
      turns[turns.length - 1].parts.unshift(imagePart(uri.replace(/\s/g, '')));
    }
    const answer = await geminiGenerate({ system, turns, timeoutMs: 90000, maxOutputTokens: 4096 });
    return { answer: answer.trim() };
  }
}
