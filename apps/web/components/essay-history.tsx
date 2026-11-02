'use client';
import type { EssayHistory } from '../lib/api';
import { formatEssayScoreRange } from '../lib/essay-score-range';

const competencyNames = ['C1', 'C2', 'C3', 'C4', 'C5'];

export function EssayHistoryPanel({ history, loading, onOpen }: { history?: EssayHistory; loading: boolean; onOpen: (id: string) => void }) {
  if (loading) return <p className="history-loading">Carregando seu histórico…</p>;
  if (!history?.essays.length) return null;
  const { summary } = history;
  return <section className="essay-history" aria-labelledby="history-title">
    <div className="history-heading">
      <div>
        <p className="eyebrow">EVOLUÇÃO</p>
        <h2 id="history-title">Seu histórico de redações</h2>
        <p className="history-description">Acompanhe suas faixas estimadas e retome seus textos quando quiser.</p>
      </div>
      <span className="history-count"><i aria-hidden="true" />{summary.evaluated} {summary.evaluated === 1 ? 'avaliação' : 'avaliações'}</span>
    </div>
    <div className="history-stats">
      <article className="history-stat history-stat-primary">
        <small>Última faixa</small>
        <b>{formatEssayScoreRange(summary.latestScore)}</b>
        <span>{summary.latestScore === null ? 'Aguardando sua primeira correção' : 'Redação mais recente'}</span>
      </article>
      <article className="history-stat history-stat-best">
        <small>Melhor faixa</small>
        <b>{formatEssayScoreRange(summary.bestScore)}</b>
        <span>{summary.bestScore === null ? 'Sua melhor nota aparecerá aqui' : 'Seu melhor resultado até agora'}</span>
      </article>
      {summary.delta !== null && <article className={`history-stat history-stat-delta ${summary.delta >= 0 ? 'positive' : 'negative'}`}>
        <small>Variação</small>
        <b>{summary.delta >= 0 ? '+' : ''}{summary.delta}</b>
        <span>Em relação à anterior</span>
      </article>}
    </div>
    {summary.competencyTrend.some((item) => item.delta !== null) && <div className="competency-trend" aria-label="Comparação por competência">{summary.competencyTrend.map((item, index) => <span key={item.id}><b>{competencyNames[index]}</b><small>{item.latestScore ?? '—'}{item.delta !== null ? ` · ${item.delta >= 0 ? '+' : ''}${item.delta}` : ''}</small></span>)}</div>}
    <div className="history-list">
      {history.essays.map((essay) => {
        const evaluated = essay.status === 'evaluated';
        return <button type="button" className={`history-item ${evaluated ? 'is-evaluated' : 'is-draft'}`} key={essay.id} onClick={() => onOpen(essay.id)}>
          <span className="history-item-copy">
            <b>{essay.topic}</b>
            <span className="history-item-meta"><time>{formatDate(essay.evaluatedAt ?? essay.createdAt)}</time><i aria-hidden="true" />{evaluated ? 'Devolutiva disponível' : 'Rascunho em andamento'}</span>
          </span>
          <span className="history-item-action">{evaluated ? <><small>Faixa</small><strong>{formatEssayScoreRange(essay.totalScore)}</strong></> : <><small>Rascunho</small><strong>Continuar <span aria-hidden="true">→</span></strong></>}</span>
        </button>;
      })}
    </div>
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
