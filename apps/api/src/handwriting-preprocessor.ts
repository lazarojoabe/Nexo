import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type EssayImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type ProcessedImage = {
  originalMimeType: EssayImageMimeType;
  /** Sanitized re-encoding; no EXIF or original camera metadata is retained. */
  originalData: string;
  mimeType: EssayImageMimeType;
  data: string;
  width?: number;
  height?: number;
  enhanced: boolean;
};

const mimeByFormat: Record<string, EssayImageMimeType | undefined> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  // Sharp decodes these formats and re-encodes them to JPEG below before
  // storage/AI processing, so the rest of the pipeline still receives one
  // of the supported Gemini image types.
  avif: 'image/jpeg',
  heif: 'image/jpeg',
};
const maxDimension = 10_000;
const maxPixels = 25_000_000;

/**
 * Reaproveita o que funcionou no trabalho de PDI (normalização, escala de cinza,
 * redução de ruído e nitidez), mas preserva o original. A segmentação de linhas
 * fica para o modelo multimodal: cortar agressivamente a página pode remover
 * acentos, margens e pontuação manuscrita.
 */
@Injectable()
export class HandwritingPreprocessor {
  async enhance(input: Buffer): Promise<ProcessedImage> {
    const signedMimeType = mimeFromSignature(input);
    let metadata: { format?: string; width?: number; height?: number };
    try {
      metadata = await sharp(input, { limitInputPixels: maxPixels, failOn: 'error' }).metadata();
    } catch {
      throw new BadRequestException('Não foi possível ler este arquivo como imagem. Use uma foto em JPEG, PNG ou WebP.');
    }
    const decodedMimeType = mimeByFormat[metadata.format ?? ''];
    const width = metadata.width;
    const height = metadata.height;
    // The decoder is authoritative. Signature checks remain an extra guard
    // when available, but Android providers sometimes wrap valid JPEGs with a
    // generic signature or MIME value.
    if (!decodedMimeType || (signedMimeType && decodedMimeType !== signedMimeType && metadata.format !== 'avif' && metadata.format !== 'heif') || !width || !height || width > maxDimension || height > maxDimension || width * height > maxPixels) {
      throw new BadRequestException('A imagem precisa ser JPEG, PNG ou WebP e ter dimensões de até 10.000 px por lado.');
    }

    try {
      // Re-encoding strips EXIF (including camera location) before either
      // private copy is stored. The source bytes are never persisted.
      const original = await sharp(input, { limitInputPixels: maxPixels, failOn: 'error' })
        .rotate()
        .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
        .toBuffer();
      const enhanced = await sharp(original, { limitInputPixels: maxPixels, failOn: 'error' })
        .rotate()
        .resize({ width: 2400, height: 3200, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.1, m1: 0.7, m2: 2.2 })
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
        .toBuffer();
      return { originalMimeType: 'image/jpeg', originalData: original.toString('base64'), mimeType: 'image/jpeg', data: enhanced.toString('base64'), width, height, enhanced: true };
    } catch {
      throw new BadRequestException('Não foi possível processar esta imagem com segurança. Envie outra foto em JPEG, PNG ou WebP.');
    }
  }
}

function mimeFromSignature(input: Buffer): EssayImageMimeType | undefined {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'image/jpeg';
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (input.length >= 12 && input.subarray(0, 4).toString('ascii') === 'RIFF' && input.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}
