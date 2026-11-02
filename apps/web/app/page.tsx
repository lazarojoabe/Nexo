'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Dashboard, type EssayDetail, type EssayEvaluation, type EssayHistory, type Exam, type Question, type QuizAnswer, type QuizHistory, type QuizSession, type QuizSummary, type Transcription } from '../lib/api';
import { ErrorState } from '../components/error-state';
import { LoadingState } from '../components/loading-state';
import { ExamSelector } from '../components/exam-selector';
import { QuizSession as QuizSessionView } from '../components/quiz-session';
import { EssayUpload } from '../components/essay-upload';
import { TranscriptionEditor } from '../components/transcription-editor';
import { EvaluationResult } from '../components/evaluation-result';
import { EssayHistoryPanel } from '../components/essay-history';
import { QuizHistoryPanel } from '../components/quiz-history';
import { Icon } from '../components/ui/icon';
import { RequireAuth } from '../components/require-auth';
import { accountName, useAuth } from '../components/auth-provider';

type View = 'home' | 'exams' | 'quiz' | 'essay';
type EssayPhase = 'topic' | 'images' | 'review' | 'confirmed' | 'evaluation';

export default function Home() {
  return <RequireAuth><AuthenticatedHome /></RequireAuth>;
}

function AuthenticatedHome() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<View>('home');
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [dashboardError, setDashboardError] = useState('');
  const [quizHistory, setQuizHistory] = useState<QuizHistory>();
  const [quizHistoryError, setQuizHistoryError] = useState('');
  const [loadingQuizHistory, setLoadingQuizHistory] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [startingExamId, setStartingExamId] = useState('');
  const [exam, setExam] = useState<Exam>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [session, setSession] = useState<QuizSession>();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [answer, setAnswer] = useState<QuizAnswer>();
  const [sendingAnswer, setSendingAnswer] = useState(false);
  const [summary, setSummary] = useState<QuizSummary>();
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);
  const [flowError, setFlowError] = useState('');

  const [topic, setTopic] = useState('');
  const [essayId, setEssayId] = useState('');
  const [essayPhase, setEssayPhase] = useState<EssayPhase>('topic');
  const [essayFiles, setEssayFiles] = useState<File[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<Transcription>();
  const [transcribedText, setTranscribedText] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [evaluation, setEvaluation] = useState<EssayEvaluation>();
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationMinimized, setEvaluationMinimized] = useState(false);
  const [discardingEssay, setDiscardingEssay] = useState(false);
  const [essayError, setEssayError] = useState('');
  const [essayHistory, setEssayHistory] = useState<EssayHistory>();
  const [loadingEssayHistory, setLoadingEssayHistory] = useState(false);

  const greeting = useMemo(() => new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite', []);
  useEffect(() => { void loadDashboard(); void loadQuizHistory(); }, []);

  async function loadDashboard() {
    setDashboardError('');
    try { setDashboard(await api.dashboard()); } catch (error) { setDashboardError(message(error)); }
  }

  async function loadQuizHistory() {
    setLoadingQuizHistory(true); setQuizHistoryError('');
    try { setQuizHistory(await api.quizHistory()); } catch (error) { setQuizHistoryError(message(error)); } finally { setLoadingQuizHistory(false); }
  }

  async function openExams() {
    if (evaluating) setEvaluationMinimized(true);
    setView('exams'); setFlowError('');
    if (exams.length) return;
    setLoadingExams(true);
    try { setExams(await api.exams()); } catch (error) { setFlowError(message(error)); } finally { setLoadingExams(false); }
  }

  async function startExam(selectedExam: Exam, area?: string) {
    setStartingExamId(selectedExam.id); setFlowError('');
    try {
      const list = await api.questions(selectedExam.id, area);
      if (!list.length) throw new Error('Este conteúdo ainda não possui questões ativas.');
      const created = await api.createSession(selectedExam.id, area);
      const byId = new Map(list.map((question) => [question.id, question]));
      const orderedQuestions = created.questionIds.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question));
      if (!orderedQuestions.length) throw new Error('Não foi possível carregar as questões desta sessão.');
      setExam(selectedExam); setQuestions(orderedQuestions); setSession(created); setQuestionIndex(0); setSelected(undefined); setAnswer(undefined); setSummary(undefined); setAnsweredQuestionIds([]); setView('quiz');
    } catch (error) { setFlowError(message(error)); } finally { setStartingExamId(''); }
  }

  async function resumeQuiz(id: string, showResult = false) {
    setFlowError('');
    try {
      const [savedSession, currentExams, savedSummary] = await Promise.all([api.session(id), exams.length ? Promise.resolve(exams) : api.exams(), showResult ? api.results(id) : Promise.resolve(undefined)]);
      const selectedExam = currentExams.find((item) => item.id === savedSession.examId);
      if (!selectedExam) throw new Error('A prova desta sessão não está mais disponível.');
      const list = await api.questions(selectedExam.id);
      const byId = new Map(list.map((question) => [question.id, question]));
      const orderedQuestions = savedSession.questionIds.map((questionId) => byId.get(questionId)).filter((question): question is Question => Boolean(question));
      if (!orderedQuestions.length) throw new Error('As questões desta sessão não estão disponíveis.');
      setExams(currentExams); setExam(selectedExam); setQuestions(orderedQuestions); setSession(savedSession); setQuestionIndex(showResult ? 0 : Math.min(savedSession.attempts?.length ?? 0, orderedQuestions.length - 1)); setSelected(undefined); setAnswer(undefined); setSummary(savedSummary); setAnsweredQuestionIds(savedSession.attempts?.map((attempt) => attempt.questionId) ?? []); setView('quiz');
    } catch (error) { setFlowError(message(error)); }
  }

  async function submitAnswer(optionId: string) {
    const question = questions[questionIndex];
    if (!session || !question || answer) return;
    setSelected(optionId); setSendingAnswer(true); setFlowError('');
    try { setAnswer(await api.answer(session.id, question.id, optionId)); setAnsweredQuestionIds((ids) => ids.includes(question.id) ? ids : [...ids, question.id]); } catch (error) { setSelected(undefined); setFlowError(message(error)); } finally { setSendingAnswer(false); }
  }

  function selectAnswer(optionId: string) {
    if (!answer) setSelected(optionId);
  }

  async function nextQuestion() {
    if (!session) return;
    if (questionIndex + 1 < questions.length) { setQuestionIndex((index) => index + 1); setSelected(undefined); setAnswer(undefined); return; }
    try { setSummary(await api.results(session.id)); void loadDashboard(); void loadQuizHistory(); } catch (error) { setFlowError(message(error)); }
  }

  async function finishQuiz() {
    if (!session) return;
    setFlowError('');
    try { setSummary(await api.results(session.id)); void loadDashboard(); void loadQuizHistory(); } catch (error) { setFlowError(message(error)); }
  }

  function goToQuestion(nextIndex: number) {
    setQuestionIndex(nextIndex); setSelected(undefined); setAnswer(undefined);
  }

  function retryExam() { if (exam) void startExam(exam, questions[0]?.area); }

  async function createEssay() {
    setEssayError('');
    try { const essay = await api.createEssay(topic); setEssayId(essay.id); setTopic(essay.topic); setEssayPhase('images'); } catch (error) { setEssayError(message(error)); }
  }

  async function uploadPages() {
    if (!essayId) return;
    setUploading(true); setEssayError('');
    try {
      for (let index = uploadedCount; index < essayFiles.length; index += 1) { await api.uploadEssayImage(essayId, essayFiles[index]); setUploadedCount(index + 1); }
    } catch (error) { setEssayError(message(error)); } finally { setUploading(false); }
  }

  async function transcribeEssay() {
    if (!essayId || !consent || uploadedCount < 1) return;
    setTranscribing(true); setEssayError('');
    try { const result = await api.transcribe(essayId, consent); setTranscription(result); setTranscribedText(result.normalizedText); setEssayPhase('review'); } catch (error) { setEssayError(message(error)); } finally { setTranscribing(false); }
  }

  async function confirmText() {
    if (!essayId) return;
    setSavingText(true); setEssayError('');
    try { await api.saveTranscription(essayId, transcribedText); setEssayPhase('confirmed'); } catch (error) { setEssayError(message(error)); } finally { setSavingText(false); }
  }

  async function evaluateEssay() {
    if (!essayId || !consent) return;
    setEvaluating(true); setEvaluationMinimized(false); setEssayError('');
    try { setEvaluation(await api.evaluateEssay(essayId, consent)); setEssayPhase('evaluation'); void loadEssayHistory(); } catch (error) { setEssayError(message(error)); } finally { setEvaluating(false); }
  }

  async function loadEssayHistory() {
    setLoadingEssayHistory(true);
    try { setEssayHistory(await api.essays()); } catch (error) { setEssayError(message(error)); } finally { setLoadingEssayHistory(false); }
  }

  async function discardEssay() {
    if (!essayId || discardingEssay || evaluating || uploading || transcribing || savingText) return;
    if (!window.confirm('Descartar esta redação e todas as imagens enviadas? Essa ação não pode ser desfeita.')) return;
    setDiscardingEssay(true); setEssayError('');
    try {
      await api.discardEssay(essayId);
      resetEssay();
      void loadEssayHistory();
    } catch (error) {
      setEssayError(message(error));
    } finally {
      setDiscardingEssay(false);
    }
  }

  function resetEssay() {
    setTopic(''); setEssayId(''); setEssayPhase('topic'); setEssayFiles([]); setUploadedCount(0); setUploading(false); setConsent(false); setTranscription(undefined); setTranscribedText(''); setEvaluation(undefined); setEvaluationMinimized(false); setDiscardingEssay(false); setEssayError('');
  }

  async function openHistoryEssay(id: string) {
    setEvaluationMinimized(false); setEssayError('');
    try {
      const essay = await api.essay(id);
      restoreEssay(essay);
    } catch (error) { setEssayError(message(error)); }
  }

  function restoreEssay(essay: EssayDetail) {
    const restoredText = essay.confirmedText ?? essay.transcriptionResult?.normalizedText ?? essay.transcription ?? '';
    setEssayId(essay.id); setTopic(essay.topic); setEssayFiles([]); setUploadedCount(essay.images.length); setTranscribedText(restoredText); setConsent(Boolean(restoredText)); setEvaluation(essay.evaluation ?? undefined);
    setTranscription(essay.transcriptionResult ?? undefined);
    setEssayPhase(essay.evaluation ? 'evaluation' : essay.confirmedText ? 'confirmed' : (essay.transcriptionResult || essay.transcription) ? 'review' : 'images');
  }

  function chooseEssay() { setView('essay'); setEvaluationMinimized(false); setEssayError(''); void loadEssayHistory(); }
  function backHome() { if (evaluating) setEvaluationMinimized(true); setView('home'); setFlowError(''); }
  function minimizeEvaluation() { if (!evaluating) return; setEvaluationMinimized(true); setView('home'); setFlowError(''); }
  function resumeEvaluation() { setView('essay'); setEvaluationMinimized(false); setEssayError(''); }
  async function leaveAccount() {
    try { await signOut(); } catch (error) { setDashboardError(message(error)); }
  }

  return <div className="app-shell"><header className="app-header"><div className="brand-lockup"><img className="brand-logo" src="/icon.svg" alt="" /><span>nexo</span></div><div className="account-panel"><span className="account-copy"><b>{user ? accountName(user) : 'Estudante'}</b><small>{user?.email}</small></span><button type="button" onClick={() => void leaveAccount()} aria-label="Sair da conta">Sair</button></div></header><main>
    {view === 'home' && <HomeView greeting={greeting} dashboard={dashboard} error={dashboardError} quizHistory={quizHistory} quizHistoryError={quizHistoryError} loadingQuizHistory={loadingQuizHistory} onRetry={() => void loadDashboard()} onRetryQuizHistory={() => void loadQuizHistory()} onExams={() => void openExams()} onEssay={chooseEssay} onResume={(id) => void resumeQuiz(id)} onOpenQuizHistory={(id, complete) => void resumeQuiz(id, complete)} />}
    {view === 'exams' && <ScreenHeader title="Provas" onBack={backHome}>{loadingExams ? <LoadingState label="Carregando provas…" /> : flowError ? <ErrorState message={flowError} retry={() => void openExams()} /> : <ExamSelector exams={exams} startingExamId={startingExamId} onStart={(item, area) => void startExam(item, area)} />}</ScreenHeader>}
    {view === 'quiz' && <ScreenHeader title="Resolver prova" onBack={() => setView('exams')}>{flowError && <ErrorState message={flowError} />}{exam && <QuizSessionView exam={exam} questions={questions} index={questionIndex} selected={selected} feedback={answer} sending={sendingAnswer} summary={summary} answeredQuestionIds={answeredQuestionIds} onSelect={selectAnswer} onConfirm={() => { if (selected) void submitAnswer(selected); }} onSkip={() => void nextQuestion()} onFinish={() => void finishQuiz()} onGoToQuestion={goToQuestion} onNext={() => void nextQuestion()} onRetry={retryExam} onChooseExam={() => void openExams()} />}</ScreenHeader>}
    {view === 'essay' && <ScreenHeader title="Minha redação" onBack={backHome}><EssayView phase={essayPhase} topic={topic} essayFiles={essayFiles} uploadedCount={uploadedCount} uploading={uploading} consent={consent} transcribing={transcribing} transcription={transcription} text={transcribedText} savingText={savingText} evaluation={evaluation} evaluating={evaluating} discarding={discardingEssay} error={essayError} history={essayHistory} historyLoading={loadingEssayHistory} onTopic={setTopic} onCreate={() => void createEssay()} onFiles={setEssayFiles} onFileValidationError={setEssayError} onUpload={() => void uploadPages()} onConsent={setConsent} onTranscribe={() => void transcribeEssay()} onText={setTranscribedText} onConfirm={() => void confirmText()} onEvaluate={() => void evaluateEssay()} onMinimize={minimizeEvaluation} onDiscard={() => void discardEssay()} onOpenHistory={(id) => void openHistoryEssay(id)} onNew={resetEssay} /></ScreenHeader>}
  </main>{evaluationMinimized && (evaluating || evaluation || essayError) && <EvaluationBackgroundStatus evaluating={evaluating} ready={Boolean(evaluation)} error={essayError} onOpen={resumeEvaluation} />}<nav className="bottom-nav" aria-label="Navegação principal"><button className={view === 'home' ? 'active' : ''} onClick={backHome}><Icon name="home" size={20} /><span>Início</span></button><button className={view === 'exams' || view === 'quiz' ? 'active' : ''} onClick={() => void openExams()}><Icon name="book" size={20} /><span>Provas</span></button><button className={view === 'essay' ? 'active' : ''} onClick={chooseEssay}><Icon name="pen" size={20} /><span>Redação</span></button></nav></div>;
}

