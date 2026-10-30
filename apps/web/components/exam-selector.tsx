'use client';
import { useMemo, useState } from 'react';
import type { Exam } from '../lib/api';
import { Icon } from './ui/icon';

type ExamGroup = { id: string; year: number; day: number; color: string; version: string; source: string; variants: Exam[]; areas: Array<{ name: string; questionCount: number }> };
type PendingChoice = { group: ExamGroup; area: string };

export function ExamSelector({ exams, startingExamId, onStart }: { exams: Exam[]; startingExamId?: string; onStart: (exam: Exam, area: string) => void }) {
  const [year, setYear] = useState('');
  const [day, setDay] = useState('');
  const [color, setColor] = useState('');
  const [pending, setPending] = useState<PendingChoice>();
  const groups = useMemo(() => groupExams(exams), [exams]);
  const filters = useMemo(() => ({ years: distinct(groups.map((exam) => String(exam.year))), days: distinct(groups.map((exam) => String(exam.day))), colors: distinct(groups.map((exam) => exam.color)) }), [groups]);
  const visible = groups.filter((exam) => (!year || String(exam.year) === year) && (!day || String(exam.day) === day) && (!color || exam.color === color));

  return <section className="exam-selector" aria-labelledby="exam-title">
    <p className="eyebrow">PROVAS IMPORTADAS</p><h1 id="exam-title">Escolha sua prova</h1><p className="muted-copy">Selecione o ano e o conteúdo. Cada sessão reúne todas as questões disponíveis daquele bloco.</p>
    <div className="exam-filters" aria-label="Filtrar provas">
      <Filter label="Ano" value={year} values={filters.years} onChange={setYear} />
      <Filter label="Dia" value={day} values={filters.days} onChange={setDay} />
      <Filter label="Caderno" value={color} values={filters.colors} onChange={setColor} />
    </div>
    <div className="exam-list">{visible.map((group) => <article className="exam-card exam-card-content" key={group.id}>
      <div><p className="exam-year">ENEM {group.year}</p><h2>Dia {group.day} · Caderno {group.color}</h2><p>Escolha o conteúdo para abrir uma sessão completa.</p><small>{group.source}</small></div>
      <div className="content-choices" aria-label={`Conteúdos da prova ENEM ${group.year}, dia ${group.day}`}>
        {group.areas.map((area) => <button key={area.name} type="button" disabled={!area.questionCount} onClick={() => setPending({ group, area: area.name })}><span>{area.name}</span><small>{area.questionCount} questões <Icon name="arrow" size={14} /></small></button>)}
      </div>
    </article>)}</div>
    {!visible.length && <p className="empty-state">Nenhuma prova corresponde aos filtros selecionados.</p>}
    {pending && <LanguageModal pending={pending} startingExamId={startingExamId} onClose={() => setPending(undefined)} onStart={onStart} />}
  </section>;
}

function LanguageModal({ pending, startingExamId, onClose, onStart }: { pending: PendingChoice; startingExamId?: string; onClose: () => void; onStart: (exam: Exam, area: string) => void }) {
  const variants = [...pending.group.variants].sort((a, b) => languageLabel(a.language).localeCompare(languageLabel(b.language), 'pt-BR'));
  return <div className="language-modal-backdrop" role="presentation"><section className="language-modal" role="dialog" aria-modal="true" aria-labelledby="language-title">
    <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
    <p className="eyebrow">ÚLTIMA ESCOLHA</p><h2 id="language-title">Selecione o idioma</h2><p>Você vai resolver <strong>{pending.area}</strong> — {pending.group.year}, dia {pending.group.day}.</p>
    <div className="language-options">{variants.map((exam) => <button key={exam.id} className="language-option" type="button" disabled={startingExamId === exam.id} onClick={() => onStart(exam, pending.area)}><span>{languageLabel(exam.language)}</span><small>{areaCount(exam, pending.area)} questões <Icon name="arrow" size={15} /></small></button>)}</div>
    <button className="text-button modal-cancel" type="button" onClick={onClose}>Voltar para conteúdos</button>
  </section></div>;
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Todos</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>;
}

function groupExams(exams: Exam[]): ExamGroup[] {
  const groups = new Map<string, ExamGroup>();
  for (const exam of exams) {
    const id = `${exam.year}:${exam.day}:${exam.color}:${exam.version}`;
    const group = groups.get(id) ?? { id, year: exam.year, day: exam.day, color: exam.color, version: exam.version, source: exam.source, variants: [], areas: [] };
    group.variants.push(exam);
    for (const area of exam.areas) {
      const existing = group.areas.find((item) => item.name === area.name);
      if (existing) existing.questionCount = Math.max(existing.questionCount, area.questionCount);
      else group.areas.push({ ...area });
    }
    groups.set(id, group);
  }
  return [...groups.values()].map((group) => ({ ...group, areas: group.areas.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) })).sort((a, b) => b.year - a.year || a.day - b.day || a.color.localeCompare(b.color, 'pt-BR'));
}

function areaCount(exam: Exam, area: string) { return exam.areas.find((item) => item.name === area)?.questionCount ?? 0; }
function languageLabel(language?: string | null) { if (language === 'en') return 'Inglês'; if (language === 'es') return 'Espanhol'; return language || 'Idioma não informado'; }
function distinct(values: string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR')); }
