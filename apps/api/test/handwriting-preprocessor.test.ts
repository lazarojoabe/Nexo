import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { HandwritingPreprocessor } from '../src/handwriting-preprocessor';

describe('preparo de imagens manuscritas', () => {
  it('normaliza uma foto JPEG válida sem alterar a possibilidade de transcrição', async () => {
    const photo = await sharp({ create: { width: 120, height: 160, channels: 3, background: '#f6f0df' } })
      .jpeg({ quality: 80 })
      .toBuffer();

    const result = await new HandwritingPreprocessor().enhance(photo);

    expect(result).toMatchObject({ originalMimeType: 'image/jpeg', mimeType: 'image/jpeg', width: 120, height: 160, enhanced: true });
    expect((await sharp(Buffer.from(result.data, 'base64')).metadata()).format).toBe('jpeg');
  });

  it('rejeita dados que não são uma imagem, com orientação acionável', async () => {
    await expect(new HandwritingPreprocessor().enhance(Buffer.from('não é uma imagem')))
      .rejects.toThrow('Use uma foto em JPEG, PNG ou WebP');
  });

  it('preserva um JPEG de celular quando o aprimoramento não consegue decodificá-lo', async () => {
    const jpegComDadosIncompletos = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    await expect(new HandwritingPreprocessor().enhance(jpegComDadosIncompletos))
      .resolves.toMatchObject({ originalMimeType: 'image/jpeg', mimeType: 'image/jpeg', enhanced: false, data: jpegComDadosIncompletos.toString('base64') });
  });
});
