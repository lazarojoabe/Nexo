'use client';
import { useEffect, useState } from 'react';
import type { Transcription } from '../lib/api';

export function TranscriptionEditor({ text, transcription, files, saving, onChange, onConfirm }: { text: string; transcription?: Transcription; files: File[]; saving: boolean; onChange: (value: string) => void; onConfirm: () => void }) {
  const [showImage, setShowImage] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const warnings = transcription?.lowConfidenceSegments ?? [];
  useEffect(() => { const urls = files.map((file) => URL.createObjectURL(file)); setPreviews(urls); return () => urls.forEach(URL.revokeObjectURL); }, [files]);
  return <section className="transcription-editor"><div className="section-heading"><div><p className="eyebrow">REVISÃO OBRIGATÓRIA</p><h2>Confira a transcrição</h2></div><button className="text-button" onClick={() => setShowImage((value) => !value)}>{showImage ? 'Ver texto' : 'Ver imagens'}</button></div><p className="muted-copy">Revise sua transcrição antes de enviar para a correção. A IA pode confundir palavras em imagens borradas ou com pouca iluminação.</p>
    {showImage ? <div className="original-pages">{files.length ? files.map((file, index) => <img key={`${file.name}-${index}`} src={previews[index]} alt={`Imagem original da página ${index + 1}`} />) : <p>As imagens ficam disponíveis nesta sessão de envio.</p>}</div> : <textarea value={text} onChange={(event) => onChange(event.target.value)} rows={13} maxLength={8000} aria-label="Texto transcrito" />}
    <p className="character-count">{text.length}/8.000 caracteres</p>{warnings.length > 0 && <aside className="low-confidence"><strong>Trechos para conferir</strong>{warnings.map((warning, index) => <p key={`${warning.text}-${index}`}>{warning.page ? `Página ${warning.page}: ` : ''}“{warning.text}”{warning.reason ? ` — ${warning.reason}` : ''}</p>)}</aside>}
    <button className="primary-button" disabled={saving || text.trim().length < 20} onClick={onConfirm}>{saving ? 'Salvando…' : 'Confirmar texto para avaliação'}</button>
  </section>;
}
