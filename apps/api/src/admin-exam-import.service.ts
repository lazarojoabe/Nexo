import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { examImportMetadataSchema, examImportSchema, type ExamImport, type ExamImportMetadata } from '@nexo/shared';
import { normalizeExamImport, persistExamImport } from './exam-importer';
import { PrismaService } from './prisma.service';

const MAX_EXAM_BYTES = 50 * 1024 * 1024;
const MAX_KEY_BYTES = 20 * 1024 * 1024;
const MIN_CONFIDENCE = 0.86;

type ImportRole = 'exam' | 'answer-key';
type DetectedFileType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
type UploadedFile = Pick<Express.Multer.File, 'buffer' | 'size' | 'originalname'>;

export type ImportException = {
  id: string;
  code: 'low_confidence' | 'duplicate_question_number' | 'duplicate_answer_key_number' | 'answer_key_conflict' | 'missing_option' | 'question_without_answer_key' | 'answer_key_without_question' | 'metadata_divergence' | 'metadata_ambiguous' | 'asset_without_link' | 'vector_asset_review' | 'payload_validation';
  severity: 'blocking' | 'review';
  message: string;
  questionNumber?: number;
  sourcePage?: number;
};

type SourceDescriptor = {
  role: ImportRole;
  originalName: string;
  mimeType: DetectedFileType;
  byteSize: number;
  sha256: string;
  pageCount?: number;
  temporaryPath: string;
};

type ExtractedOption = { label: string; content: string };
type ExtractedQuestion = { number: number; area: string; statement: string; options: ExtractedOption[]; sourcePage: number; confidence: number };
type ExtractedAnswer = { number: number; label: string; sourcePage: number; confidence: number; suggested?: boolean };
type ExtractedAsset = { file: string; questionNumber?: number; optionLabel?: string; placement?: 'before_statement' | 'after_statement' | 'option'; displayOrder?: number; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; sourcePage: number; sourceCrop?: { x: number; y: number; width: number; height: number }; sourceHash: string; confidence: number; isVector?: boolean };
type ExtractionOutput = {
  questions: ExtractedQuestion[];
  answerKey: ExtractedAnswer[];
  assets: ExtractedAsset[];
  unlinkedAssets?: Array<{ file?: string; sourcePage: number; reason: string }>;
  detectedMetadata?: Partial<Record<'year' | 'day' | 'color' | 'language', string[]>>;
  pageCounts?: { exam?: number; answerKey?: number };
};

type PreviewRecord = {
  id: string;
  createdAt: string;
  workspaceDir: string;
  metadata: ExamImportMetadata;
  sources: SourceDescriptor[];
  draft: unknown;
  exceptions: ImportException[];
  report: Record<string, unknown>;
  diff: ImportDiff;
};

type ImportDiff = {
  examExists: boolean;
  changedQuestions: number;
  publishedChanges: boolean;
  entries: Array<{ number: number; status: 'new' | 'unchanged' | 'changed'; fields: string[]; published: boolean }>;
};

export type PreviewResponse = Omit<PreviewRecord, 'workspaceDir' | 'sources'> & {
  sources: Array<Omit<SourceDescriptor, 'temporaryPath'>>;
  approvalRequired: true;
  readyToApprove: boolean;
};

export type ApprovalInput = {
  approved: boolean;
  confirmPublishedChanges?: boolean;
  resolvedExceptionCodes?: string[];
  reviewedPayload?: unknown;
};

/**
 * Detects the content from bytes, never from a browser supplied MIME type or
 * filename. The extractor subsequently opens PDFs with PyMuPDF, providing a
 * second validation boundary for malformed files.
 */
