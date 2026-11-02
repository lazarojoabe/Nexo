import type { EssayEvaluation } from '../lib/api';
import { formatEssayScoreRange } from '../lib/essay-score-range';

export function EvaluationResult({ evaluation }: { evaluation: EssayEvaluation }) {
  const ordered = evaluation.competencies.slice().sort((a, b) => a.id - b.id);
  return <section className="evaluation-result">
    <p className="eyebrow">DEVOLUTIVA EDUCACIONAL POR IA</p>
    <p className="score-range-label">Faixa estimada de desempenho</p>
    <h2>{formatEssayScoreRange(evaluation.totalScore)}/1000</h2>
    <p className="disclaimer">Esta faixa é uma estimativa educacional por IA. Não é nota oficial do Inep e não substitui a correção de uma pessoa.</p>
    <p className="muted-copy">{evaluation.generalFeedback}</p>
    {evaluation.needsHumanReview && <aside className="evaluation-warning" role="status"><b>Revisão humana recomendada</b><ul>{evaluation.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></aside>}
    <aside className="feedback-review-guide" aria-labelledby="feedback-review-title">
      <h3 id="feedback-review-title">Use a devolutiva para revisar — não para obedecer cegamente</h3>
      <ol>
        <li>Confira se o trecho citado está mesmo na sua redação e se o diagnóstico faz sentido.</li>
        <li>Compare a sugestão com o tema e com a sua intenção antes de alterar o texto.</li>
        <li>Escolha uma ou duas melhorias por vez e releia a versão revisada.</li>
      </ol>
    </aside>
    <section className="competency-section" aria-labelledby="competency-feedback-title">
      <div className="competency-section-heading"><h3 id="competency-feedback-title">Revise por competência</h3><p>Comece pelo que precisa de atenção e preserve o que já funciona bem no seu texto.</p></div>
      <div className="competency-list">{ordered.map((competency) => <article key={competency.id} className="competency-card">
        <header><span>Competência {competency.id}</span><strong>{competency.score}</strong></header>
        <p className="competency-level">{competency.level}</p>
        {competency.strengths.length > 0 && <p><b>Pontos fortes:</b> {competency.strengths.join(' · ')}</p>}
        {competency.issues.length > 0 && <p><b>Para melhorar:</b> {competency.issues.join(' · ')}</p>}
        {competency.evidence.map((evidence, index) => <blockquote key={index}>“{evidence.excerpt}”<small>{evidence.explanation}</small></blockquote>)}
        <div className="feedback-points"><h4>Sugestões nesta competência</h4>{competency.feedbackPoints.map((point, index) => <article key={`${point.category}-${index}`} className={`feedback-point ${point.severity}`}><span>{label(point.category)} · {label(point.severity)}</span>{point.excerpt && <q>{point.excerpt}</q>}<p>{point.diagnosis}</p><b>Sugestão de revisão:</b><p>{point.suggestion}</p></article>)}</div>
        <div><h4>Ações para testar</h4><ul>{competency.actionableFeedback.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}</ul></div>
      </article>)}</div>
    </section>
    <div className="priority-actions"><h3>Prioridades para sua revisão</h3><p>Use esta ordem como guia de estudo; só aplique uma sugestão depois de conferir que ela melhora a sua ideia.</p><ol>{evaluation.priorityActions.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}</ol></div>
    {evaluation.interventionProposal && <div className="intervention-card"><h3>Proposta de intervenção identificada</h3><dl><div><dt>Agente</dt><dd>{evaluation.interventionProposal.agent}</dd></div><div><dt>Ação</dt><dd>{evaluation.interventionProposal.action}</dd></div><div><dt>Meio/modo</dt><dd>{evaluation.interventionProposal.means}</dd></div><div><dt>Finalidade</dt><dd>{evaluation.interventionProposal.purpose}</dd></div>{evaluation.interventionProposal.detail && <div><dt>Detalhamento</dt><dd>{evaluation.interventionProposal.detail}</dd></div>}</dl></div>}
    {evaluation.limitations.length > 0 && <aside className="evaluation-limitations"><h3>Limitações da estimativa</h3><ul>{evaluation.limitations.map((item) => <li key={item}>{item}</li>)}</ul></aside>}
    <p className="evaluation-meta">Confiança {evaluation.confidence} · Rubrica {evaluation.rubricVersion}</p>
  </section>;
}

function label(value: string) { return value.replaceAll('_', ' '); }
