import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

type StoredImage = { originalPath: string; processedPath: string };

/**
 * Keeps image bytes out of PostgreSQL. Development uses a directory outside the
 * web root; production uploads through the Supabase Storage server API using a
 * service key that is never sent to the browser.
 */
@Injectable()
export class EssayStorageService {
  private readonly bucket = process.env.SUPABASE_ESSAY_BUCKET ?? 'essay-images';
  private readonly supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  private readonly directory = resolve(process.env.ESSAY_UPLOAD_DIR ?? resolve(process.cwd(), 'tmp', 'essay-uploads'));
  private privateBucketChecked = false;

  private get remoteEnabled() { return Boolean(this.supabaseUrl && this.serviceKey); }

  async save(essayId: string, page: number, original: Buffer, originalMimeType: string, processed: Buffer, processedMimeType: string): Promise<StoredImage> {
    const stamp = `${Date.now()}-${crypto.randomUUID()}`;
    const originalName = `essays/${essayId}/${page}-${stamp}-original${extension(originalMimeType)}`;
    const processedName = `essays/${essayId}/${page}-${stamp}-processed${extension(processedMimeType)}`;
    if (this.remoteEnabled) {
      await this.assertPrivateBucket();
      try {
        await this.uploadRemote(originalName, original, originalMimeType);
        await this.uploadRemote(processedName, processed, processedMimeType);
      } catch (error) {
        await this.remove([originalName, processedName]);
        throw error;
      }
      return { originalPath: originalName, processedPath: processedName };
    }
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('O armazenamento privado de imagens não está configurado. Tente novamente mais tarde.');
    }
    await Promise.all([
      this.writeLocal(originalName, original),
      this.writeLocal(processedName, processed),
    ]);
    return { originalPath: originalName, processedPath: processedName };
  }

  async read(path: string): Promise<Buffer> {
    if (this.remoteEnabled) return this.readRemote(path);
    try {
      return await readFile(this.localPath(path));
    } catch {
      throw new ServiceUnavailableException('Não foi possível acessar uma imagem da redação. Envie-a novamente.');
    }
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    if (this.remoteEnabled) {
      await fetch(`${this.supabaseUrl}/storage/v1/object/${this.bucket}`, {
        method: 'DELETE',
        headers: this.headers(),
        body: JSON.stringify({ prefixes: paths }),
      }).catch(() => undefined);
      return;
    }
    await Promise.all(paths.map((path) => rm(this.localPath(path), { force: true }).catch(() => undefined)));
  }

  private async writeLocal(path: string, buffer: Buffer) {
    const target = this.localPath(path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' });
  }

  private localPath(path: string) {
    const target = resolve(this.directory, path);
    const pathFromDirectory = relative(this.directory, target);
    if (pathFromDirectory === '' || pathFromDirectory.startsWith('..') || resolve(target) === this.directory) throw new ServiceUnavailableException('Caminho de imagem inválido.');
    return target;
  }

  private async assertPrivateBucket() {
    if (this.privateBucketChecked) return;
    const response = await fetch(`${this.supabaseUrl}/storage/v1/bucket/${this.bucket}`, { headers: this.headers() });
    if (!response.ok) throw new ServiceUnavailableException('O armazenamento privado de imagens não está configurado. Tente novamente mais tarde.');
    const descriptor = await response.json().catch(() => null) as { public?: unknown } | null;
    if (descriptor?.public === true) throw new ServiceUnavailableException('O armazenamento privado de imagens não está configurado. Tente novamente mais tarde.');
    this.privateBucketChecked = true;
  }

  private headers() {
    return { authorization: `Bearer ${this.serviceKey!}`, apikey: this.serviceKey!, 'content-type': 'application/json' };
  }

  private async uploadRemote(path: string, data: Buffer, mimeType: string) {
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.serviceKey!}`, apikey: this.serviceKey!, 'content-type': mimeType, 'x-upsert': 'false' },
      body: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    });
    if (!response.ok) throw new ServiceUnavailableException('Não foi possível armazenar a imagem com segurança. Tente novamente.');
  }

  private async readRemote(path: string) {
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/authenticated/${this.bucket}/${path}`, { headers: this.headers() });
    if (!response.ok) throw new ServiceUnavailableException('Não foi possível acessar uma imagem da redação. Envie-a novamente.');
    return Buffer.from(await response.arrayBuffer());
  }
}

function extension(mimeType: string) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}
