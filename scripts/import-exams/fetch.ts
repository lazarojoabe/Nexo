import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const maxBytes = 50 * 1024 * 1024;
const timeoutMs = 30_000;

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isOfficialHost(hostname: string) {
  return hostname === 'gov.br' || hostname.endsWith('.gov.br') || hostname === 'inep.gov.br' || hostname.endsWith('.inep.gov.br');
}

async function main() {
  const input = arg('--url');
  const output = arg('--out');
  if (!input || !output) throw new Error('Uso: pnpm exams:fetch --url <PDF-oficial> --out <arquivo.pdf>');
  const url = new URL(input);
  if (url.protocol !== 'https:' || !isOfficialHost(url.hostname)) throw new Error('A fonte deve ser um PDF HTTPS hospedado em domínio oficial gov.br ou inep.gov.br.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
  const finalUrl = new URL(response.url || url.toString());
  if (!isOfficialHost(finalUrl.hostname)) throw new Error('O redirecionamento saiu de um domínio oficial.');
  if (!response.ok) throw new Error(`A fonte respondeu HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') ?? '';
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) throw new Error('O arquivo excede o limite de 50 MB.');
  if (!contentType.includes('application/pdf') && !finalUrl.pathname.toLowerCase().endsWith('.pdf')) throw new Error('A fonte não parece ser um PDF.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('O arquivo excede o limite de 50 MB.');
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('O conteúdo baixado não possui assinatura PDF válida.');
  const destination = resolve(process.env.INIT_CWD ?? process.cwd(), output);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await writeFile(destination, bytes);
  console.log(JSON.stringify({ status: 'downloaded', url: finalUrl.toString(), output: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
