import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type EssayImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type ProcessedImage = {
  originalMimeType: EssayImageMimeType;
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
};

/**
 * Reaproveita o que funcionou no trabalho de PDI (normalização, escala de cinza,
 * redução de ruído e nitidez), mas preserva o original. A segmentação de linhas
 * fica para o modelo multimodal: cortar agressivamente a página pode remover
 * acentos, margens e pontuação manuscrita.
 */
@Injectable()
export class HandwritingPreprocessor {
  async enhance(input: Buffer): Promise<ProcessedImage> {
    let width: number | undefined;
    let height: number | undefined;
    const originalMimeType = mimeFromSignature(input);

    // The browser preview is often able to render mobile photos that libvips
    // cannot fully decode. Validate the real file signature first, then keep
    // the original if local enhancement is unavailable.
    if (!originalMimeType) {
      throw new BadRequestException('Não foi possível ler este arquivo como imagem. Use uma foto em JPEG, PNG ou WebP.');
    }

    try {
      const metadata = await sharp(input, { failOn: 'none' }).metadata();
      if (mimeByFormat[metadata.format ?? '']) {
        width = metadata.width;
        height = metadata.height;
      }
    } catch {
      return { originalMimeType, mimeType: originalMimeType, data: input.toString('base64'), enhanced: false };
    }

    try {
      const enhanced = await sharp(input, { failOn: 'none' })
        .rotate()
        .resize({ width: 2400, height: 3200, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.1, m1: 0.7, m2: 2.2 })
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
        .toBuffer();
      return { originalMimeType, mimeType: 'image/jpeg', data: enhanced.toString('base64'), width, height, enhanced: true };
    } catch {
      // Do not discard a readable original only because a cosmetic treatment
      // failed. Gemini accepts all three formats, so transcription can proceed.
      return { originalMimeType, mimeType: originalMimeType, data: input.toString('base64'), width, height, enhanced: false };
    }
  }
}

function mimeFromSignature(input: Buffer): EssayImageMimeType | undefined {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'image/jpeg';
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (input.length >= 12 && input.subarray(0, 4).toString('ascii') === 'RIFF' && input.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}
