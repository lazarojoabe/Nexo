import { getSupabaseBrowserClient } from './supabase';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const requestTimeout = 15_000;

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly kind: 'http' | 'network' | 'timeout' = 'http') { super(message); }
}

export type Exam = { id: string; year: number; day: number; color: string; language?: string | null; version: string; source: string; sourceUrl?: string; questionCount: number; areas: Array<{ name: string; questionCount: number }> };
export type QuestionAsset = { id: string; url: string; placement: 'before_statement' | 'after_statement' | 'option'; optionLabel?: string | null; displayOrder: number; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | string; altText: string };
export type Question = { id: string; examId?: string; number?: number; area: string; statement: string; explanation: string; imageUrl?: string | null; assets?: QuestionAsset[]; source: string; options: Array<{ id: string; label: string; content: string }> };
export type QuizAnswer = { correct: boolean; correctOptionId: string; explanation: string };
export type QuizSession = { id: string; examId?: string; questionIds: string[]; attempts?: Array<{ questionId: string; optionId: string; correct: boolean }> };
export type QuizSummary = { total: number; answered: number; correct: number; attempts: Array<{ questionId: string; optionId: string; correct: boolean }>; areas: Array<{ area: string; total: number; answered: number; correct: number; accuracy: number | null }> };
export type QuizHistory = { summary: { sessions: number; completed: number; answered: number; correct: number; percentage: number | null }; sessions: Array<{ id: string; examId?: string; createdAt: string; total: number; answered: number; correct: number; percentage: number | null; complete: boolean }> };
export type Dashboard = { examCount: number; progress: { answered: number; correct: number; percentage: number } | null; lastSession: ResumeSession | null; resumeSession: ResumeSession | null };
export type ResumeSession = { id: string; examId?: string; total: number; answered: number; correct: number; complete: boolean };
export type TranscriptionParagraph = { index: number; rawText: string; normalizedText: string; confidence: number; lineRange: { start: number; end: number } };
export type TranscriptionCorrection = { original: string; normalized: string; type: 'line_break_join' | 'visual_ocr_correction'; confidence: number; requiresReview: boolean; reason: string };
export type UncertainTerm = { observed: string; suggestion: string; confidence: number; requiresReview: boolean };
export type Transcription = {
  rawText: string;
  normalizedText: string;
  paragraphs: TranscriptionParagraph[];
  corrections: TranscriptionCorrection[];
  uncertainTerms: UncertainTerm[];
  overallConfidence: number;
  requiresReview: boolean;
  /** Compatibility aliases returned by the API during client migration. */
  text: string;
  lowConfidenceSegments: Array<{ text: string; reason?: string; page?: number }>;
};
export type EssayEvaluation = { totalScore: number; competencies: Array<{ id: 1 | 2 | 3 | 4 | 5; score: number; level: 'insuficiente' | 'regular' | 'bom' | 'excelente'; strengths: string[]; issues: string[]; evidence: Array<{ excerpt: string; explanation: string }>; feedbackPoints: Array<{ category: 'norma_culta' | 'pontuacao' | 'coesao' | 'clareza' | 'repertorio' | 'argumentacao' | 'tema' | 'proposta_intervencao'; severity: 'prioridade' | 'atencao' | 'evolucao'; excerpt?: string; diagnosis: string; suggestion: string }>; actionableFeedback: string[] }>; generalFeedback: string; priorityActions: string[]; interventionProposal?: { agent: string; action: string; means: string; purpose: string; detail?: string }; rubricVersion: string; provider: string; model: string; confidence: 'alta' | 'media' | 'baixa'; needsHumanReview: boolean; reviewReasons: string[]; limitations: string[]; analysisSignals?: { characterCount: number; wordCount: number; sentenceCount: number; paragraphCount: number; hasIllegibleExcerpt: boolean; isVeryShort: boolean; hasIncompleteStructure: boolean; hasExcessiveRepetition: boolean; hasApparentConclusion: boolean; hasInterventionIndicators: boolean; hasPromptInjectionAttempt: boolean; needsHumanReview: boolean; reviewReasons: string[] }; evaluatedAt?: string; disclaimer: string };
export type EssayDetail = { id: string; topic: string; transcription?: string | null; transcriptionResult?: Transcription | null; confirmedText?: string | null; status: string; createdAt: string; evaluatedAt?: string | null; images: Array<{ id: string; mimeType: string; size: number; page: number }>; evaluation: EssayEvaluation | null };
export type EssayHistory = { summary: { total: number; evaluated: number; latestScore: number | null; bestScore: number | null; delta: number | null; competencyTrend: Array<{ id: number; latestScore: number | null; previousScore: number | null; delta: number | null }> }; essays: Array<{ id: string; topic: string; status: string; createdAt: string; evaluatedAt?: string | null; totalScore: number | null; competencies: Array<{ id: number; score: number }> }> };

