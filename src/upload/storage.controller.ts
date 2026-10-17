import { Controller, Get, Put, Query, Req, Res, Logger } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import * as local from '../lib/localStorage';

const MAX_BYTES = 100 * 1024 * 1024;

function guessType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as Record<string, string>)[ext ?? ''] || 'application/octet-stream';
}

/**
 * Endpoints behind the signed URLs of the local storage driver. No JWT here
 * on purpose: the HMAC signature in the URL IS the authorisation, exactly like
 * an S3 presigned URL, and it expires.
 */
@ApiExcludeController()
@Controller('api/storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  @Put()
  async put(
    @Query('k') key: string, @Query('exp') exp: string, @Query('sig') sig: string,
    @Req() req: Request, @Res() res: Response,
  ) {
    if (!local.isLocalStorage()) return res.status(404).end();
    if (!local.verify('put', key, Number(exp), sig)) return res.status(403).json({ message: 'Link de envio inválido ou expirado' });
    const len = Number(req.headers['content-length'] ?? 0);
    if (len > MAX_BYTES) return res.status(413).json({ message: 'Arquivo grande demais' });
    try {
      const size = await local.writeFile(key, req, String(req.headers['content-type'] || '') || undefined);
      return res.status(200).json({ ok: true, size });
    } catch (e: any) {
      this.logger.error(`storage put failed: ${e?.message}`);
      return res.status(500).json({ message: 'Falha ao gravar o arquivo' });
    }
  }

  @Get()
  async get(
    @Query('k') key: string, @Query('exp') exp: string, @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!local.isLocalStorage()) return res.status(404).end();
    if (!local.verify('get', key, Number(exp), sig)) return res.status(403).json({ message: 'Link inválido ou expirado' });
    try {
      const file = await local.readFile(key);
      if (!file) return res.status(404).json({ message: 'Arquivo não encontrado' });
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Type', file.contentType || guessType(key));
      file.stream.pipe(res);
    } catch (e: any) {
      this.logger.error(`storage get failed: ${e?.message}`);
      return res.status(500).json({ message: 'Falha ao ler o arquivo' });
    }
  }
}
