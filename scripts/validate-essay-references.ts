import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { essayReferenceImportSchema } from '@nexo/shared';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: pnpm --filter @nexo/api references:validate <arquivo.json>');
  const fromCurrentDirectory = resolve(process.cwd(), file);
  const target = existsSync(fromCurrentDirectory) ? fromCurrentDirectory : resolve(process.cwd(), '..', '..', file);
  const raw = JSON.parse(await readFile(target, 'utf8')) as unknown;
  const references = z.array(essayReferenceImportSchema).min(1).parse(raw);
  console.log(`${references.length} referência(s) autorizada(s) validada(s). Nenhum conteúdo foi importado.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Arquivo de referências inválido.';
  console.error(`Falha de validação: ${message}`);
  process.exitCode = 1;
});
