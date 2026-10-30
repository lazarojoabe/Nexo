'use client';
import { useEffect, useRef, useState } from 'react';
import type { Transcription } from '../lib/api';

export function TranscriptionEditor({ text, transcription, files, saving, onChange, onConfirm }: { text: string; transcription?: Transcription; files: File[]; saving: boolean; onChange: (value: string) => void; onConfirm: () => void }) {
  const [previews, setPreviews] = useState<string[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const uncertainTerms = transcription?.uncertainTerms ?? [];
  useEffect(() => { const urls = files.map((file) => URL.createObjectURL(file)); setPreviews(urls); return () => urls.forEach(URL.revokeObjectURL); }, [files]);

  function splitParagraph() {
    const cursor = textarea.current?.selectionStart ?? text.length;
    onChange(`${text.slice(0, cursor)}\n\n${text.slice(cursor)}`);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function joinParagraph() {
    const cursor = textarea.current?.selectionStart ?? 0;
    const before = text.lastIndexOf('\n\n', cursor);
    const after = text.indexOf('\n\n', cursor);
    const start = before >= 0 ? before : after;
    if (start < 0) return;
    onChange(`${text.slice(0, start)}\n${text.slice(start + 2)}`);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  return <section className="transcription-editor"><div className="section-heading"><div><p className="eyebrow">REVISÃO OBRIGATÓRIA</p><h2>Confira a leitura da sua redação</h2></div><span className="confidence-chip">{Math.round((transcription?.overallConfidence ?? 0) * 100)}% de confiança</span></div>
    <p className="muted-copy">A coluna de texto é a versão normalizada para leitura. Ela só une quebras físicas de linha confirmadas; não corrige a escrita do estudante.</p>
    {transcription?.requiresReview && <aside className="provisional-review"><strong>Avaliação provisória</strong><p>Há leitura de baixa confiança. Confirme os trechos destacados antes de avaliar para que a devolutiva use o seu texto real.</p></aside>}
    <div className="transcription-review-grid"><div><h3>Imagem original</h3><div className="original-pages">{files.length ? files.map((file, index) => <img key={`${file.name}-${index}`} src={previews[index]} alt={`Imagem original da página ${index + 1}`} />) : <p className="muted-copy">As imagens originais ficam disponíveis na sessão de envio.</p>}</div></div><div><h3>Texto normalizado em parágrafos</h3><div className="paragraph-guide">{transcription?.paragraphs.map((paragraph) => <span key={paragraph.index}>¶ {paragraph.index} · linhas {paragraph.lineRange.start}–{paragraph.lineRange.end}</span>)}</div><textarea ref={textarea} value={text} onChange={(event) => onChange(event.target.value)} rows={13} maxLength={8000} aria-label="Texto transcrito e normalizado" /><div className="paragraph-actions"><button type="button" className="text-button" onClick={splitParagraph}>Separar parágrafo aqui</button><button type="button" className="text-button" onClick={joinParagraph}>Unir parágrafos próximos</button></div><p className="character-count">{text.length}/8.000 caracteres</p></div></div>
    {uncertainTerms.length > 0 && <aside className="low-confidence"><strong>Palavras destacadas para conferir</strong><p className="uncertain-preview"><HighlightedText text={text} terms={uncertainTerms.map((term) => term.observed)} /></p>{uncertainTerms.map((term, index) => <p key={`${term.observed}-${index}`}>“{term.observed}”{term.suggestion !== term.observed ? ` — possível leitura: “${term.suggestion}”` : ''} ({Math.round(term.confidence * 100)}%)</p>)}</aside>}
    {(transcription?.corrections.length ?? 0) > 0 && <details className="transcription-corrections"><summary>Ver alterações visuais automáticas ({transcription!.corrections.length})</summary><p>Alterações de quebra de linha não são correções da escrita do estudante.</p>{transcription!.corrections.map((correction, index) => <p key={`${correction.original}-${index}`}><code>{correction.original}</code> → <code>{correction.normalized}</code> · {correction.reason}</p>)}</details>}
    <button className="primary-button" disabled={saving || text.trim().length < 20} onClick={onConfirm}>{saving ? 'Salvando…' : 'Confirmar texto para avaliação'}</button>
  </section>;
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const uniqueTerms = [...new Set(terms.filter(Boolean))];
  if (!uniqueTerms.length) return text;
  const expression = new RegExp(`(${uniqueTerms.map(escapeRegExp).join('|')})`, 'giu');
  return text.split(expression).map((part, index) => uniqueTerms.some((term) => term.localeCompare(part, 'pt-BR', { sensitivity: 'accent' }) === 0) ? <mark key={`${part}-${index}`}>{part}</mark> : part);
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
