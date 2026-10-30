import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const maxBytes = 50 * 1024 * 1024;
const timeoutMs = 30_000;
const defaultSource = 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos';

export type OfficialAsset = {
  year: number;
  day: number;
  caderno: number;
  color: string;
  kind: 'prova' | 'gabarito';
  url: string;
  filename: string;
};

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isOfficialHost(hostname: string) {
  return hostname === 'gov.br' || hostname.endsWith('.gov.br') || hostname === 'inep.gov.br' || hostname.endsWith('.inep.gov.br');
}

function normalizeHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#(?:x[0-9a-f]+|\d+);/gi, ' ').replace(/\s+/g, ' ').trim();
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Parses only the ordinary cadernos listed under "Aplicação regular" on an Inep year page. */
export function parseOfficialEnemLinks(html: string, sourceUrl: string, year: number): OfficialAsset[] {
  const assets: OfficialAsset[] = [];
  const tokens = html.matchAll(/<(h[1-6]|p|strong|b)\b[^>]*>[\s\S]*?<\/\1\s*>|<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/a\s*>/gi);
  let inRegularApplication = false;
  let current: { day: number; caderno: number; color: string } | undefined;

  for (const match of tokens) {
    const token = match[0];
    const text = normalizeHtml(token);
    const lower = text.toLocaleLowerCase('pt-BR');
    if (match[1]) {
      if (lower.includes('aplicação regular')) inRegularApplication = true;
      else if (lower.includes('aplicação')) { inRegularApplication = false; current = undefined; }
      const heading = text.match(/([12])\s*(?:º|o)?\s*dia\s*[-–—|:]?\s*caderno\s*(\d+)\s*[-–—|:]?\s*([A-Za-zÀ-ÿ]+)/i);
      if (heading) current = { day: Number(heading[1]), caderno: Number(heading[2]), color: heading[3] };
      continue;
    }
    const anchor = token.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!anchor || !inRegularApplication || !current || current.caderno < 1 || current.caderno > 8) continue;
    const kind = /\bgabarito\b/i.test(text) ? 'gabarito' : /\bprova\b/i.test(text) ? 'prova' : undefined;
    if (!kind) continue;
    const url = new URL(anchor[1], sourceUrl);
    if (url.protocol !== 'https:' || !isOfficialHost(url.hostname)) continue;
    const color = slug(current.color);
    assets.push({ year, day: current.day, caderno: current.caderno, color, kind, url: url.toString(), filename: `enem-${year}-dia-${current.day}-caderno-${current.caderno}-${color}-${kind}.pdf` });
  }
  return [...new Map(assets.map((asset) => [`${asset.day}:${asset.caderno}:${asset.kind}`, asset])).values()].sort((a, b) => a.day - b.day || a.caderno - b.caderno || a.kind.localeCompare(b.kind));
}

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal, redirect: 'follow' }); } finally { clearTimeout(timer); }
}

async function download(asset: OfficialAsset, destination: string) {
  const response = await fetchWithTimeout(asset.url, { headers: { accept: 'application/pdf' } });
  const finalUrl = new URL(response.url || asset.url);
  if (!isOfficialHost(finalUrl.hostname)) throw new Error(`O redirecionamento de ${asset.filename} saiu de um domínio oficial.`);
  if (!response.ok) throw new Error(`${asset.filename}: HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw new Error(`${asset.filename}: excede o limite de 50 MB.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${asset.filename}: o conteúdo não é um PDF válido de até 50 MB.`);
  await writeFile(destination, bytes);
  return { ...asset, url: finalUrl.toString(), output: destination, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function childOf(root: string, ...parts: string[]) {
  const destination = resolve(root, ...parts);
  const relativePath = relative(root, destination);
  if (relativePath.startsWith('..') || relativePath.includes(`..${sep}`)) throw new Error('Destino fora da pasta de saída.');
  return destination;
}

async function main() {
  const year = Number(arg('--year'));
  if (!Number.isInteger(year) || year < 1998 || year > new Date().getFullYear()) throw new Error('Uso: pnpm exams:download --year <1998-atual> [--out data/exams] [--dry-run] [--source URL-oficial].');
  const source = arg('--source') ?? `${defaultSource}/${year}`;
  const sourceUrl = new URL(source);
  if (sourceUrl.protocol !== 'https:' || !isOfficialHost(sourceUrl.hostname)) throw new Error('A página-fonte precisa ser HTTPS de domínio oficial gov.br/inep.gov.br.');
  const root = resolve(process.env.INIT_CWD ?? process.cwd(), arg('--out') ?? 'data/exams');
  const page = await fetchWithTimeout(sourceUrl.toString(), { headers: { accept: 'text/html' } });
  if (!page.ok || !isOfficialHost(new URL(page.url || source).hostname)) throw new Error(`Não foi possível consultar a página oficial (HTTP ${page.status}).`);
  const assets = parseOfficialEnemLinks(await page.text(), page.url || source, year);
  if (!assets.length) throw new Error('Nenhum PDF da aplicação regular foi localizado. Confira a página oficial ou informe --source.');
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify({ source: page.url || source, assets }, null, 2)); return; }
  const results = [];
  for (const asset of assets) {
    const folder = childOf(root, String(year), `dia-${asset.day}`);
    await mkdir(folder, { recursive: true });
    results.push(await download(asset, childOf(folder, asset.filename)));
  }
  const manifest = childOf(root, String(year), 'manifest.json');
  await writeFile(manifest, `${JSON.stringify({ source: page.url || source, downloadedAt: new Date().toISOString(), assets: results }, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'downloaded', source: page.url || source, files: results.length, manifest }, null, 2));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