export function validateExamImportFile(file: UploadedFile, role: ImportRole) {
  if (!file?.buffer?.length) throw new UnprocessableEntityException('Envie um arquivo não vazio.');
  const maxBytes = role === 'exam' ? MAX_EXAM_BYTES : MAX_KEY_BYTES;
  if (file.size !== file.buffer.length || file.size > maxBytes) throw new UnprocessableEntityException(`O ${role === 'exam' ? 'PDF da prova' : 'gabarito'} excede o limite permitido.`);
  const bytes = file.buffer;
  const pdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.subarray(Math.max(0, bytes.length - 65_536)).includes(Buffer.from('%%EOF'));
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const mimeType: DetectedFileType | undefined = pdf ? 'application/pdf' : png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : undefined;
  if (!mimeType || (role === 'exam' && mimeType !== 'application/pdf')) {
    throw new UnprocessableEntityException(role === 'exam' ? 'A prova deve ser um PDF válido (assinatura %PDF- e EOF).': 'O gabarito deve ser PDF, PNG, JPEG ou WebP válido; a extensão do arquivo não é suficiente.');
  }
  return { mimeType, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Kept exported so the critical preview rules are unit-testable without OCR or a database. */
export function buildPreviewDraft(input: { id: string; metadata: ExamImportMetadata; proofHash: string; extraction: ExtractionOutput; assetBaseUrl: string }) {
  const exceptions: ImportException[] = [];
  const questionByNumber = new Map<number, ExtractedQuestion>();
  const questionNumbers = new Set<number>();
  for (const question of input.extraction.questions) {
    if (questionNumbers.has(question.number)) {
      exceptions.push(exception('duplicate-question-' + question.number, 'duplicate_question_number', `A prova contém mais de uma leitura para a questão ${question.number}.`, question.number, question.sourcePage));
      continue;
    }
    questionNumbers.add(question.number);
    questionByNumber.set(question.number, question);
    if (question.confidence < MIN_CONFIDENCE) exceptions.push(exception(`low-question-${question.number}`, 'low_confidence', `Leitura da questão ${question.number} com confiança baixa (${Math.round(question.confidence * 100)}%).`, question.number, question.sourcePage, 'review'));
    const labels = new Set(question.options.map((option) => option.label));
    if (question.options.length !== 5 || !['A', 'B', 'C', 'D', 'E'].every((label) => labels.has(label))) {
      exceptions.push(exception(`missing-option-${question.number}`, 'missing_option', `A questão ${question.number} não contém exatamente as alternativas A–E.`, question.number, question.sourcePage));
    }
  }

  const answersByNumber = new Map<number, ExtractedAnswer[]>();
  for (const answer of input.extraction.answerKey) {
    // OCR is allowed to expose a candidate for the reviewer, but it is never
    // trusted as an answer key. Only a deterministic PDF extraction, or a
    // human-reviewed payload at approval time, can supply the final label.
    if (answer.suggested) {
      exceptions.push(exception(`ocr-answer-${answer.number}-${answer.sourcePage}`, 'low_confidence', `OCR sugeriu a alternativa da questão ${answer.number}; confirme-a manualmente no gabarito oficial.`, answer.number, answer.sourcePage));
      continue;
    }
    const answers = answersByNumber.get(answer.number) ?? [];
    answers.push(answer);
    answersByNumber.set(answer.number, answers);
    if (answer.confidence < MIN_CONFIDENCE) exceptions.push(exception(`low-answer-${answer.number}-${answers.length}`, 'low_confidence', `Leitura do gabarito da questão ${answer.number} com confiança baixa (${Math.round(answer.confidence * 100)}%).`, answer.number, answer.sourcePage, 'review'));
  }
  const resolvedAnswers = new Map<number, string>();
  for (const [number, answers] of answersByNumber) {
    if (answers.length > 1) {
      const labels = new Set(answers.map((answer) => answer.label));
      exceptions.push(exception(`duplicate-answer-${number}`, labels.size > 1 ? 'answer_key_conflict' : 'duplicate_answer_key_number', labels.size > 1 ? `O gabarito tem alternativas conflitantes para a questão ${number}.` : `O gabarito repete a questão ${number}.`, number, answers[0].sourcePage));
      continue;
    }
    resolvedAnswers.set(number, answers[0].label);
  }

  const assetsByQuestion = new Map<number, ExtractedAsset[]>();
  for (const asset of input.extraction.assets) {
    if (!asset.questionNumber || !questionByNumber.has(asset.questionNumber)) {
      exceptions.push(exception(`orphan-asset-${asset.sourceHash}`, 'asset_without_link', `O ativo da página ${asset.sourcePage} não pôde ser vinculado a uma questão da prova.`, undefined, asset.sourcePage));
      continue;
    }
    if (asset.isVector) exceptions.push(exception(`vector-asset-${asset.sourceHash}`, 'vector_asset_review', `O recorte vetorial da página ${asset.sourcePage} exige conferência humana do conteúdo e do vínculo antes da aprovação.`, asset.questionNumber, asset.sourcePage));
    if (asset.confidence < MIN_CONFIDENCE) exceptions.push(exception(`low-asset-${asset.sourceHash}`, 'low_confidence', `O vínculo do ativo da página ${asset.sourcePage} precisa de revisão humana.`, asset.questionNumber, asset.sourcePage, 'review'));
    const list = assetsByQuestion.get(asset.questionNumber) ?? [];
    list.push(asset);
    assetsByQuestion.set(asset.questionNumber, list);
  }
  for (const asset of input.extraction.unlinkedAssets ?? []) {
    exceptions.push(exception(`orphan-asset-${asset.file ?? asset.sourcePage}`, 'asset_without_link', `O ativo da página ${asset.sourcePage} ficou sem vínculo: ${asset.reason}.`, undefined, asset.sourcePage));
  }

  for (const number of questionNumbers) if (!resolvedAnswers.has(number)) exceptions.push(exception(`question-without-key-${number}`, 'question_without_answer_key', `A questão ${number} não possui alternativa correspondente no gabarito.`, number, questionByNumber.get(number)?.sourcePage));
  for (const number of resolvedAnswers.keys()) if (!questionNumbers.has(number)) exceptions.push(exception(`key-without-question-${number}`, 'answer_key_without_question', `O gabarito contém a questão ${number}, que não foi encontrada na prova.`, number));
  appendMetadataExceptions(exceptions, input.metadata, input.extraction.detectedMetadata);

  const base = input.assetBaseUrl.replace(/\/$/, '');
  const draft = {
    sourceUrl: `local-upload://exam/${input.proofHash}`,
    sourceVersion: `Upload local auditável — prova SHA-256 ${input.proofHash}`,
    exam: input.metadata,
    questions: [...questionByNumber.values()].sort((a, b) => a.number - b.number).map((question) => ({
      number: question.number,
      area: question.area,
      statement: question.statement,
      sourcePage: question.sourcePage,
      sourceDocumentHash: input.proofHash,
      options: question.options,
      correctOptionLabel: resolvedAnswers.get(question.number),
      assets: (assetsByQuestion.get(question.number) ?? []).map((asset, index) => ({
        url: `${base}/imports/${input.id}/${safeAssetPath(asset.file)}`,
        storagePath: `imports/${input.id}/${safeAssetPath(asset.file)}`,
        placement: asset.placement ?? 'after_statement',
        ...(asset.optionLabel ? { optionLabel: asset.optionLabel } : {}),
        displayOrder: asset.displayOrder ?? index,
        mimeType: asset.mimeType,
        // This deliberately describes provenance, not the visual content. A
        // reviewer must replace it with an accessible factual description.
        altText: 'Imagem extraída da prova oficial; descrição pendente de revisão humana.',
        sourcePage: asset.sourcePage,
        ...(asset.sourceCrop ? { sourceCrop: asset.sourceCrop } : {}),
        sourceHash: asset.sourceHash,
      })),
    })),
  };

  const parsed = examImportSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      exceptions.push(exception(`payload-${issue.path.join('-') || 'root'}-${createHash('sha1').update(issue.message).digest('hex').slice(0, 8)}`, 'payload_validation', issue.message));
    }
  }
  return { draft, exceptions: uniqueExceptions(exceptions), valid: parsed.success };
}

