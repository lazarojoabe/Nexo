'use client';
import type { EssayHistory } from '../lib/api';

const competencyNames = ['C1', 'C2', 'C3', 'C4', 'C5'];

export function EssayHistoryPanel({ history, loading, onOpen }: { history?: EssayHistory; loading: boolean; onOpen: (id: string) => void }) {
  if (loading) return <p className="history-loading">Carregando seu histórico…</p>;
  if (!history?.essays.length) return null;
  const { summary } = history;
  return <section className="essay-history" aria-labelledby="history-title">
    <div className="history-heading"><div><p className="eyebrow">EVOLUÇÃO</p><h2 id="history-title">Seu histórico de redações</h2></div><span>{summary.evaluated} avaliada{summary.evaluated === 1 ? '' : 's'}</span></div>
    <div className="history-stats"><article><b>{summary.latestScore ?? '—'}</b><small>última estimativa</small></article><article><b>{summary.bestScore ?? '—'}</b><small>melhor estimativa</small></article>{summary.delta !== null && <article className={summary.delta >= 0 ? 'positive' : 'negative'}><b>{summary.delta >= 0 ? '+' : ''}{summary.delta}</b><small>vs. anterior</small></article>}</div>
    {summary.competencyTrend.some((item) => item.delta !== null) && <div className="competency-trend" aria-label="Comparação por competência">{summary.competencyTrend.map((item, index) => <span key={item.id}><b>{competencyNames[index]}</b><small>{item.latestScore ?? '—'}{item.delta !== null ? ` (${item.delta >= 0 ? '+' : ''}${item.delta})` : ''}</small></span>)}</div>}
    <div className="history-list">{history.essays.map((essay) => <button type="button" className="history-item" key={essay.id} onClick={() => onOpen(essay.id)}><span><b>{essay.topic}</b><small>{formatDate(essay.evaluatedAt ?? essay.createdAt)} · {essay.status === 'evaluated' ? 'devolutiva disponível' : 'rascunho em andamento'}</small></span><strong>{essay.totalScore ?? '—'}</strong></button>)}</div>
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
