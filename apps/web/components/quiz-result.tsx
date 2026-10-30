'use client';
import { useState } from 'react';
import type { Question, QuizSummary } from '../lib/api';
import { Icon } from './ui/icon';

export function QuizResult({ summary, questions, onRetry, onChooseExam }: { summary: QuizSummary; questions: Question[]; onRetry: () => void; onChooseExam: () => void }) {
  const [onlyReview, setOnlyReview] = useState(false);
  const percentage = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0;
  const attempts = new Map(summary.attempts.map((attempt) => [attempt.questionId, attempt]));
  const visibleQuestions = onlyReview ? questions.filter((question) => !attempts.get(question.id)?.correct) : questions;
  return <section className="quiz-result"><p className="eyebrow">SESSÃO CONCLUÍDA</p><h1>{summary.correct} acertos de {summary.total}</h1><p className="result-score">{percentage}% de aproveitamento</p>{summary.areas.length > 0 && <div className="area-performance"><h2>Desempenho por área</h2>{summary.areas.map((area) => <article key={area.area}><span>{area.area}</span><b>{area.accuracy === null ? '—' : `${area.accuracy}%`}</b><small>{area.correct}/{area.total} acertos</small></article>)}</div>}<div className="review-list"><div className="review-heading"><h2>Revisar questões</h2><button type="button" onClick={() => setOnlyReview((value) => !value)}>{onlyReview ? 'Ver todas' : 'Somente erros'}</button></div>{visibleQuestions.map((question, index) => { const attempt = attempts.get(question.id); return <div className="review-item" key={question.id}><span className={attempt?.correct ? 'review-correct' : 'review-wrong'}>{attempt?.correct ? <Icon name="check" size={15} /> : '!'}</span><span>Questão {question.number ?? index + 1} · {question.area}</span><small>{attempt ? (attempt.correct ? 'Acertou' : 'Revisar') : 'Não respondida'}</small></div>; })}{!visibleQuestions.length && <p className="empty-state">Não há erros nesta sessão. Ótimo trabalho!</p>}</div><button className="primary-button" onClick={onRetry}>Refazer esta prova <Icon name="retry" size={17} /></button><button className="secondary-button" onClick={onChooseExam}>Escolher outra prova</button></section>;
}
