import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

export type EssayImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type ProcessedImage = {
  originalMimeType: EssayImageMimeType;
  /** Re-encoded when possible; the validated JPEG fallback may preserve bytes. */
  originalData: string;
  mimeType: EssayImageMimeType;
  data: string;
  width?: number;
  height?: number;
  enhanced: boolean;
};

const mimeByFormat: Record<string, EssayImageMimeType | undefined> = {
  jpeg: 'image/jpeg',
  // Keep the extension spelling as an alias as some decoders report `jpg`.
  jpg: 'image/jpeg',
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
  private readonly logger = new Logger(HandwritingPreprocessor.name);

  async enhance(input: Buffer): Promise<ProcessedImage> {
    let source = normalizeImageBuffer(input);
    const signedMimeType = mimeFromSignature(source);
    let metadata: { format?: string; width?: number; height?: number } | undefined;
    let metadataError: unknown;
    try {
      // Mobile/WhatsApp JPEGs can contain recoverable metadata warnings even
      // though the pixels are readable. Decode tolerantly, then always emit a
      // fresh validated JPEG below instead of persisting the original bytes.
      metadata = await readMetadata(source);
    } catch (error) {
      metadataError = error;
      const sanitized = sanitizeJpegMetadata(source);
      if (sanitized) {
        source = sanitized;
        try {
          metadata = await readMetadata(sanitized);
          this.logger.warn(`essay_image_metadata_recovered bytes=${input.length} normalizedBytes=${source.length}`);
        } catch {
          // Fall through to the structural JPEG fallback below.
        }
      }
    }
    if (!metadata) {
      const dimensions = jpegDimensions(source);
      // A browser can display valid mobile JPEGs that libvips refuses because
      // of a vendor-specific marker. The upload itself must not be blocked by
      // that optional enhancement step: the 8 MB Multer limit already applies
      // before this method, and Gemini can consume the original JPEG bytes.
      if (signedMimeType === 'image/jpeg' && source.length >= 128 && (!dimensions || isSafeDimensions(dimensions.width, dimensions.height))) {
        this.logger.warn(`essay_image_raw_jpeg_fallback bytes=${input.length} width=${dimensions?.width ?? 'unknown'} height=${dimensions?.height ?? 'unknown'}`);
        const data = source.toString('base64');
        return { originalMimeType: 'image/jpeg', originalData: data, mimeType: 'image/jpeg', data, width: dimensions?.width, height: dimensions?.height, enhanced: false };
      }
      const detail = metadataError instanceof Error ? metadataError.message.split('\n', 1)[0].slice(0, 180) : typeof metadataError;
      this.logger.warn(`essay_image_decode_failure bytes=${input.length} normalizedBytes=${source.length} signature=${signedMimeType ?? 'unknown'} error=${detail}`);
      throw new BadRequestException('Não foi possível ler este arquivo como imagem. Use uma foto em JPG/JPEG, PNG ou WebP.');
    }
    const decodedFormat = (metadata.format ?? '').toLowerCase();
    const decodedMimeType = mimeByFormat[decodedFormat];
    const width = metadata.width;
    const height = metadata.height;
    // The decoder is authoritative. Signature checks remain an extra guard
    // when available, but Android providers sometimes wrap valid JPEGs with a
    // generic signature or MIME value.
    if (!decodedMimeType || (signedMimeType && decodedMimeType !== signedMimeType && decodedFormat !== 'avif' && decodedFormat !== 'heif') || !width || !height || !isSafeDimensions(width, height)) {
      throw new BadRequestException('A imagem precisa ser JPG/JPEG, PNG ou WebP e ter dimensões de até 10.000 px por lado.');
    }

    try {
      // Re-encoding strips EXIF (including camera location) before either
      // private copy is stored. The source bytes are never persisted.
      const original = await sharp(source, { limitInputPixels: maxPixels, failOn: 'none' })
        .rotate()
        .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
        .toBuffer();
      const enhanced = await sharp(original, { limitInputPixels: maxPixels, failOn: 'none' })
        .rotate()
        .resize({ width: 2400, height: 3200, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.1, m1: 0.7, m2: 2.2 })
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
        .toBuffer();
      return { originalMimeType: 'image/jpeg', originalData: original.toString('base64'), mimeType: 'image/jpeg', data: enhanced.toString('base64'), width, height, enhanced: true };
    } catch {
      throw new BadRequestException('Não foi possível processar esta imagem com segurança. Envie outra foto em JPG/JPEG, PNG ou WebP.');
    }
  }
}

async function readMetadata(input: Buffer) {
  try {
    return await sharp(input, { limitInputPixels: maxPixels, failOn: 'none' }).metadata();
  } catch (error) {
    // A decoder can reject the pixel limit before exposing dimensions. Retry
    // metadata-only without that limit so the explicit dimension checks below
    // can return the correct, actionable validation error.
    try {
      return await sharp(input, { limitInputPixels: false, failOn: 'none' }).metadata();
    } catch {
      throw error;
    }
  }
}

function normalizeImageBuffer(input: Buffer) {
  // Accept a data URL accidentally materialized as a text file by a gallery
  // provider. This keeps the server-side contract binary and bounded.
  const prefix = input.subarray(0, 256).toString('ascii');
  const dataUrl = prefix.match(/^data:image\/(?:jpe?g|png|webp);base64,/i);
  if (dataUrl) {
    try {
      return Buffer.from(input.subarray(dataUrl[0].length).toString('ascii'), 'base64');
    } catch {
      return input;
    }
  }

  // Some mobile file providers prepend a small text/BOM wrapper. Strip only a
  // prefix before a real JPEG SOI marker; normal JPEGs are unchanged.
  const jpegMarker = input.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (jpegMarker > 0 && jpegMarker <= 4096) return input.subarray(jpegMarker);
  return input;
}

function isSafeDimensions(width: number, height: number) {
  return width > 0 && height > 0 && width <= maxDimension && height <= maxDimension && width * height <= maxPixels;
}

function jpegDimensions(input: Buffer): { width: number; height: number } | undefined {
  if (mimeFromSignature(input) !== 'image/jpeg') return undefined;
  let offset = 2;
  while (offset + 3 < input.length) {
    if (input[offset] !== 0xff) return undefined;
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    const marker = input[offset++];
    if (marker === undefined) return undefined;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > input.length) return undefined;
    const segmentLength = input.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > input.length) return undefined;
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7) return { height: input.readUInt16BE(offset + 3), width: input.readUInt16BE(offset + 5) };
    if (marker === 0xda) return undefined;
    offset += segmentLength;
  }
  return undefined;
}

function sanitizeJpegMetadata(input: Buffer) {
  if (mimeFromSignature(input) !== 'image/jpeg') return undefined;
  const chunks = [input.subarray(0, 2)];
  let offset = 2;
  let changed = false;
  while (offset + 3 < input.length) {
    const markerStart = offset;
    if (input[offset] !== 0xff) return undefined;
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    const marker = input[offset++];
    if (marker === undefined) return undefined;
    if (marker === 0xda) {
      chunks.push(input.subarray(markerStart));
      return changed ? Buffer.concat(chunks) : undefined;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(input.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > input.length) return undefined;
    const segmentLength = input.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > input.length) return undefined;
    const segmentEnd = offset + segmentLength;
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) chunks.push(input.subarray(markerStart, segmentEnd));
    else changed = true;
    offset = segmentEnd;
  }
  return undefined;
}

function mimeFromSignature(input: Buffer): EssayImageMimeType | undefined {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'image/jpeg';
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (input.length >= 12 && input.subarray(0, 4).toString('ascii') === 'RIFF' && input.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}
