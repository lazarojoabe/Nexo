import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

type AssetReference = { url: string; storagePath?: string; mimeType: string };

/** Stores public exam figures outside the ephemeral API filesystem. */
@Injectable()
export class ExamAssetStorageService {
  private readonly bucket = process.env.SUPABASE_EXAM_ASSET_BUCKET ?? 'exam-assets';
  private readonly supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  private publicBucketChecked = false;

  private get remoteEnabled() { return Boolean(this.supabaseUrl && this.serviceKey); }

  async publish(previewId: string, workspaceDir: string, assets: AssetReference[]) {
    const urls = new Map<string, string>();
    if (!this.remoteEnabled || !assets.length) return urls;
    await this.assertPublicBucket();
    const prefix = `imports/${previewId}/`;
    for (const asset of assets) {
      if (!asset.storagePath?.startsWith(prefix)) throw new ServiceUnavailableException('O ativo da prova não pertence à importação atual.');
      const relativePath = asset.storagePath.slice(prefix.length);
      const localPath = resolve(workspaceDir, relativePath);
      const relativeFromWorkspace = relative(workspaceDir, localPath);
      if (!relativeFromWorkspace || relativeFromWorkspace.startsWith('..') || resolve(localPath) === resolve(workspaceDir)) {
        throw new ServiceUnavailableException('Caminho de ativo da prova inválido.');
      }
      const bytes = await readFile(localPath).catch(() => { throw new ServiceUnavailableException('Não foi possível ler um recorte da prova para armazenamento.'); });
      await this.upload(asset.storagePath, bytes, asset.mimeType);
      urls.set(asset.storagePath, `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${asset.storagePath}`);
    }
    return urls;
  }

  private async assertPublicBucket() {
    if (this.publicBucketChecked) return;
    let response: Response;
    try {
      response = await fetch(`${this.supabaseUrl}/storage/v1/bucket/${this.bucket}`, { headers: this.headers() });
    } catch {
      throw new ServiceUnavailableException('O armazenamento público das imagens das provas não está disponível.');
    }
    const initial = await response.clone().json().catch(() => null) as { message?: unknown } | null;
    const missing = response.status === 404 || (response.status === 400 && initial?.message === 'Bucket not found');
    if (missing) {
      response = await fetch(`${this.supabaseUrl}/storage/v1/bucket`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ id: this.bucket, name: this.bucket, public: true }) });
      if (!response.ok && response.status !== 409) throw new ServiceUnavailableException('Não foi possível criar o armazenamento das imagens das provas.');
      response = await fetch(`${this.supabaseUrl}/storage/v1/bucket/${this.bucket}`, { headers: this.headers() });
    }
    if (!response.ok) throw new ServiceUnavailableException('O armazenamento público das imagens das provas não está disponível.');
    const descriptor = await response.json().catch(() => null) as { public?: unknown } | null;
    if (descriptor?.public !== true) throw new ServiceUnavailableException('O bucket das imagens das provas precisa ser público para o quiz.');
    this.publicBucketChecked = true;
  }

  private async upload(path: string, bytes: Buffer, mimeType: string) {
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.serviceKey!}`, apikey: this.serviceKey!, 'content-type': mimeType, 'x-upsert': 'true' },
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
    if (!response.ok) throw new ServiceUnavailableException('Não foi possível armazenar uma imagem da prova.');
  }

  private headers() { return { authorization: `Bearer ${this.serviceKey!}`, apikey: this.serviceKey!, 'content-type': 'application/json' }; }
}