function HomeView({ greeting, dashboard, error, quizHistory, quizHistoryError, loadingQuizHistory, onRetry, onRetryQuizHistory, onExams, onEssay, onResume, onOpenQuizHistory }: { greeting: string; dashboard?: Dashboard; error: string; quizHistory?: QuizHistory; quizHistoryError: string; loadingQuizHistory: boolean; onRetry: () => void; onRetryQuizHistory: () => void; onExams: () => void; onEssay: () => void; onResume: (id: string) => void; onOpenQuizHistory: (id: string, complete: boolean) => void }) {
  return <section className="home-view"><p className="eyebrow">{greeting.toUpperCase()}, ESTUDANTE</p><h1>Seu estudo, em<br /><em>movimento real.</em></h1><p className="home-intro">Resolva provas importadas do ENEM ou transforme uma redação manuscrita em um plano de evolução.</p><div className="primary-actions"><button className="hero-action dark" onClick={onExams}><Icon name="book" size={22} /><span><b>Resolver uma prova</b><small>Escolha o ano, dia e caderno</small></span><Icon name="arrow" size={19} /></button><button className="hero-action light" onClick={onEssay}><Icon name="pen" size={22} /><span><b>Corrigir minha redação</b><small>Foto, transcrição e devolutiva</small></span><Icon name="arrow" size={19} /></button></div>
    {error ? <ErrorState message={error} retry={onRetry} /> : !dashboard ? <LoadingState label="Carregando seu resumo…" /> : <><section className="real-summary"><article><strong>{dashboard.examCount}</strong><span>{dashboard.examCount === 1 ? 'prova disponível' : 'provas disponíveis'}</span></article>{dashboard.progress && <article><strong>{dashboard.progress.percentage}%</strong><span>aproveitamento em {dashboard.progress.answered} resposta{dashboard.progress.answered === 1 ? '' : 's'}</span></article>}</section>{dashboard.resumeSession && <section className="resume-card"><p className="eyebrow">CONTINUAR SESSÃO</p><h2>{dashboard.resumeSession.answered} de {dashboard.resumeSession.total} questões respondidas</h2><p>{dashboard.resumeSession.correct} acerto{dashboard.resumeSession.correct === 1 ? '' : 's'} até agora.</p><button className="secondary-button" onClick={() => onResume(dashboard.resumeSession!.id)}>Continuar de onde parei <Icon name="arrow" size={17} /></button></section>}<QuizHistoryPanel history={quizHistory} loading={loadingQuizHistory} error={quizHistoryError} onRetry={onRetryQuizHistory} onOpen={onOpenQuizHistory} /></>}
    <p className="disclaimer home-disclaimer">A correção de redação é educacional e não representa uma nota oficial do ENEM.</p>
  </section>;
}

