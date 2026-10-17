import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consultancy management: clients and dated obligations (licences,
 * authorisations, protocols, conditions).
 *
 * Kept deliberately simple — owner-scoped records — because the value is in
 * never missing an expiry date, not in a complex CRM.
 */
const CLIENT_FIELDS = ['name', 'document', 'email', 'phone', 'city', 'state', 'propertyName', 'carNumber', 'notes'] as const;
const LICENSE_FIELDS = ['clientId', 'projectId', 'type', 'number', 'issuer', 'title', 'issueDate', 'expiryDate', 'alertDays', 'status', 'notes'] as const;

function pick(src: any, keys: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) if (src?.[k] !== undefined) out[k] = src[k];
  return out;
}

function toDate(v: any): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new BadRequestException(`Data inválida: ${v}`);
  return d;
}

@Injectable()
export class ConsultancyService {
  constructor(private prisma: PrismaService) {}

  // ---------------- Clients ----------------
  async listClients(userId: string) {
    const items = await this.prisma.client.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { projects: true, licenses: true } } },
    });
    return {
      items: items.map((c) => ({
        ...c,
        projectCount: c._count.projects,
        licenseCount: c._count.licenses,
        _count: undefined,
      })),
    };
  }

  async getClient(userId: string, id: string) {
    const c = await this.prisma.client.findFirst({
      where: { id, userId },
      include: {
        projects: { select: { id: true, name: true, status: true, projectType: true } },
        licenses: { orderBy: { expiryDate: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('Cliente não encontrado');
    return c;
  }

  createClient(userId: string, body: any) {
    if (!body?.name?.trim()) throw new BadRequestException('Nome do cliente é obrigatório.');
    return this.prisma.client.create({
      data: { ...pick(body, CLIENT_FIELDS), name: body.name.trim(), userId } as any,
    });
  }

  async updateClient(userId: string, id: string, body: any) {
    await this.getClient(userId, id);
    return this.prisma.client.update({ where: { id }, data: pick(body, CLIENT_FIELDS) });
  }

  async removeClient(userId: string, id: string) {
    await this.getClient(userId, id);
    await this.prisma.client.delete({ where: { id } });
    return { success: true };
  }

  // ---------------- Licences ----------------
  private licenseData(body: any) {
    const d: any = pick(body, LICENSE_FIELDS);
    if ('issueDate' in d) d.issueDate = toDate(d.issueDate);
    if ('expiryDate' in d) d.expiryDate = toDate(d.expiryDate);
    if ('alertDays' in d) d.alertDays = Math.max(0, Math.round(Number(d.alertDays) || 0));
    if (d.clientId === '') d.clientId = null;
    if (d.projectId === '') d.projectId = null;
    return d;
  }

  /** Status derived from the date, so "vencida" never depends on someone remembering to change it. */
  private withComputed(l: any) {
    const exp = l.expiryDate ? new Date(l.expiryDate).getTime() : null;
    const daysLeft = exp != null ? Math.ceil((exp - Date.now()) / 86400000) : null;
    let computedStatus = l.status;
    if (l.status !== 'arquivada' && daysLeft != null) {
      if (daysLeft < 0) computedStatus = 'vencida';
      else if (daysLeft <= (l.alertDays ?? 60)) {
        computedStatus = l.status === 'em_renovacao' ? 'em_renovacao' : 'a_vencer';
      }
    }
    return { ...l, daysLeft, computedStatus };
  }

  async listLicenses(userId: string, filter: { clientId?: string; projectId?: string } = {}) {
    const items = await this.prisma.license.findMany({
      where: {
        userId,
        ...(filter.clientId ? { clientId: filter.clientId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
    return { items: items.map((l) => this.withComputed(l)) };
  }

  /** Licences inside their alert window, being renewed, or already expired. */
  async upcoming(userId: string) {
    const { items } = await this.listLicenses(userId);
    return {
      items: items.filter((l) => ['vencida', 'a_vencer', 'em_renovacao'].includes(l.computedStatus)),
    };
  }

  createLicense(userId: string, body: any) {
    if (!body?.title?.trim()) throw new BadRequestException('Título é obrigatório.');
    if (!body?.type) throw new BadRequestException('Tipo é obrigatório.');
    return this.prisma.license.create({ data: { ...this.licenseData(body), userId } });
  }

  async updateLicense(userId: string, id: string, body: any) {
    const l = await this.prisma.license.findFirst({ where: { id, userId } });
    if (!l) throw new NotFoundException('Licença não encontrada');
    return this.prisma.license.update({ where: { id }, data: this.licenseData(body) });
  }

  async removeLicense(userId: string, id: string) {
    const l = await this.prisma.license.findFirst({ where: { id, userId } });
    if (!l) throw new NotFoundException('Licença não encontrada');
    await this.prisma.license.delete({ where: { id } });
    return { success: true };
  }
}
