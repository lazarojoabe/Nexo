'use client';

import type { QuizHistory } from '../lib/api';
import { ErrorState } from './error-state';
import { LoadingState } from './loading-state';

export function QuizHistoryPanel({ history, loading, error, onRetry, onOpen }: { history?: QuizHistory; loading: boolean; error: string; onRetry: () => void; onOpen: (id: string, complete: boolean) => void }) {
  if (loading) return <section className="quiz-history"><LoadingState label="Carregando seu histórico de acertos…" /></section>;
  if (error) return <section className="quiz-history"><ErrorState message={error} retry={onRetry} /></section>;
  if (!history || history.summary.sessions === 0) return <section className="quiz-history quiz-history-empty"><h2>Seu histórico de acertos</h2><p>Quando responder uma questão, seu desempenho aparecerá aqui.</p></section>;

  const { summary } = history;
  return <section className="quiz-history" aria-labelledby="quiz-history-title">
    <div className="quiz-history-heading"><div><p className="eyebrow">DESEMPENHO NO QUIZ</p><h2 id="quiz-history-title">Seu histórico de acertos</h2></div><strong>{summary.percentage === null ? '—' : `${summary.percentage}%`}</strong></div>
    <div className="quiz-history-stats"><article><b>{summary.correct}</b><span>acerto{summary.correct === 1 ? '' : 's'}</span></article><article><b>{summary.answered}</b><span>resposta{summary.answered === 1 ? '' : 's'}</span></article><article><b>{summary.completed}</b><span>sess{summary.completed === 1 ? 'ão concluída' : 'ões concluídas'}</span></article></div>
    <div className="quiz-history-list">{history.sessions.map((session) => <button type="button" key={session.id} className="quiz-history-item" onClick={() => onOpen(session.id, session.complete)} aria-label={`${session.complete ? 'Rever' : 'Continuar'} sessão de ${formatDate(session.createdAt)}`}><span><b>{formatDate(session.createdAt)}</b><small>{session.complete ? 'Sessão concluída · rever resultado' : 'Sessão em andamento · continuar'} · {session.answered}/{session.total} respondidas</small></span><strong>{session.answered ? `${session.correct}/${session.answered}` : '—'}<small>{session.percentage === null ? 'sem respostas' : `${session.percentage}%`}</small></strong></button>)}</div>
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