function ScreenHeader({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <section className="screen"><div className="screen-top"><button className="back-button" onClick={onBack} aria-label="Voltar">←</button><span>{title}</span></div>{children}</section>;
}

function EvaluationBackgroundStatus({ evaluating, ready, error, onOpen }: { evaluating: boolean; ready: boolean; error: string; onOpen: () => void }) {
  const hasError = Boolean(error) && !evaluating && !ready;
  const title = evaluating ? 'Sua redação está sendo avaliada' : hasError ? 'A avaliação precisa da sua atenção' : 'Sua devolutiva está pronta';
  const detail = evaluating ? 'Você pode continuar estudando enquanto isso.' : hasError ? 'Abra a redação para tentar novamente.' : 'Abra para ver as cinco competências.';
  return <aside className={`evaluation-background-status${hasError ? ' has-error' : ready ? ' is-ready' : ''}`} role="status" aria-live="polite"><span className="evaluation-background-icon">{evaluating ? <span className="button-spinner" /> : <Icon name={hasError ? 'retry' : 'check'} size={19} />}</span><span className="evaluation-background-copy"><b>{title}</b><small>{detail}</small></span><button type="button" onClick={onOpen}>{evaluating ? 'Ver andamento' : hasError ? 'Ver detalhes' : 'Ver resultado'} <Icon name="arrow" size={15} /></button></aside>;
}

function EssayView({ phase, topic, essayFiles, uploadedCount, uploading, consent, transcribing, transcription, text, savingText, evaluation, evaluating, discarding, error, history, historyLoading, onTopic, onCreate, onFiles, onFileValidationError, onUpload, onConsent, onTranscribe, onText, onConfirm, onEvaluate, onMinimize, onDiscard, onOpenHistory, onNew }: { phase: EssayPhase; topic: string; essayFiles: File[]; uploadedCount: number; uploading: boolean; consent: boolean; transcribing: boolean; transcription?: Transcription; text: string; savingText: boolean; evaluation?: EssayEvaluation; evaluating: boolean; discarding: boolean; error: string; history?: EssayHistory; historyLoading: boolean; onTopic: (value: string) => void; onCreate: () => void; onFiles: (files: File[]) => void; onFileValidationError: (message: string) => void; onUpload: () => void; onConsent: (value: boolean) => void; onTranscribe: () => void; onText: (value: string) => void; onConfirm: () => void; onEvaluate: () => void; onMinimize: () => void; onDiscard: () => void; onOpenHistory: (id: string) => void; onNew: () => void }) {
  if (phase === 'topic') return <section className="essay-intro">
    <p className="eyebrow">FLUXO DE REDAÇÃO</p><h1>Comece pelo tema.</h1>
    <p className="muted-copy">Você poderá escrever, fotografar ou fazer os dois. A revisão da transcrição é sempre sua.</p>
    <label className="field-label">Tema da redação<input value={topic} onChange={(event) => onTopic(event.target.value)} placeholder="Ex.: Desafios para a saúde mental no Brasil" maxLength={300} /></label>
    <button className="primary-button" disabled={topic.trim().length < 3} onClick={onCreate}>Criar redação <Icon name="arrow" size={17} /></button>
    <EssayHistoryPanel history={history} loading={historyLoading} onOpen={onOpenHistory} />
    {error && <ErrorState message={error} />}
  </section>;
  const activeStep = phase === 'images' ? 1 : phase === 'review' ? 2 : 3;
  const steps = ['Fotos', 'Revisar', 'Avaliar'];
  return <section className="essay-flow"><div className="essay-steps" aria-label="Etapas da correção">{steps.map((step, index) => { const position = index + 1; return <span key={step} className={position === activeStep ? 'active' : position < activeStep ? 'complete' : ''} aria-current={position === activeStep ? 'step' : undefined}><b>{position}</b><small>{step}</small></span>; })}</div><div className="topic-chip"><span>Redação atual</span><strong>{topic}</strong></div>{phase !== 'evaluation' && <div className="essay-flow-actions"><button type="button" className="discard-essay-button" onClick={onDiscard} disabled={discarding || uploading || transcribing || savingText || evaluating}><Icon name="close" size={16} />{discarding ? 'Descartando redação…' : 'Descartar redação'}</button><small>Remove este rascunho e as imagens enviadas.</small></div>}
    {phase === 'images' && <><EssayUpload files={essayFiles} uploadedCount={uploadedCount} uploading={uploading} onChange={onFiles} onUpload={onUpload} onValidationError={onFileValidationError} /><label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} /><span>Concordo em enviar as imagens da minha redação para um provedor de IA com a finalidade de transcrever e avaliar meu texto.</span></label>{transcribing && <div className="transcription-progress" role="status"><span className="spinner" />Preparando imagens…<small>Lendo as páginas, reconhecendo o texto e identificando trechos incertos.</small></div>}<button className="primary-button" disabled={!consent || uploadedCount < 1 || uploading || transcribing} onClick={onTranscribe}>{transcribing ? 'Transcrevendo…' : 'Transcrever redação'}</button></>}
    {phase === 'review' && <TranscriptionEditor text={text} transcription={transcription} files={essayFiles} saving={savingText} onChange={onText} onConfirm={onConfirm} />}
    {phase === 'confirmed' && <section className="ready-evaluation"><div className="ready-evaluation-heading"><span className="ready-evaluation-icon"><Icon name="check" size={22} /></span><div><p className="eyebrow">TEXTO CONFIRMADO</p><h2>Pronto para a devolutiva.</h2></div></div><p className="muted-copy">Sua análise considera a redação completa e aponta caminhos claros para evoluir.</p><div className="evaluation-highlights" aria-label="O que a avaliação inclui"><span><b>5</b><small>competências do ENEM</small></span><span><Icon name="spark" size={18} /><small>feedbacks práticos</small></span></div><label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} /><span>Confirmo o envio do texto para uma avaliação educacional por IA.</span></label><button className={`primary-button evaluation-button${evaluating ? ' is-loading' : ''}`} disabled={!consent || evaluating} onClick={onEvaluate}>{evaluating ? <><span className="button-spinner" />Avaliando sua redação…</> : <>Avaliar pelas 5 competências <Icon name="spark" size={18} /></>}</button>{evaluating && <button type="button" className="minimize-evaluation-button" onClick={onMinimize}>Continuar navegando <Icon name="arrow" size={16} /></button>}</section>}
    {phase === 'evaluation' && evaluation && <><EvaluationResult evaluation={evaluation} /><button className="secondary-button" onClick={onNew}>Começar nova redação</button></>}{error && <ErrorState message={error} retry={phase === 'images' ? uploadedCount < essayFiles.length ? onUpload : uploadedCount ? onTranscribe : undefined : phase === 'confirmed' ? onEvaluate : undefined} />}
  </section>;
}

function message(error: unknown) { return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'; }