@Injectable()
export class AdminExamImportService {
  constructor(private readonly prisma: PrismaService) {}

  assertAuthorized(key?: string) {
    const expected = process.env.ADMIN_IMPORT_KEY;
    if (!expected) throw new ServiceUnavailableException('ADMIN_IMPORT_KEY deve ser configurada para habilitar a importação administrativa.');
    const received = Buffer.from(key ?? '');
    const target = Buffer.from(expected);
    if (received.length !== target.length || !timingSafeEqual(received, target)) throw new ForbiddenException('Credencial administrativa inválida.');
  }

  async preview(metadataInput: unknown, examFile?: UploadedFile, keyFile?: UploadedFile): Promise<PreviewResponse> {
    const metadata = examImportMetadataSchema.parse(metadataInput);
    if (!examFile || !keyFile) throw new UnprocessableEntityException('Envie o PDF da prova e o arquivo oficial do gabarito.');
    const examInfo = validateExamImportFile(examFile, 'exam');
    const keyInfo = validateExamImportFile(keyFile, 'answer-key');
    const id = randomUUID();
    const workspaceDir = resolve(this.temporaryRoot(), id);
    await mkdir(resolve(workspaceDir, 'assets'), { recursive: true });
    const examPath = resolve(workspaceDir, `proof${extensionFor(examInfo.mimeType)}`);
    const keyPath = resolve(workspaceDir, `answer-key${extensionFor(keyInfo.mimeType)}`);
    await Promise.all([writeFile(examPath, examFile.buffer), writeFile(keyPath, keyFile.buffer)]);

    const extraction = await this.extract({ examPath, keyPath, outputPath: resolve(workspaceDir, 'extraction.json'), assetDirectory: resolve(workspaceDir, 'assets'), day: metadata.day });
    const sources: SourceDescriptor[] = [
      { role: 'exam', originalName: safeFilename(examFile.originalname), mimeType: examInfo.mimeType, byteSize: examFile.size, sha256: examInfo.sha256, pageCount: extraction.pageCounts?.exam, temporaryPath: examPath },
      { role: 'answer-key', originalName: safeFilename(keyFile.originalname), mimeType: keyInfo.mimeType, byteSize: keyFile.size, sha256: keyInfo.sha256, pageCount: extraction.pageCounts?.answerKey, temporaryPath: keyPath },
    ];
    const built = buildPreviewDraft({ id, metadata, proofHash: examInfo.sha256, extraction, assetBaseUrl: this.assetBaseUrl() });
    const diff = await this.diff(built.draft);
    const report = this.report(metadata, sources, extraction, built.exceptions, built.valid, diff);
    const record: PreviewRecord = { id, createdAt: new Date().toISOString(), workspaceDir, metadata, sources, draft: built.draft, exceptions: built.exceptions, report, diff };
    await writeFile(this.previewPath(workspaceDir), JSON.stringify(record, null, 2), 'utf8');
    return this.present(record, built.valid);
  }

