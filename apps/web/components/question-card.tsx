import type { Exam, Question, QuestionAsset, QuizAnswer } from '../lib/api';
import { splitQuestionText } from '../lib/question-text';
import { AnswerOption } from './answer-option';
import { AssetImage } from './asset-image';

export function QuestionCard({ question, exam, index, total, selected, feedback, sending, onSelect }: { question: Question; exam?: Exam; index: number; total: number; selected?: string; feedback?: QuizAnswer; sending: boolean; onSelect: (optionId: string) => void }) {
  const assets = question.assets ?? [];
  const beforeStatement = assets.filter((asset) => asset.placement === 'before_statement');
  const afterStatement = assets.filter((asset) => asset.placement === 'after_statement');
  const text = splitQuestionText(question.statement);
  return <article className="question-card"><header className="question-header"><div><p className="question-kicker">Questão {question.number ?? index + 1}</p><p className="question-count">{index + 1} de {total}</p></div><span className="question-area">{question.area}</span></header><div className="progress-track" aria-label={`Progresso: questão ${index + 1} de ${total}`}><span style={{ width: `${Math.round(((index + 1) / total) * 100)}%` }} /></div>
    <p className="question-source">{exam ? `ENEM ${exam.year} · Dia ${exam.day} · Caderno ${exam.color}` : question.source}</p>
    {beforeStatement.length > 0 ? <QuestionAssets assets={beforeStatement} /> : question.imageUrl && <AssetImage className="question-image" url={question.imageUrl} alt="Imagem complementar da questão" />}
    {text.context && <section className="question-context" aria-label="Texto-base"><span>Texto-base</span><QuestionParagraphs value={text.context} /></section>}
    <h1 className="question-statement">{text.prompt}</h1>{afterStatement.length > 0 && <QuestionAssets assets={afterStatement} />}<p className="question-instruction">Toque em uma alternativa para receber a correção e a resolução.</p>
    <div className="answer-list">{question.options.map((option) => <AnswerOption key={option.id} label={option.label} content={option.content} assets={assets.filter((asset) => asset.placement === 'option' && asset.optionLabel === option.label)} selected={selected === option.id} correct={feedback?.correctOptionId === option.id} incorrect={Boolean(feedback && selected === option.id && !feedback.correct)} disabled={Boolean(feedback) || sending} onSelect={() => onSelect(option.id)} />)}</div>
    {feedback && <div className={`answer-feedback ${feedback.correct ? 'positive' : ''}`} role="status"><strong>{feedback.correct ? 'Resposta correta. Veja a resolução.' : `Resposta incorreta. A alternativa correta é ${question.options.find((option) => option.id === feedback.correctOptionId)?.label ?? ''}.`}</strong><p>{feedback.explanation}</p>{feedback.resolutionPdfUrl && <a className="resolution-download" href={feedback.resolutionPdfUrl} download>Baixar resolução em PDF</a>}</div>}
  </article>;
}

function QuestionParagraphs({ value }: { value: string }) {
  return <div className="question-prose">{value.split(/\n{2,}/).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)}</div>;
}

function QuestionAssets({ assets }: { assets: QuestionAsset[] }) {
  return <div className="question-assets">{assets.map((asset) => <figure key={asset.id}><AssetImage className="question-image" url={asset.url} alt={asset.altText} /></figure>)}</div>;
}
