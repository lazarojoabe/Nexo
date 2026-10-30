import type { EssayEvaluation } from '../lib/api';

export function EvaluationResult({ evaluation }: { evaluation: EssayEvaluation }) {
  const ordered = evaluation.competencies.slice().sort((a, b) => a.id - b.id);
  return <section className="evaluation-result">
    <p className="eyebrow">DEVOLUTIVA EDUCACIONAL POR IA</p>
    <h2>Estimativa: {evaluation.totalScore}/1000</h2>
    <p className="disclaimer">Esta é uma estimativa educacional por IA — não é nota oficial do Inep.</p>
    <p className="muted-copy">{evaluation.generalFeedback}</p>
    {evaluation.needsHumanReview && <aside className="evaluation-warning" role="status"><b>Revisão humana recomendada</b><ul>{evaluation.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></aside>}
    <div className="competency-list">{ordered.map((competency) => <article key={competency.id} className="competency-card">
      <header><span>Competência {competency.id}</span><strong>{competency.score}</strong></header>
      <p className="competency-level">{competency.level}</p>
      {competency.strengths.length > 0 && <p><b>Pontos fortes:</b> {competency.strengths.join(' · ')}</p>}
      {competency.issues.length > 0 && <p><b>Para melhorar:</b> {competency.issues.join(' · ')}</p>}
      {competency.evidence.map((evidence, index) => <blockquote key={index}>“{evidence.excerpt}”<small>{evidence.explanation}</small></blockquote>)}
      <div className="feedback-points"><h3>Feedbacks pontuais</h3>{competency.feedbackPoints.map((point, index) => <article key={`${point.category}-${index}`} className={`feedback-point ${point.severity}`}><span>{label(point.category)} · {label(point.severity)}</span>{point.excerpt && <q>{point.excerpt}</q>}<p>{point.diagnosis}</p><b>Como revisar:</b><p>{point.suggestion}</p></article>)}</div>
      <div><h3>Ações práticas</h3><ul>{competency.actionableFeedback.map((action) => <li key={action}>{action}</li>)}</ul></div>
    </article>)}</div>
    <div className="priority-actions"><h3>Prioridades de revisão</h3><ol>{evaluation.priorityActions.map((action) => <li key={action}>{action}</li>)}</ol></div>
    {evaluation.interventionProposal && <div className="intervention-card"><h3>Proposta de intervenção identificada</h3><dl><div><dt>Agente</dt><dd>{evaluation.interventionProposal.agent}</dd></div><div><dt>Ação</dt><dd>{evaluation.interventionProposal.action}</dd></div><div><dt>Meio/modo</dt><dd>{evaluation.interventionProposal.means}</dd></div><div><dt>Finalidade</dt><dd>{evaluation.interventionProposal.purpose}</dd></div>{evaluation.interventionProposal.detail && <div><dt>Detalhamento</dt><dd>{evaluation.interventionProposal.detail}</dd></div>}</dl></div>}
    {evaluation.limitations.length > 0 && <aside className="evaluation-limitations"><h3>Limitações da estimativa</h3><ul>{evaluation.limitations.map((item) => <li key={item}>{item}</li>)}</ul></aside>}
    <p className="evaluation-meta">Confiança {evaluation.confidence} · Rubrica {evaluation.rubricVersion}</p>
  </section>;
}

function label(value: string) { return value.replaceAll('_', ' '); }