  async getPreview(id: string): Promise<PreviewResponse> {
    const record = await this.readPreview(id);
    const valid = examImportSchema.safeParse(record.draft).success;
    return this.present(record, valid);
  }

  async approve(id: string, input: ApprovalInput) {
    if (!input.approved) throw new UnprocessableEntityException('A persistência exige aprovação explícita (approved: true).');
    if (!this.prisma.enabled) throw new ServiceUnavailableException('A persistência exige DATABASE_URL configurada. A prévia continua disponível sem banco.');
    const record = await this.readPreview(id);
    const forced = this.withTrustedProvenance(input.reviewedPayload ?? record.draft, record);
    const parsed = examImportSchema.safeParse(forced);
    if (!parsed.success) throw new UnprocessableEntityException({ message: 'A revisão ainda não atende ao contrato de importação.', issues: parsed.error.issues });
    const payload = parsed.data;
    const approvalIssues = this.validateReviewedAssets(payload, record);
    if (approvalIssues.length) throw new UnprocessableEntityException({ message: 'Há ativos sem vínculo ou fora da origem enviada.', issues: approvalIssues });
    const sourceBoundBlockers = record.exceptions.filter((item) => ['metadata_divergence', 'metadata_ambiguous', 'asset_without_link'].includes(item.code));
    if (sourceBoundBlockers.length) throw new UnprocessableEntityException({ message: 'Os arquivos enviados ainda possuem metadados divergentes ou ativos sem vínculo. Corrija a origem e gere uma nova prévia.', exceptions: sourceBoundBlockers });
    const originalBlockers = record.exceptions.filter((item) => item.severity === 'blocking').map((item) => item.id);
    const acknowledged = new Set(input.resolvedExceptionCodes ?? []);
    const missingAcknowledgements = originalBlockers.filter((id) => !acknowledged.has(id));
    if (missingAcknowledgements.length) throw new UnprocessableEntityException({ message: 'Confirme a revisão humana de cada exceção bloqueante antes de persistir.', missingAcknowledgements });
    const diff = await this.diff(payload);
    if (diff.publishedChanges && !input.confirmPublishedChanges) {
      throw new ConflictException({ message: 'A prévia altera questões já publicadas. Revise o diff e envie confirmPublishedChanges: true.', diff });
    }

    const existingBatch = await this.prisma.examImportBatch.findUnique({ where: { previewId: id } });
    if (existingBatch?.status === 'persisted') return { status: 'already_persisted', importBatchId: existingBatch.id, examId: existingBatch.examId, previewId: id };
    const staged = await this.stageAuditFiles(record);
    const auditReport = { ...record.report, finalDiff: diff, approvedWithExceptions: originalBlockers, approvedAt: new Date().toISOString() };
    const batch = await this.prisma.examImportBatch.upsert({
      where: { previewId: id },
      update: { status: 'persisting', report: auditReport, approvedAt: new Date(), examId: null, persistedAt: null },
      create: {
        previewId: id, status: 'persisting', year: record.metadata.year, day: record.metadata.day, color: record.metadata.color, language: record.metadata.language, version: record.metadata.version, report: auditReport, approvedAt: new Date(),
        sources: { create: staged.sources },
      },
    });
    try {
      const normalized = normalizeExamImport(payload);
      const persisted = await persistExamImport(this.prisma, normalized);
      await this.prisma.examImportBatch.update({ where: { id: batch.id }, data: { status: 'persisted', examId: persisted.examId, persistedAt: new Date(), report: { ...auditReport, persisted } } });
      return { status: 'persisted', importBatchId: batch.id, previewId: id, ...persisted, diff };
    } catch (error) {
      await this.prisma.examImportBatch.update({ where: { id: batch.id }, data: { status: 'failed', report: { ...auditReport, failure: error instanceof Error ? error.message : 'Falha desconhecida' } } });
      throw error;
    }
  }

