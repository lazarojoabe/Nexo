'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Dashboard, type EssayDetail, type EssayEvaluation, type EssayHistory, type Exam, type Question, type QuizAnswer, type QuizSession, type QuizSummary, type Transcription } from '../lib/api';
import { ErrorState } from '../components/error-state';
import { LoadingState } from '../components/loading-state';
import { ExamSelector } from '../components/exam-selector';
import { QuizSession as QuizSessionView } from '../components/quiz-session';
import { EssayUpload } from '../components/essay-upload';
import { TranscriptionEditor } from '../components/transcription-editor';
import { EvaluationResult } from '../components/evaluation-result';
import { EssayHistoryPanel } from '../components/essay-history';
import { Icon } from '../components/ui/icon';

type View = 'home' | 'exams' | 'quiz' | 'essay';
type EssayPhase = 'topic' | 'images' | 'review' | 'confirmed' | 'evaluation';

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [dashboardError, setDashboardError] = useState('');
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
  const [essayError, setEssayError] = useState('');
  const [essayHistory, setEssayHistory] = useState<EssayHistory>();
  const [loadingEssayHistory, setLoadingEssayHistory] = useState(false);

  const greeting = useMemo(() => new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite', []);
  useEffect(() => { void loadDashboard(); }, []);

  async function loadDashboard() {
    setDashboardError('');
    try { setDashboard(await api.dashboard()); } catch (error) { setDashboardError(message(error)); }
  }

  async function openExams() {
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

  async function resumeQuiz(id: string) {
    setFlowError('');
    try {
      const [savedSession, currentExams] = await Promise.all([api.session(id), exams.length ? Promise.resolve(exams) : api.exams()]);
      const selectedExam = currentExams.find((item) => item.id === savedSession.examId);
      if (!selectedExam) throw new Error('A prova desta sessão não está mais disponível.');
      const list = await api.questions(selectedExam.id);
      const byId = new Map(list.map((question) => [question.id, question]));
      const orderedQuestions = savedSession.questionIds.map((questionId) => byId.get(questionId)).filter((question): question is Question => Boolean(question));
      if (!orderedQuestions.length) throw new Error('As questões desta sessão não estão disponíveis.');
      setExams(currentExams); setExam(selectedExam); setQuestions(orderedQuestions); setSession(savedSession); setQuestionIndex(Math.min(savedSession.attempts?.length ?? 0, orderedQuestions.length - 1)); setSelected(undefined); setAnswer(undefined); setSummary(undefined); setAnsweredQuestionIds(savedSession.attempts?.map((attempt) => attempt.questionId) ?? []); setView('quiz');
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
    try { setSummary(await api.results(session.id)); void loadDashboard(); } catch (error) { setFlowError(message(error)); }
  }

  async function finishQuiz() {
    if (!session) return;
    setFlowError('');
    try { setSummary(await api.results(session.id)); void loadDashboard(); } catch (error) { setFlowError(message(error)); }
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
    try { const result = await api.transcribe(essayId, consent); setTranscription(result); setTranscribedText(result.text); setEssayPhase('review'); } catch (error) { setEssayError(message(error)); } finally { setTranscribing(false); }
  }

  async function confirmText() {
    if (!essayId) return;
    setSavingText(true); setEssayError('');
    try { await api.saveTranscription(essayId, transcribedText); setEssayPhase('confirmed'); } catch (error) { setEssayError(message(error)); } finally { setSavingText(false); }
  }

  async function evaluateEssay() {
    if (!essayId || !consent) return;
    setEvaluating(true); setEssayError('');
    try { setEvaluation(await api.evaluateEssay(essayId, consent)); setEssayPhase('evaluation'); void loadEssayHistory(); } catch (error) { setEssayError(message(error)); } finally { setEvaluating(false); }
  }

  async function loadEssayHistory() {
    setLoadingEssayHistory(true);
    try { setEssayHistory(await api.essays()); } catch (error) { setEssayError(message(error)); } finally { setLoadingEssayHistory(false); }
  }

  function resetEssay() {
    setTopic(''); setEssayId(''); setEssayPhase('topic'); setEssayFiles([]); setUploadedCount(0); setUploading(false); setConsent(false); setTranscription(undefined); setTranscribedText(''); setEvaluation(undefined); setEssayError('');
  }

  async function openHistoryEssay(id: string) {
    setEssayError('');
    try {
      const essay = await api.essay(id);
      restoreEssay(essay);
    } catch (error) { setEssayError(message(error)); }
  }

  function restoreEssay(essay: EssayDetail) {
    const restoredText = essay.confirmedText ?? essay.transcription ?? '';
    setEssayId(essay.id); setTopic(essay.topic); setEssayFiles([]); setUploadedCount(essay.images.length); setTranscribedText(restoredText); setConsent(Boolean(restoredText)); setEvaluation(essay.evaluation ?? undefined);
    setTranscription(essay.transcription ? { text: essay.transcription, lowConfidenceSegments: [] } : undefined);
    setEssayPhase(essay.evaluation ? 'evaluation' : essay.confirmedText ? 'confirmed' : essay.transcription ? 'review' : 'images');
  }

  function chooseEssay() { setView('essay'); setEssayError(''); void loadEssayHistory(); }
  function backHome() { setView('home'); setFlowError(''); }

  return <div className="app-shell"><header className="app-header"><div className="brand-lockup"><img className="brand-logo" src="/icon.svg" alt="" /><span>nexo</span></div>{dashboard?.progress && <span className="progress-chip">{dashboard.progress.percentage}% nas respostas</span>}</header><main>
    {view === 'home' && <HomeView greeting={greeting} dashboard={dashboard} error={dashboardError} onRetry={() => void loadDashboard()} onExams={() => void openExams()} onEssay={chooseEssay} onResume={(id) => void resumeQuiz(id)} />}
    {view === 'exams' && <ScreenHeader title="Provas" onBack={backHome}>{loadingExams ? <LoadingState label="Carregando provas…" /> : flowError ? <ErrorState message={flowError} retry={() => void openExams()} /> : <ExamSelector exams={exams} startingExamId={startingExamId} onStart={(item, area) => void startExam(item, area)} />}</ScreenHeader>}
    {view === 'quiz' && <ScreenHeader title="Resolver prova" onBack={() => setView('exams')}>{flowError && <ErrorState message={flowError} />}{exam && <QuizSessionView exam={exam} questions={questions} index={questionIndex} selected={selected} feedback={answer} sending={sendingAnswer} summary={summary} answeredQuestionIds={answeredQuestionIds} onSelect={selectAnswer} onConfirm={() => { if (selected) void submitAnswer(selected); }} onSkip={() => void nextQuestion()} onFinish={() => void finishQuiz()} onGoToQuestion={goToQuestion} onNext={() => void nextQuestion()} onRetry={retryExam} onChooseExam={() => void openExams()} />}</ScreenHeader>}
    {view === 'essay' && <ScreenHeader title="Minha redação" onBack={backHome}><EssayView phase={essayPhase} topic={topic} essayFiles={essayFiles} uploadedCount={uploadedCount} uploading={uploading} consent={consent} transcribing={transcribing} transcription={transcription} text={transcribedText} savingText={savingText} evaluation={evaluation} evaluating={evaluating} error={essayError} history={essayHistory} historyLoading={loadingEssayHistory} onTopic={setTopic} onCreate={() => void createEssay()} onFiles={setEssayFiles} onFileValidationError={setEssayError} onUpload={() => void uploadPages()} onConsent={setConsent} onTranscribe={() => void transcribeEssay()} onText={setTranscribedText} onConfirm={() => void confirmText()} onEvaluate={() => void evaluateEssay()} onOpenHistory={(id) => void openHistoryEssay(id)} onNew={resetEssay} /></ScreenHeader>}
  </main><nav className="bottom-nav" aria-label="Navegação principal"><button className={view === 'home' ? 'active' : ''} onClick={backHome}><Icon name="home" size={20} /><span>Início</span></button><button className={view === 'exams' || view === 'quiz' ? 'active' : ''} onClick={() => void openExams()}><Icon name="book" size={20} /><span>Provas</span></button><button className={view === 'essay' ? 'active' : ''} onClick={chooseEssay}><Icon name="pen" size={20} /><span>Redação</span></button></nav></div>;
}

function HomeView({ greeting, dashboard, error, onRetry, onExams, onEssay, onResume }: { greeting: string; dashboard?: Dashboard; error: string; onRetry: () => void; onExams: () => void; onEssay: () => void; onResume: (id: string) => void }) {
  return <section className="home-view"><p className="eyebrow">{greeting.toUpperCase()}, ESTUDANTE</p><h1>Seu estudo, em<br /><em>movimento real.</em></h1><p className="home-intro">Resolva provas importadas do ENEM ou transforme uma redação manuscrita em um plano de evolução.</p><div className="primary-actions"><button className="hero-action dark" onClick={onExams}><Icon name="book" size={22} /><span><b>Resolver uma prova</b><small>Escolha o ano, dia e caderno</small></span><Icon name="arrow" size={19} /></button><button className="hero-action light" onClick={onEssay}><Icon name="pen" size={22} /><span><b>Corrigir minha redação</b><small>Foto, transcrição e devolutiva</small></span><Icon name="arrow" size={19} /></button></div>
    {error ? <ErrorState message={error} retry={onRetry} /> : !dashboard ? <LoadingState label="Carregando seu resumo…" /> : <><section className="real-summary"><article><strong>{dashboard.examCount}</strong><span>{dashboard.examCount === 1 ? 'prova disponível' : 'provas disponíveis'}</span></article>{dashboard.progress && <article><strong>{dashboard.progress.percentage}%</strong><span>aproveitamento em {dashboard.progress.answered} resposta{dashboard.progress.answered === 1 ? '' : 's'}</span></article>}</section>{dashboard.resumeSession && <section className="resume-card"><p className="eyebrow">CONTINUAR SESSÃO</p><h2>{dashboard.resumeSession.answered} de {dashboard.resumeSession.total} questões respondidas</h2><p>{dashboard.resumeSession.correct} acerto{dashboard.resumeSession.correct === 1 ? '' : 's'} até agora.</p><button className="secondary-button" onClick={() => onResume(dashboard.resumeSession!.id)}>Continuar de onde parei <Icon name="arrow" size={17} /></button></section>}</>}
    <p className="disclaimer home-disclaimer">A correção de redação é educacional e não representa uma nota oficial do ENEM.</p>
  </section>;
}

function ScreenHeader({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <section className="screen"><div className="screen-top"><button className="back-button" onClick={onBack} aria-label="Voltar">←</button><span>{title}</span></div>{children}</section>;
}

function EssayView({ phase, topic, essayFiles, uploadedCount, uploading, consent, transcribing, transcription, text, savingText, evaluation, evaluating, error, history, historyLoading, onTopic, onCreate, onFiles, onFileValidationError, onUpload, onConsent, onTranscribe, onText, onConfirm, onEvaluate, onOpenHistory, onNew }: { phase: EssayPhase; topic: string; essayFiles: File[]; uploadedCount: number; uploading: boolean; consent: boolean; transcribing: boolean; transcription?: Transcription; text: string; savingText: boolean; evaluation?: EssayEvaluation; evaluating: boolean; error: string; history?: EssayHistory; historyLoading: boolean; onTopic: (value: string) => void; onCreate: () => void; onFiles: (files: File[]) => void; onFileValidationError: (message: string) => void; onUpload: () => void; onConsent: (value: boolean) => void; onTranscribe: () => void; onText: (value: string) => void; onConfirm: () => void; onEvaluate: () => void; onOpenHistory: (id: string) => void; onNew: () => void }) {
  if (phase === 'topic') return <section className="essay-intro">
    <p className="eyebrow">FLUXO DE REDAÇÃO</p><h1>Comece pelo tema.</h1>
    <p className="muted-copy">Você poderá escrever, fotografar ou fazer os dois. A revisão da transcrição é sempre sua.</p>
    <label className="field-label">Tema da redação<input value={topic} onChange={(event) => onTopic(event.target.value)} placeholder="Ex.: Desafios para a saúde mental no Brasil" maxLength={300} /></label>
    <button className="primary-button" disabled={topic.trim().length < 3} onClick={onCreate}>Criar redação <Icon name="arrow" size={17} /></button>
    <EssayHistoryPanel history={history} loading={historyLoading} onOpen={onOpenHistory} />
    {error && <ErrorState message={error} />}
  </section>;
  return <section className="essay-flow"><div className="essay-steps"><span className={phase === 'images' ? 'active' : ''}>1. Fotos</span><span className={phase === 'review' ? 'active' : ''}>2. Revisar</span><span className={phase === 'confirmed' || phase === 'evaluation' ? 'active' : ''}>3. Avaliar</span></div><p className="topic-chip">{topic}</p>
    {phase === 'images' && <><EssayUpload files={essayFiles} uploadedCount={uploadedCount} uploading={uploading} onChange={onFiles} onUpload={onUpload} onValidationError={onFileValidationError} /><label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} /><span>Concordo em enviar as imagens da minha redação para um provedor de IA com a finalidade de transcrever e avaliar meu texto.</span></label>{transcribing && <div className="transcription-progress" role="status"><span className="spinner" />Preparando imagens…<small>Lendo as páginas, reconhecendo o texto e identificando trechos incertos.</small></div>}<button className="primary-button" disabled={!consent || uploadedCount < 1 || uploading || transcribing} onClick={onTranscribe}>{transcribing ? 'Transcrevendo…' : 'Transcrever redação'}</button></>}
    {phase === 'review' && <TranscriptionEditor text={text} transcription={transcription} files={essayFiles} saving={savingText} onChange={onText} onConfirm={onConfirm} />}
    {phase === 'confirmed' && <section className="ready-evaluation"><p className="eyebrow">TEXTO CONFIRMADO</p><h2>Pronto para a devolutiva.</h2><p className="muted-copy">A análise usa as cinco competências do ENEM e destaca evidências do seu próprio texto.</p><label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} /><span>Confirmo o envio do texto para uma avaliação educacional por IA.</span></label><button className="primary-button" disabled={!consent || evaluating} onClick={onEvaluate}>{evaluating ? 'Avaliando…' : 'Avaliar pelas 5 competências'} <Icon name="spark" size={17} /></button></section>}
    {phase === 'evaluation' && evaluation && <><EvaluationResult evaluation={evaluation} /><button className="secondary-button" onClick={onNew}>Começar nova redação</button></>}{error && <ErrorState message={error} retry={phase === 'images' ? uploadedCount < essayFiles.length ? onUpload : uploadedCount ? onTranscribe : undefined : phase === 'confirmed' ? onEvaluate : undefined} />}
  </section>;
}

function message(error: unknown) { return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'; }
