/**
 * File storage on the server's own disk (STORAGE_DRIVER=local).
 *
 * Keeps the presigned-URL contract the app already uses with S3: the API hands
 * out a short-lived signed URL, the phone PUTs the photo to it and later GETs
 * it from a signed URL. Here those URLs point at /api/storage on this same
 * server, signed with HMAC — so no object-storage service is needed at all,
 * and a backup of the files is a copy of one folder.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

/** Origin of the current HTTP request ("http://192.168.0.5:3100/"). */
export const requestOrigin = new AsyncLocalStorage<string>();

/**
 * Files are served through this API's signed /api/storage URLs when the
 * driver is 'local' (server disk) or 'proxy' (an S3-compatible bucket the API
 * reads and writes itself, e.g. Supabase Storage on a free cloud host whose
 * disk is wiped on every deploy). The phone never talks to the bucket.
 */
export function isLocalStorage(): boolean {
  const d = (process.env.STORAGE_DRIVER ?? '').toLowerCase();
  return d === 'local' || d === 'proxy' || d === 'db';
}

/** Files kept inside PostgreSQL (table stored_files). */
export function isDb(): boolean {
  return (process.env.STORAGE_DRIVER ?? '').toLowerCase() === 'db';
}

let _prisma: any = null;
function db() {
  if (!_prisma) {
    const { PrismaClient } = require('@prisma/client');
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export function isProxy(): boolean {
  return (process.env.STORAGE_DRIVER ?? '').toLowerCase() === 'proxy';
}

let _s3: any = null;
function s3() {
  if (!_s3) {
    const { createS3Client } = require('./aws-config');
    _s3 = createS3Client();
  }
  return _s3;
}
const bucket = () => process.env.S3_BUCKET || 'volumx';

async function streamToBuffer(data: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of data as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Reads a stored file: { body stream, contentType } or null when missing. */
export async function readFile(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType?: string } | null> {
  if (isDb()) {
    const row = await db().storedFile.findUnique({ where: { key } });
    if (!row) return null;
    const { Readable } = require('stream');
    return { stream: Readable.from(Buffer.from(row.data)), contentType: row.contentType ?? undefined };
  }
  if (isProxy()) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const out = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      return { stream: out.Body as NodeJS.ReadableStream, contentType: out.ContentType };
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
  const full = filePathFor(key);
  if (!fs.existsSync(full)) return null;
  return { stream: fs.createReadStream(full) };
}

export function storageDir(): string {
  return path.resolve(process.env.STORAGE_DIR || './arquivos');
}

function secret(): string {
  return process.env.STORAGE_SECRET || process.env.JWT_SECRET || '';
}

/** Absolute path for a key, refusing anything that escapes the storage folder. */
export function filePathFor(key: string): string {
  const base = storageDir();
  const full = path.resolve(base, key.replace(/^\/+/, ''));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Caminho de arquivo inválido');
  return full;
}

export function sign(op: 'put' | 'get', key: string, exp: number): string {
  return crypto.createHmac('sha256', secret()).update(`${op}:${key}:${exp}`).digest('base64url');
}

export function verify(op: 'put' | 'get', key: string, exp: number, sig: string): boolean {
  if (!key || !sig || !(exp > Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(op, key, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function signedUrl(op: 'put' | 'get', key: string, ttlSeconds = 3600): string {
  // Prefer the address the phone actually used: on a home server the Wi-Fi IP
  // changes, and a link built from a fixed APP_ORIGIN would point nowhere.
  const origin = (requestOrigin.getStore() || process.env.APP_ORIGIN || 'http://localhost:3000/').replace(/\/?$/, '/');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const q = new URLSearchParams({ op, k: key, exp: String(exp), sig: sign(op, key, exp) });
  return `${origin}api/storage?${q.toString()}`;
}

export async function writeFile(key: string, data: Buffer | NodeJS.ReadableStream, contentType?: string): Promise<number> {
  if (isDb()) {
    const body = Buffer.isBuffer(data) ? data : await streamToBuffer(data);
    await db().storedFile.upsert({
      where: { key },
      create: { key, data: body, size: body.length, contentType: contentType ?? null },
      update: { data: body, size: body.length, contentType: contentType ?? null },
    });
    return body.length;
  }
  if (isProxy()) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const body = Buffer.isBuffer(data) ? data : await streamToBuffer(data);
    await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
    return body.length;
  }
  const full = filePathFor(key);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.part`;
  if (Buffer.isBuffer(data)) {
    await fs.promises.writeFile(tmp, data);
  } else {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(tmp);
      data.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
      (data as any).on?.('error', reject);
    });
  }
  // Rename only when complete, so a dropped upload never leaves a half photo.
  await fs.promises.rename(tmp, full);
  return (await fs.promises.stat(full)).size;
}

export async function removeFile(key: string): Promise<void> {
  if (isDb()) {
    await db().storedFile.deleteMany({ where: { key } });
    return;
  }
  if (isProxy()) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return;
  }
  try { await fs.promises.unlink(filePathFor(key)); } catch (e: any) { if (e?.code !== 'ENOENT') throw e; }
}
