'use client';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
type Question = { id: string; area: string; statement: string; explanation: string; source: string; options: { id: string; label: string; content: string }[] };
type Step = 'home' | 'quiz' | 'essay' | 'progress';
type QuizResult = { correct: boolean; correctOptionId: string; explanation: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'Não foi possível concluir esta ação.');
  return body as T;
}

function Icon({ name, size = 20 }: { name: 'home' | 'bolt' | 'pen' | 'chart' | 'arrow' | 'check' | 'lock' | 'spark'; size?: number }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7z" />,
    pen: <><path d="m4 20 4.3-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.3 16z" /><path d="m13.5 7.5 3 3" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m7 15 3-4 3 2 5-7" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    spark: <><path d="m12 3-1.4 5.6L5 10l5.6 1.4L12 17l1.4-5.6L19 10l-5.6-1.4z" /><path d="m19 16-.6 2.4L16 19l2.4.6L19 22l.6-2.4L22 19l-2.4-.6z" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [step, setStep] = useState<Step>('home');
  const [question, setQuestion] = useState<Question>();
  const [session, setSession] = useState<string>();
  const [result, setResult] = useState<QuizResult>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [topic, setTopic] = useState('');
  const [essayId, setEssayId] = useState('');
  const [text, setText] = useState('');
  const [essayMessage, setEssayMessage] = useState('');
  const [image, setImage] = useState<File>();
  const [consent, setConsent] = useState(false);
  const [streak, setStreak] = useState(3);

  useEffect(() => { if (step === 'quiz') void startQuiz(); }, [step]);
  const answered = result ? 1 : 0;
  const progressText = result ? '1 de 1 concluída' : '0 de 1 concluída';
  const greeting = useMemo(() => new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite', []);

  async function startQuiz() {
    setError(''); setResult(undefined); setSelected(undefined);
    try { const list = await request<Question[]>('/questions'); const first = list[0]; if (!first) throw new Error('Ainda não há questões disponíveis.'); const created = await request<{ id: string }>('/quiz-sessions', { method: 'POST', body: JSON.stringify({ questionIds: [first.id] }) }); setQuestion(first); setSession(created.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro inesperado.'); }
  }
  async function answer(optionId: string) {
    if (!question || !session || result) return;
    setSelected(optionId);
    try { const answerResult = await request<QuizResult>(`/quiz-sessions/${session}/answers?questionId=${question.id}`, { method: 'POST', body: JSON.stringify({ optionId }) }); setResult(answerResult); if (answerResult.correct) setStreak((value) => value + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro inesperado.'); }
  }
  async function startEssay() { try { const essay = await request<{ id: string }>('/essays', { method: 'POST', body: JSON.stringify({ topic }) }); setEssayId(essay.id); setEssayMessage('Rascunho criado. Agora revise tudo com calma.'); } catch (e) { setEssayMessage(e instanceof Error ? e.message : 'Erro inesperado.'); } }
  async function saveText() { try { await request(`/essays/${essayId}/transcription`, { method: 'PATCH', body: JSON.stringify({ text }) }); setEssayMessage('Transcrição salva. Você pode pedir uma avaliação quando quiser.'); } catch (e) { setEssayMessage(e instanceof Error ? e.message : 'Erro inesperado.'); } }
  async function evaluate() { try { const evaluation = await request<{ totalScore: number }>(`/essays/${essayId}/evaluate`, { method: 'POST', body: JSON.stringify({ consent }) }); setEssayMessage(`Estimativa: ${evaluation.totalScore}/1000. Continue evoluindo!`); } catch (e) { setEssayMessage(e instanceof Error ? e.message : 'Erro inesperado.'); } }
  async function upload(e: ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (!file || !essayId) return; setImage(file); const form = new FormData(); form.append('image', file); const response = await fetch(`${api}/essays/${essayId}/images`, { method: 'POST', headers: { 'x-user-id': 'demo-user' }, body: form }); const payload = await response.json(); setEssayMessage(response.ok ? 'Imagem recebida. A transcrição ficará disponível com a IA configurada.' : payload.message); }

  function HomeView() {
    return <>
      <section className="welcome-row"><div><p className="kicker">{greeting}, estudante</p><h2>Vamos fazer acontecer.</h2></div><button className="avatar" aria-label="Abrir perfil">L</button></section>
      <section className="hero-card"><div className="hero-copy"><span className="hero-label"><Icon name="spark" size={14} /> FOCO NO ENEM 2026</span><h3>Seu próximo<br /><em>acerto</em> começa aqui.</h3><p>Um pouco por dia. Um passo de cada vez.</p><button className="hero-button" onClick={() => setStep('quiz')}>Começar agora <Icon name="arrow" size={17} /></button></div><div className="hero-orb"><span>92%</span><small>ritmo</small></div></section>
      <section className="section-heading"><div><p className="eyebrow">SEU MOMENTO</p><h3>Continue de onde parou</h3></div><button className="text-link" onClick={() => setStep('progress')}>Ver tudo <Icon name="arrow" size={15} /></button></section>
      <div className="stats-grid"><div className="stat-card peach"><span className="stat-icon"><Icon name="bolt" size={18} /></span><strong>{streak} dias</strong><small>de sequência</small></div><div className="stat-card mint"><span className="stat-icon"><Icon name="chart" size={18} /></span><strong>68%</strong><small>aproveitamento</small></div></div>
      <section className="quick-grid"><button className="quick-card lavender" onClick={() => setStep('quiz')}><span className="quick-icon"><Icon name="bolt" /></span><b>Quiz relâmpago</b><small>5 min · Matemática</small><span className="card-arrow"><Icon name="arrow" size={16} /></span></button><button className="quick-card yellow" onClick={() => setStep('essay')}><span className="quick-icon"><Icon name="pen" /></span><b>Treinar redação</b><small>Escreva sem pressão</small><span className="card-arrow"><Icon name="arrow" size={16} /></span></button></section>
      <section className="tip-card"><span><Icon name="spark" size={18} /></span><div><b>Dica de hoje</b><p>Errar também é estudar. Revise a explicação e tente de novo.</p></div></section>
      <p className="demo-note">Modo demonstrativo · conteúdos exibidos não são oficiais do Inep.</p>
    </>;
  }

  function QuizView() {
    return <section className="screen quiz-screen"><div className="screen-top"><button className="icon-button" onClick={() => setStep('home')} aria-label="Voltar"><Icon name="arrow" size={20} /></button><span className="screen-title">QUIZ RELÂMPAGO</span><span className="question-count">{progressText}</span></div><div className="progress-track"><span style={{ width: `${answered ? 100 : 12}%` }} /></div>{error ? <p className="error">{error}</p> : question && <><div className="subject-line"><span className="subject-dot" />{question.area}<span className="source-pill">Demonstração</span></div><h2 className="question-title">{question.statement}</h2><p className="question-hint">Escolha uma alternativa para continuar</p><div className="answer-list">{question.options.map((option) => { const correct = result && option.id === result.correctOptionId; const wrong = result && selected === option.id && !result.correct; return <button key={option.id} className={`answer ${correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}`} disabled={!!result} onClick={() => void answer(option.id)}><span className="answer-letter">{option.label}</span><span>{option.content}</span>{correct && <Icon name="check" size={19} />}</button>; })}</div>{result && <div className={`answer-feedback ${result.correct ? 'positive' : ''}`}><span className="feedback-mark"><Icon name={result.correct ? 'check' : 'spark'} size={18} /></span><div><b>{result.correct ? 'Mandou bem!' : 'Quase lá — bora revisar?'}</b><p>{result.explanation}</p></div><button onClick={() => void startQuiz()} aria-label="Nova questão"><Icon name="arrow" size={18} /></button></div>}</>}</section>;
  }

  function EssayView() {
    return <section className="screen essay-screen"><div className="screen-top"><button className="icon-button" onClick={() => setStep('home')} aria-label="Voltar"><Icon name="arrow" size={20} /></button><span className="screen-title">MINHA REDAÇÃO</span><span className="round-label">Rascunho</span></div>{!essayId ? <><div className="essay-intro"><span className="essay-sticker"><Icon name="pen" size={24} /></span><p className="eyebrow">MODO AUTOR</p><h2>Suas ideias<br /><em>merecem espaço.</em></h2><p>Escolha um tema e coloque suas palavras no mundo.</p></div><label className="field-label">Qual é o tema?<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex.: Desafios para a saúde mental..." /></label><button className="primary-button" disabled={topic.trim().length < 3} onClick={() => void startEssay()}>Criar meu rascunho <Icon name="arrow" size={18} /></button><div className="safe-note"><Icon name="lock" size={16} /> Seu texto fica privado e sob seu controle.</div></> : <><div className="essay-progress"><span className="essay-step active">1 <small>Escrever</small></span><i /><span className="essay-step">2 <small>Revisar</small></span><i /><span className="essay-step">3 <small>Evoluir</small></span></div><p className="topic-chip">{topic}</p><label className="field-label">Seu texto<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite ou cole sua redação aqui..." rows={11} /></label><div className="word-count">{text.length} / 8.000 caracteres</div><label className="upload-box"><Icon name="pen" size={20} /><span><b>Tem uma foto?</b><small>Envie até 5 imagens da redação</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} /></label>{image && <p className="file-name">✓ {image.name}</p>}<button className="primary-button" disabled={text.trim().length < 20} onClick={() => void saveText()}>Salvar texto <Icon name="check" size={18} /></button><label className="consent-row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>Concordo em enviar meu texto ao Gemini para receber uma estimativa.</span></label><button className="secondary-button" disabled={text.trim().length < 20 || !consent} onClick={() => void evaluate()}><Icon name="spark" size={18} /> Pedir avaliação</button><p className="disclaimer">A avaliação é educacional, não oficial e não garante desempenho.</p></>}{essayMessage && <p className="inline-message">{essayMessage}</p>}</section>;
  }

  return <div className="app-shell"><header className="app-header"><div className="brand-lockup"><img className="brand-logo" src="/icon.svg" alt="" /><span className="brand-name">nexo</span></div><button className="header-streak"><Icon name="bolt" size={16} /> {streak}</button></header><main>{step === 'home' && <HomeView />}{step === 'quiz' && <QuizView />}{step === 'essay' && <EssayView />}{step === 'progress' && <section className="screen"><button className="back-link" onClick={() => setStep('home')}>← Voltar</button><p className="eyebrow">SEU MOMENTO</p><h2>Você está construindo<br /><em>consistência.</em></h2><div className="big-progress"><strong>68%</strong><span>aproveitamento geral</span><div><i /></div></div><p className="demo-note">O histórico detalhado será ampliado conforme mais questões oficiais forem importadas.</p></section>}</main><nav className="bottom-nav"><button className={step === 'home' || step === 'progress' ? 'active' : ''} onClick={() => setStep('home')}><Icon name="home" size={20} /><small>Início</small></button><button className={step === 'quiz' ? 'active' : ''} onClick={() => setStep('quiz')}><Icon name="bolt" size={20} /><small>Praticar</small></button><button className={step === 'essay' ? 'active' : ''} onClick={() => setStep('essay')}><Icon name="pen" size={20} /><small>Redação</small></button><button className={step === 'progress' ? 'active' : ''} onClick={() => setStep('progress')}><Icon name="chart" size={20} /><small>Progresso</small></button></nav></div>;
}
