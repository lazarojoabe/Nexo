import { useState } from 'react';
import type { Exam, Question, QuizAnswer, QuizSummary } from '../lib/api';
import { QuestionCard } from './question-card';
import { QuizResult } from './quiz-result';
import { Icon } from './ui/icon';

export function QuizSession({ exam, questions, index, selected, feedback, sending, summary, answeredQuestionIds, onSelect, onSkip, onFinish, onGoToQuestion, onNext, onRetry, onChooseExam }: { exam: Exam; questions: Question[]; index: number; selected?: string; feedback?: QuizAnswer; sending: boolean; summary?: QuizSummary; answeredQuestionIds: string[]; onSelect: (optionId: string) => void; onSkip: () => void; onFinish: () => void; onGoToQuestion: (index: number) => void; onNext: () => void; onRetry: () => void; onChooseExam: () => void }) {
  const [mapOpen, setMapOpen] = useState(false);
  if (summary) return <QuizResult summary={summary} questions={questions} onRetry={onRetry} onChooseExam={onChooseExam} />;
  const question = questions[index];
  if (!question) return null;
  const isLast = index + 1 === questions.length;
  const answered = new Set(answeredQuestionIds);
  return <section className="quiz-session"><nav className={`question-navigator ${mapOpen ? 'open' : ''}`} aria-label="Navegar entre questões"><div className="question-navigator-summary"><div><span>Questão {index + 1} de {questions.length}</span><small>{answered.size} respondida{answered.size === 1 ? '' : 's'}</small></div><button type="button" aria-expanded={mapOpen} onClick={() => setMapOpen((open) => !open)}>{mapOpen ? 'Fechar mapa' : 'Ver mapa'}</button></div>{mapOpen && <div className="question-map">{questions.map((item, itemIndex) => <button key={item.id} type="button" className={`${itemIndex === index ? 'current ' : ''}${answered.has(item.id) ? 'answered' : ''}`} aria-label={`Ir para a questão ${item.number ?? itemIndex + 1}${answered.has(item.id) ? ', respondida' : ', não respondida'}`} aria-current={itemIndex === index ? 'step' : undefined} onClick={() => onGoToQuestion(itemIndex)}>{itemIndex + 1}</button>)}</div>}</nav>{<QuestionCard question={question} exam={exam} index={index} total={questions.length} selected={selected} feedback={feedback} sending={sending} onSelect={onSelect} />}<div className="quiz-actions" aria-live="polite">{feedback ? <button className="primary-button" onClick={onNext}>{isLast ? 'Ver resultado' : 'Próxima questão'} <Icon name="arrow" size={17} /></button> : <><button className="skip-question-button" type="button" disabled={sending} onClick={onSkip}>{isLast ? 'Finalizar sem responder' : 'Pular por enquanto'}</button><p>{sending ? 'Corrigindo sua resposta…' : <>Toque em uma alternativa para corrigir e ver a resolução. <button type="button" disabled={sending} onClick={onFinish}>Encerrar prova agora</button></>}</p></>}</div></section>;
}
