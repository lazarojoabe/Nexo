import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve('apps/web/public/resolucoes/enem-2025-dia-1-questoes-21-a-23.pdf');

const paragraphs = [
  ['RESOLUCAO COMENTADA', 20],
  ['ENEM 2025 - 1o dia - Caderno Azul', 12],
  ['Questoes 21 a 23', 12],
  ['', 10],
  ['QUESTAO 21 - Alternativa C', 15],
  ['A repeticao de "o meu medo e" encadeia receios sobre estudo, trabalho,', 11],
  ['desemprego e abordagem policial. O texto nao se limita ao desempenho', 11],
  ['escolar ou a escolha profissional: ele revela a vulnerabilidade social', 11],
  ['do narrador e a incerteza sobre seu lugar na sociedade. Por isso, a', 11],
  ['resposta correta e C: incertezas centradas em sua condicao social.', 11],
  ['', 10],
  ['QUESTAO 22 - Alternativa B', 15],
  ['Os artistas observam troncos e gravetos que, a primeira vista, parecem nao', 11],
  ['ter uma funcao artistica. Ao enxergar neles bancos, figuras e esculturas,', 11],
  ['eles ressignificam a materia-prima e atribuem a ela uma nova funcao como', 11],
  ['obra de arte. Por isso, a resposta correta e B.', 11],
  ['', 10],
  ['QUESTAO 23 - Alternativa C', 15],
  ['Em Azulejaria em carne viva, Adriana Varejao aproxima o azulejo ligado', 11],
  ['a heranca portuguesa de cortes, fissuras e carne exposta. Esses recursos', 11],
  ['visuais figuram as marcas e violencias deixadas pelo processo colonial', 11],
  ['brasileiro. A obra nao trata de conservacao do patrimonio nem de', 11],
  ['incentivos a arte. Portanto, a resposta correta e C: violencias', 11],
  ['desencadeadas pelo processo colonial brasileiro.', 11],
  ['', 10],
  ['Material de apoio pedagogico. Consulte a resolucao apos responder.', 9],
];

const escapePdf = (value) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
let y = 792;
const commands = ['BT'];
for (const [text, size] of paragraphs) {
  y -= size === 20 ? 30 : size === 15 ? 25 : size === 12 ? 19 : 16;
  commands.push(`/F1 ${size} Tf`, `1 0 0 1 54 ${y} Tm`, `(${escapePdf(text)}) Tj`);
}
commands.push('ET');
const stream = commands.join('\n');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf, 'ascii'));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf, 'ascii');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, pdf, 'ascii');
console.log(output);
