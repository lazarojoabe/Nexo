/**
 * Turns the review extraction of the official 2025 ENEM day-two blue booklet
 * into the versioned import consumed by the quiz.  The PDF extraction remains
 * a separate, reviewable step; this script only normalizes known page footer
 * noise, classifies the two day-two areas, and preserves linked figures.
 *
 * Usage:
 *   node scripts/import-exams/build-enem-2025-day2-azul.mjs \
 *     --extraction tmp/enem-2025-dia-2-azul-extraction.json \
 *     --extracted-assets tmp/enem-2025-dia-2-assets \
 *     --asset-dir data/exam-assets/enem-2025-dia-2-azul \
 *     --out data/exams/2025/dia-2/enem-2025-dia-2-azul-revisado.json
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name) {
  const result = value(name);
  if (!result) throw new Error(`Informe ${name}.`);
  return resolve(result);
}

function clean(value) {
  return value
    .replace(/\*\d+[A-Z]+\d+\*/g, '')
    .replace(/(?:ENEM|ENEN)2025/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main() {
  const extractionPath = required('--extraction');
  const extractedAssets = required('--extracted-assets');
  const assetDirectory = required('--asset-dir');
  const output = required('--out');
  const proof = value('--proof-sha256');
  if (!proof || !/^[a-f\d]{64}$/i.test(proof)) throw new Error('Informe --proof-sha256 com o SHA-256 da prova oficial.');
  const extraction = JSON.parse(await readFile(extractionPath, 'utf8'));
  const questions = new Map(extraction.questions.map((question) => [question.number, question]));
  if (questions.size !== 90 || !Array.from({ length: 90 }, (_, index) => questions.has(index + 91)).every(Boolean)) {
    throw new Error('A extração precisa conter, sem duplicidade, as questões 91 a 180.');
  }
  if (new Map(extraction.answerKey.map((answer) => [answer.number, answer.label])).size !== 90) {
    throw new Error('O gabarito extraído precisa conter 90 respostas únicas.');
  }
  const answers = new Map(extraction.answerKey.map((answer) => [answer.number, answer.label]));
  await mkdir(assetDirectory, { recursive: true });

  const assetsByQuestion = new Map();
  for (const asset of extraction.assets) {
    // The second column of page 22 contains Q152's five graph alternatives.
    // Q151's left-column diagram is the only figure that belongs to Q151;
    // the five option crops below are reviewed and associated explicitly.
    if (asset.questionNumber === 152 || (asset.questionNumber === 151 && !asset.file.endsWith('q151-p022-01.png'))) continue;
    const filename = basename(asset.file);
    const source = resolve(extractedAssets, filename);
    const target = resolve(assetDirectory, filename);
    await cp(source, target, { force: true });
    const list = assetsByQuestion.get(asset.questionNumber) ?? [];
    list.push({
      url: `http://localhost:3001/exam-assets/enem-2025-dia-2-azul/${filename}`,
      placement: 'after_statement',
      displayOrder: list.length,
      mimeType: 'image/png',
      altText: `Figura da questão ${asset.questionNumber}, extraída do caderno azul oficial do ENEM 2025.`,
      sourcePage: asset.sourcePage,
      sourceCrop: asset.sourceCrop,
      sourceHash: await sha256(target),
    });
    assetsByQuestion.set(asset.questionNumber, list);
  }

  const graphAssets = [];
  for (const label of ['A', 'B', 'C', 'D', 'E']) {
    const filename = `q152-${label}.png`;
    const path = resolve(assetDirectory, filename);
    graphAssets.push({
      url: `http://localhost:3001/exam-assets/enem-2025-dia-2-azul/${filename}`,
      placement: 'option', optionLabel: label, displayOrder: 0, mimeType: 'image/png',
      altText: `Gráfico da alternativa ${label} da questão 152.`,
      sourcePage: 22, sourceHash: await sha256(path),
    });
  }

  const payload = {
    sourceUrl: 'https://download.inep.gov.br/enem/provas_e_gabaritos/2025_PV_impresso_D4_CD7.pdf',
    sourceVersion: 'Inep 2025 — 2º dia — Caderno 7 Azul — gabarito oficial',
    exam: { year: 2025, day: 2, color: 'azul', version: 'caderno-7' },
    questions: Array.from(questions.values()).sort((left, right) => left.number - right.number).map((question) => {
      const number = question.number;
      if (number === 152) return {
        number, area: 'Matemática', sourcePage: 22, sourceDocumentHash: proof,
        statement: 'O mapa de cobertura e uso da terra no Brasil do IBGE aponta que, entre 2000 e 2014, a área agrícola aumentou de 39 877 600 ha para 55 854 900 ha, enquanto a área florestal diminuiu de 351 394 800 ha para 317 559 700 ha. Considere que, nesse período, a taxa de variação entre as áreas agrícola e florestal seja constante ao longo dos anos. O gráfico que melhor representa a relação entre as áreas agrícola e florestal, no período de 2000 a 2014, é',
        options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, content: `Gráfico ${label}.` })),
        correctOptionLabel: answers.get(number), assets: graphAssets,
      };
      const options = question.options.map((option) => ({ ...option, content: clean(option.content) }));
      if (options.length !== 5 || !['A', 'B', 'C', 'D', 'E'].every((label, index) => options[index]?.label === label)) {
        throw new Error(`A questão ${number} não tem as alternativas A–E completas.`);
      }
      return {
        number,
        area: number <= 135 ? 'Ciências da Natureza' : 'Matemática',
        statement: clean(question.statement), options, correctOptionLabel: answers.get(number),
        sourcePage: question.sourcePage, sourceDocumentHash: proof,
        assets: assetsByQuestion.get(number) ?? [],
      };
    }),
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'reviewed_import_created', output, questions: payload.questions.length, assets: payload.questions.reduce((sum, question) => sum + question.assets.length, 0) }, null, 2));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