type RequestOptions = RequestInit & { timeout?: number; requiresAuth?: boolean };
type AuthAdapter = {
  accessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
  clearSession: () => Promise<void>;
};

let testAuthAdapter: AuthAdapter | undefined;

function authAdapter(): AuthAdapter {
  return testAuthAdapter ?? {
    async accessToken() {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      return data.session?.access_token ?? null;
    },
    async refreshAccessToken() {
      const { data } = await getSupabaseBrowserClient().auth.refreshSession();
      return data.session?.access_token ?? null;
    },
    async clearSession() {
      await getSupabaseBrowserClient().auth.signOut({ scope: 'local' });
    },
  };
}

/** Test seam only; production always uses Supabase's supported session client. */
export function setApiAuthAdapterForTests(adapter?: AuthAdapter) { testAuthAdapter = adapter; }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? requestTimeout);
  try {
    const adapter = options.requiresAuth ? authAdapter() : undefined;
    let accessToken = adapter ? await adapter.accessToken() : null;
    let response = await send(path, options, accessToken, options.signal ?? controller.signal);
    if (response.status === 401 && adapter) {
      accessToken = await adapter.refreshAccessToken();
      if (accessToken) response = await send(path, options, accessToken, options.signal ?? controller.signal);
      if (response.status === 401) {
        await adapter.clearSession().catch(() => undefined);
        redirectToSignIn();
      }
    }
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload: unknown = isJson ? await response.json() : null;
    if (!response.ok) {
      const message = typeof payload === 'object' && payload && 'message' in payload ? String(payload.message) : 'Não foi possível concluir esta ação.';
      throw new ApiError(message, response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('A solicitação demorou mais que o esperado. Tente novamente.', undefined, 'timeout');
    throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está rodando e tente novamente.', undefined, 'network');
  } finally {
    clearTimeout(timeout);
  }
}

async function send(path: string, options: RequestOptions, accessToken: string | null, signal: AbortSignal) {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...options, headers, signal });
}

function redirectToSignIn() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/entrar') window.location.assign('/entrar?motivo=sessao');
}

export const api = {
  exams: () => request<Exam[]>('/exams'),
  questions: (examId: string, area?: string) => request<Question[]>(`/questions?examId=${encodeURIComponent(examId)}${area ? `&area=${encodeURIComponent(area)}` : ''}`),
  signUp: (email: string, password: string) => request<{ confirmationRequired: true }>('/auth/sign-up', { method: 'POST', body: JSON.stringify({ email, password }) }),
  dashboard: () => request<Dashboard>('/dashboard', { requiresAuth: true }),
  quizHistory: () => request<QuizHistory>('/quiz-history', { requiresAuth: true }),
  createSession: (examId: string, area?: string) => request<QuizSession>('/quiz-sessions', { method: 'POST', body: JSON.stringify({ examId, ...(area ? { area } : {}) }), requiresAuth: true }),
  session: (id: string) => request<QuizSession>(`/quiz-sessions/${id}`, { requiresAuth: true }),
  answer: (sessionId: string, questionId: string, optionId: string) => request<QuizAnswer>(`/quiz-sessions/${sessionId}/answers?questionId=${encodeURIComponent(questionId)}`, { method: 'POST', body: JSON.stringify({ optionId }), requiresAuth: true }),
  results: (id: string) => request<QuizSummary>(`/quiz-sessions/${id}/results`, { requiresAuth: true }),
  createEssay: (topic: string) => request<{ id: string; topic: string; status: string }>('/essays', { method: 'POST', body: JSON.stringify({ topic }), requiresAuth: true }),
  discardEssay: (essayId: string) => request<{ discarded: boolean }>(`/essays/${essayId}`, { method: 'DELETE', requiresAuth: true }),
  uploadEssayImage: (essayId: string, image: File) => { const body = new FormData(); body.append('image', image); return request<{ accepted: boolean; images: number; page: number }>(`/essays/${essayId}/images`, { method: 'POST', body, timeout: 45_000, requiresAuth: true }); },
  transcribe: (essayId: string, consent: boolean) => request<Transcription>(`/essays/${essayId}/transcribe`, { method: 'POST', body: JSON.stringify({ consent }), timeout: 75_000, requiresAuth: true }),
  saveTranscription: (essayId: string, text: string) => request<{ status: string }>(`/essays/${essayId}/transcription`, { method: 'PATCH', body: JSON.stringify({ text }), requiresAuth: true }),
  evaluateEssay: (essayId: string, consent: boolean) => request<EssayEvaluation>(`/essays/${essayId}/evaluate`, { method: 'POST', body: JSON.stringify({ consent }), timeout: 75_000, requiresAuth: true }),
  essays: () => request<EssayHistory>('/essays', { requiresAuth: true }),
  essay: (id: string) => request<EssayDetail>(`/essays/${id}`, { requiresAuth: true }),
};
