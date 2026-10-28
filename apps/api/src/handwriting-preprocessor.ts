import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import sharp from 'sharp';

export type ProcessedImage = { mimeType: 'image/jpeg'; data: string; width?: number; height?: number };

/**
 * Reaproveita o que funcionou no trabalho de PDI (normalização, escala de cinza,
 * redução de ruído e nitidez), mas preserva o original. A segmentação de linhas
 * fica para o modelo multimodal: cortar agressivamente a página pode remover
 * acentos, margens e pontuação manuscrita.
 */
@Injectable()
export class HandwritingPreprocessor {
  async enhance(input: Buffer): Promise<ProcessedImage> {
    try {
      const image = sharp(input, { failOn: 'none' }).rotate();
      const metadata = await image.metadata();
      const enhanced = await image
        .resize({ width: 2400, height: 3200, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.1, m1: 0.7, m2: 2.2 })
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
        .toBuffer();
      return { mimeType: 'image/jpeg', data: enhanced.toString('base64'), width: metadata.width, height: metadata.height };
    } catch {
      throw new ServiceUnavailableException('Não foi possível preparar a imagem para transcrição. Tente uma foto mais nítida.');
    }
  }
}