  private async extract(input: { examPath: string; keyPath: string; outputPath: string; assetDirectory: string; day: number }) {
    const script = resolve(this.workspaceRoot(), 'scripts', 'import-exams', 'extract_uploaded_exam.py');
    const python = process.env.PYTHON_BIN || 'python';
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(python, [script, '--exam', input.examPath, '--key', input.keyPath, '--out-json', input.outputPath, '--assets-dir', input.assetDirectory, '--day', String(input.day)], { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.once('error', () => reject(new UnprocessableEntityException('Não foi possível iniciar o extrator local. Instale Python 3.10+ e PyMuPDF.')));
      child.once('close', (code) => code === 0 ? resolvePromise() : reject(new UnprocessableEntityException(`Não foi possível extrair os arquivos enviados.${stderr ? ` ${stderr.trim().slice(0, 500)}` : ''}`)));
    });
    try {
      return JSON.parse(await readFile(input.outputPath, 'utf8')) as ExtractionOutput;
    } catch {
      throw new UnprocessableEntityException('O extrator local não produziu uma prévia legível.');
    }
  }

  private async readPreview(id: string) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new NotFoundException('Prévia de importação não encontrada.');
    const directory = resolve(this.temporaryRoot(), id);
    if (!isWithin(this.temporaryRoot(), directory) || !existsSync(this.previewPath(directory))) throw new NotFoundException('Prévia de importação não encontrada ou expirada. Envie os arquivos novamente.');
    return JSON.parse(await readFile(this.previewPath(directory), 'utf8')) as PreviewRecord;
  }

  private present(record: PreviewRecord, valid: boolean): PreviewResponse {
    return { id: record.id, createdAt: record.createdAt, metadata: record.metadata, sources: record.sources.map(({ temporaryPath: _temporaryPath, ...source }) => source), draft: record.draft, exceptions: record.exceptions, report: record.report, diff: record.diff, approvalRequired: true, readyToApprove: valid && !record.exceptions.some((item) => item.severity === 'blocking') };
  }

  private async diff(draft: unknown): Promise<ImportDiff> {
    const parsed = examImportSchema.safeParse(draft);
    if (!parsed.success || !this.prisma.enabled) return { examExists: false, changedQuestions: 0, publishedChanges: false, entries: [] };
    const input = parsed.data;
    // The deterministic ID also keeps the nullable language variant
    // idempotent on PostgreSQL, whose composite UNIQUE permits repeated NULLs.
    const exam = await this.prisma.exam.findUnique({ where: { id: normalizeExamImport(input).exam.id }, include: { questions: { include: { options: true, assets: true }, orderBy: { number: 'asc' } } } });
    if (!exam) return { examExists: false, changedQuestions: 0, publishedChanges: false, entries: input.questions.map((question) => ({ number: question.number, status: 'new', fields: [], published: false })) };
    const existing = new Map(exam.questions.map((question) => [question.number, question]));
    const entries = input.questions.map((candidate) => {
      const current = existing.get(candidate.number);
      if (!current) return { number: candidate.number, status: 'new' as const, fields: [], published: false };
      const fields = changedFields(current, candidate);
      return { number: candidate.number, status: fields.length ? 'changed' as const : 'unchanged' as const, fields, published: Boolean(current.publishedAt) };
    });
    const changed = entries.filter((entry) => entry.status === 'changed');
    return { examExists: true, changedQuestions: changed.length, publishedChanges: changed.some((entry) => entry.published), entries };
  }

  private withTrustedProvenance(value: unknown, record: PreviewRecord) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const raw = value as Record<string, unknown>;
    const draft = record.draft as Record<string, unknown>;
    const proofHash = record.sources.find((source) => source.role === 'exam')?.sha256;
    const questions = Array.isArray(raw.questions) ? raw.questions.map((question) => question && typeof question === 'object' && !Array.isArray(question) ? { ...(question as object), ...(proofHash ? { sourceDocumentHash: proofHash } : {}) } : question) : raw.questions;
    return {
      ...raw,
      sourceUrl: draft.sourceUrl,
      sourceVersion: draft.sourceVersion,
      exam: { ...(raw.exam && typeof raw.exam === 'object' ? raw.exam as object : {}), ...record.metadata },
      questions,
    };
  }

  private validateReviewedAssets(payload: ExamImport, record: PreviewRecord) {
    const original = record.draft as { questions?: Array<{ assets?: Array<{ sourceHash?: string; url?: string; storagePath?: string }> }> };
    const expected = new Set(original.questions?.flatMap((question) => question.assets ?? []).map((asset) => asset.sourceHash).filter((value): value is string => Boolean(value)) ?? []);
    const actual = payload.questions.flatMap((question) => question.assets).map((asset) => asset.sourceHash).filter((value): value is string => Boolean(value));
    const allowedPrefix = `${this.assetBaseUrl().replace(/\/$/, '')}/imports/${record.id}/`;
    const expectedStoragePrefix = `imports/${record.id}/`;
    const issues: string[] = [];
    for (const hash of expected) if (!actual.includes(hash)) issues.push(`O ativo ${hash.slice(0, 12)} foi removido da revisão e ficou sem vínculo.`);
    for (const question of payload.questions) for (const asset of question.assets) {
      if (!asset.sourceHash || !expected.has(asset.sourceHash)) issues.push('Um ativo revisado não pertence aos arquivos enviados nesta prévia.');
      if (!asset.url.startsWith(allowedPrefix) || (asset.storagePath && !asset.storagePath.startsWith(expectedStoragePrefix))) issues.push('Um ativo revisado aponta para fora do armazenamento auditável desta importação.');
    }
    return [...new Set(issues)];
  }

  private async stageAuditFiles(record: PreviewRecord) {
    const directory = resolve(this.workspaceRoot(), 'data', 'exam-imports', record.id);
    await mkdir(directory, { recursive: true });
    const sources = [] as Array<{ role: string; origin: string; originalName: string; storagePath: string; mimeType: string; byteSize: number; sha256: string; pageCount?: number }>;
    for (const source of record.sources) {
      const filename = `${source.role}${extensionFor(source.mimeType)}`;
      const target = resolve(directory, filename);
      await cp(source.temporaryPath, target, { force: true });
      sources.push({ role: source.role, origin: 'local-upload', originalName: source.originalName, storagePath: relative(this.workspaceRoot(), target).split(sep).join('/'), mimeType: source.mimeType, byteSize: source.byteSize, sha256: source.sha256, ...(source.pageCount ? { pageCount: source.pageCount } : {}) });
    }
    const sourceAssets = resolve(record.workspaceDir, 'assets');
    // Asset paths in the reviewed payload are deliberately rooted at
    // imports/<preview-id>/assets/, so retain that segment in the final
    // static directory rather than relying on platform-specific cp behavior.
    if (existsSync(sourceAssets)) await cp(sourceAssets, resolve(this.workspaceRoot(), 'data', 'exam-assets', 'imports', record.id, 'assets'), { recursive: true, force: true });
    return { sources };
  }

  private report(metadata: ExamImportMetadata, sources: SourceDescriptor[], extraction: ExtractionOutput, exceptions: ImportException[], valid: boolean, diff: ImportDiff) {
    return {
      metadata,
      sources: sources.map(({ temporaryPath: _temporaryPath, ...source }) => source),
      extractedAt: new Date().toISOString(),
      counts: { questions: extraction.questions.length, answerKeyEntries: extraction.answerKey.length, assets: extraction.assets.length, exceptions: exceptions.length },
      validation: { schemaValid: valid, blockingExceptions: exceptions.filter((item) => item.severity === 'blocking').length, reviewExceptions: exceptions.filter((item) => item.severity === 'review').length },
      initialDiff: diff,
    };
  }

  private workspaceRoot() {
    return existsSync(resolve(process.cwd(), 'apps', 'api')) ? process.cwd() : resolve(process.cwd(), '..', '..');
  }

  private temporaryRoot() { return resolve(process.env.EXAM_IMPORT_TMP_DIR ?? resolve(this.workspaceRoot(), 'tmp', 'exam-imports')); }
  private previewPath(directory: string) { return resolve(directory, 'preview.json'); }
  private assetBaseUrl() { return process.env.EXAM_ASSET_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}/exam-assets`; }
}

function exception(id: string, code: ImportException['code'], message: string, questionNumber?: number, sourcePage?: number, severity: ImportException['severity'] = 'blocking'): ImportException {
  return { id, code, severity, message, ...(questionNumber ? { questionNumber } : {}), ...(sourcePage ? { sourcePage } : {}) };
}

function appendMetadataExceptions(exceptions: ImportException[], metadata: ExamImportMetadata, detected?: ExtractionOutput['detectedMetadata']) {
  if (!detected) return;
  const expected: Array<[keyof Pick<ExamImportMetadata, 'year' | 'day' | 'color' | 'language'>, string | number | undefined]> = [['year', metadata.year], ['day', metadata.day], ['color', metadata.color], ['language', metadata.language]];
  for (const [field, requested] of expected) {
    const values = [...new Set(detected[field] ?? [])].filter(Boolean);
    if (!values.length || requested === undefined) continue;
    if (values.length > 1) exceptions.push(exception(`metadata-ambiguous-${field}`, 'metadata_ambiguous', `Os arquivos enviados têm mais de um valor detectado para ${field}: ${values.join(', ')}.`));
    else if (normalizeMetadata(values[0]) !== normalizeMetadata(String(requested))) exceptions.push(exception(`metadata-${field}`, 'metadata_divergence', `Metadado divergente em ${field}: formulário=${requested}; arquivo=${values[0]}.`));
  }
}

function changedFields(current: { area: string; statement: string; explanation: string | null; isCancelled: boolean; correctOptionId: string; sourcePage: number | null; sourceDocumentHash: string | null; options: Array<{ label: string; content: string }>; assets: Array<{ placement: string; optionLabel: string | null; displayOrder: number; sourceHash: string | null; sourcePage: number | null }> }, candidate: ExamImport['questions'][number]) {
  const fields: string[] = [];
  if (current.area !== candidate.area) fields.push('area');
  if (current.statement !== candidate.statement) fields.push('statement');
  if ((current.explanation ?? undefined) !== candidate.explanation) fields.push('explanation');
  if (current.isCancelled !== candidate.isCancelled) fields.push('isCancelled');
  const label = candidate.correctOptionLabel?.toLowerCase();
  if (label && !current.correctOptionId.endsWith(`-${label}`)) fields.push('answerKey');
  if ((current.sourcePage ?? undefined) !== candidate.sourcePage) fields.push('sourcePage');
  if ((current.sourceDocumentHash ?? undefined) !== candidate.sourceDocumentHash) fields.push('sourceDocumentHash');
  if (stable(current.options.map((item) => ({ label: item.label, content: item.content })).sort((a, b) => a.label.localeCompare(b.label))) !== stable(candidate.options.map((item) => ({ label: item.label, content: item.content })).sort((a, b) => a.label.localeCompare(b.label)))) fields.push('options');
  if (stable(current.assets.map((item) => ({ placement: item.placement, optionLabel: item.optionLabel, displayOrder: item.displayOrder, sourceHash: item.sourceHash, sourcePage: item.sourcePage })).sort(assetSort)) !== stable(candidate.assets.map((item) => ({ placement: item.placement, optionLabel: item.optionLabel ?? null, displayOrder: item.displayOrder, sourceHash: item.sourceHash ?? null, sourcePage: item.sourcePage })).sort(assetSort))) fields.push('assets');
  return fields;
}

function assetSort(a: { placement: string; optionLabel: string | null; displayOrder: number }, b: { placement: string; optionLabel: string | null; displayOrder: number }) { return `${a.placement}:${a.optionLabel ?? ''}:${a.displayOrder}`.localeCompare(`${b.placement}:${b.optionLabel ?? ''}:${b.displayOrder}`); }
function stable(value: unknown) { return JSON.stringify(value); }
function normalizeMetadata(value: string) { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function uniqueExceptions(items: ImportException[]) { return [...new Map(items.map((item) => [item.id, item])).values()]; }
function safeFilename(value: string) { return basename(value).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'arquivo'; }
function extensionFor(mime: DetectedFileType) { return mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp'; }
function safeAssetPath(value: string) { const normalized = value.replace(/\\/g, '/').replace(/^\/+/, ''); if (!normalized || normalized.split('/').some((part) => part === '..' || !part)) throw new UnprocessableEntityException('O extrator retornou um caminho de ativo inválido.'); return normalized; }
function isWithin(root: string, target: string) { const path = relative(root, target); return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.includes(`..${sep}`)); }
