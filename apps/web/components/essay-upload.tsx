'use client';
import { ChangeEvent, useEffect, useState } from 'react';
import { Icon } from './ui/icon';

export function EssayUpload({ files, uploadedCount, uploading, onChange, onUpload, onValidationError }: { files: File[]; uploadedCount: number; uploading: boolean; onChange: (files: File[]) => void; onUpload: () => void; onValidationError?: (message: string) => void }) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => { const urls = files.map((file) => URL.createObjectURL(file)); setPreviews(urls); return () => urls.forEach(URL.revokeObjectURL); }, [files]);
  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const sized = selected.filter((file) => file.size <= 8 * 1024 * 1024);
    // Do not reject files based on the browser's MIME/extension metadata. Some
    // Android providers expose screenshots with an empty or generic type. The
    // API performs the authoritative signature and decoding validation.
    const valid = sized;
    const available = Math.max(0, 5 - files.length);
    onChange([...files, ...valid.slice(0, available)]);
    const invalidCount = selected.length - valid.length;
    const excessCount = Math.max(0, valid.length - available);
    if (invalidCount) onValidationError?.('Algumas páginas excedem o limite de 8 MB por página.');
    else if (excessCount) onValidationError?.('Você pode enviar no máximo 5 páginas por redação.');
    else onValidationError?.('');
    event.target.value = '';
  }
  function move(index: number, direction: -1 | 1) { const target = index + direction; if (index < uploadedCount || target < uploadedCount || target < 0 || target >= files.length) return; const next = [...files]; [next[index], next[target]] = [next[target], next[index]]; onChange(next); }
  return <section className="essay-upload"><div className="upload-heading"><div><h2>Fotos da redação</h2><p>JPG/JPEG, PNG ou WebP · até 8 MB por página · máximo de 5.</p></div><span>{files.length}/5</span></div>
    <div className="upload-actions"><label className="upload-choice"><Icon name="camera" size={19} /><span>Usar câmera</span><input type="file" accept="image/*,image/jpg,.jpg,.jpeg,.png,.webp" capture="environment" onChange={(event) => void addFiles(event)} /></label><label className="upload-choice"><Icon name="gallery" size={19} /><span>Escolher galeria</span><input type="file" accept="image/*,image/jpg,.jpg,.jpeg,.png,.webp" multiple onChange={(event) => void addFiles(event)} /></label></div>
    {files.length > 0 && <div className="page-previews">{files.map((file, index) => <article key={`${file.name}-${file.lastModified}-${index}`} className="page-preview"><img src={previews[index]} alt={`Prévia da página ${index + 1}`} /><div><b>Página {index + 1}{index < uploadedCount ? ' · enviada' : ''}</b><small>{file.name} · {formatSize(file.size)}</small><div className="page-controls"><button onClick={() => move(index, -1)} disabled={index === 0 || index < uploadedCount || index - 1 < uploadedCount || uploading} aria-label="Mover página para trás">←</button><button onClick={() => move(index, 1)} disabled={index === files.length - 1 || index < uploadedCount || uploading} aria-label="Mover página para frente">→</button><button onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))} disabled={index < uploadedCount || uploading} aria-label="Remover página"><Icon name="close" size={15} /></button></div></div></article>)}</div>}
    {!!files.length && <button className="secondary-button" disabled={uploading || uploadedCount === files.length} onClick={onUpload}>{uploading ? `Enviando página ${uploadedCount + 1} de ${files.length}…` : uploadedCount === files.length ? 'Páginas enviadas' : 'Enviar páginas com segurança'}</button>}
  </section>;
}

function formatSize(size: number) { return `${(size / (1024 * 1024)).toFixed(size > 1024 * 1024 ? 1 : 2)} MB`; }
