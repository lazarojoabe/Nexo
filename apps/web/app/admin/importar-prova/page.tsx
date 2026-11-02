'use client';

import { useMemo, useState } from 'react';
import './page.css';
import { RequireAuth } from '../../../components/require-auth';
import { useAuth } from '../../../components/auth-provider';

type Preview = {
  id: string;
  metadata: { year: number; day: number; color: string; language?: string; version: string };
  sources: Array<{ role: string; originalName: string; mimeType: string; byteSize: number; sha256: string; pageCount?: number }>;
  draft: unknown;
  exceptions: Array<{ id: string; severity: 'blocking' | 'review'; message: string; questionNumber?: number; sourcePage?: number }>;
  report: { counts?: { questions: number; answerKeyEntries: number; assets: number; exceptions: number }; validation?: { schemaValid: boolean; blockingExceptions: number; reviewExceptions: number } };
  diff: { examExists: boolean; changedQuestions: number; publishedChanges: boolean; entries: Array<{ number: number; status: string; fields: string[]; published: boolean }> };
  readyToApprove: boolean;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AdminExamImportPage() {
  return <RequireAuth><AdminExamImport /></RequireAuth>;
}

function AdminExamImport() {
  const { session } = useAuth();
  const [adminKey, setAdminKey] = useState('');
  const [exam, setExam] = useState<File>();
  const [answerKey, setAnswerKey] = useState<File>();
  const [metadata, setMetadata] = useState({ year: String(new Date().getFullYear()), day: '1', color: 'azul', language: '', version: 'caderno-1' });
  const [preview, setPreview] = useState<Preview>();
  const [draftText, setDraftText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [confirmPublishedChanges, setConfirmPublishedChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const blocking = useMemo(() => preview?.exceptions.filter((item) => item.severity === 'blocking') ?? [], [preview]);

  async function createPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exam || !answerKey) return setMessage('Selecione a prova e o gabarito oficiais.');
    setBusy(true); setMessage(''); setPreview(undefined);
    const form = new FormData();
    form.append('exam', exam); form.append('answerKey', answerKey);
    form.append('year', metadata.year); form.append('day', metadata.day); form.append('color', metadata.color); form.append('version', metadata.version);
    if (metadata.language.trim()) form.append('language', metadata.language.trim());
    try {
      if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para continuar.');
      const response = await fetch(`${apiUrl}/admin/exam-imports/preview`, { method: 'POST', headers: { 'x-admin-import-key': adminKey, authorization: `Bearer ${session.access_token}` }, body: form });
      const payload = await json(response);
      if (!response.ok) throw new Error(errorMessage(payload));
      const result = payload as Preview;
      setPreview(result); setDraftText(JSON.stringify(result.draft, null, 2));
      setReviewed(false); setConfirmPublishedChanges(false);
      setMessage(result.readyToApprove ? 'Prévia válida. Confira os dados antes de aprovar.' : 'A prévia possui exceções. Corrija o JSON apenas conferindo os arquivos oficiais.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar a prévia.'); } finally { setBusy(false); }
  }

  async function approve() {
    if (!preview) return;
    let reviewedPayload: unknown;
    try { reviewedPayload = JSON.parse(draftText); } catch { setMessage('O JSON revisado não é válido.'); return; }
    setBusy(true); setMessage('');
    try {
      if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para continuar.');
      const response = await fetch(`${apiUrl}/admin/exam-imports/${preview.id}/approve`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-import-key': adminKey, authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ approved: true, confirmPublishedChanges, reviewedPayload, resolvedExceptionCodes: reviewed ? blocking.map((item) => item.id) : [] }),
      });
      const payload = await json(response);
      if (!response.ok) throw new Error(errorMessage(payload));
      setMessage(`Importação concluída. Lote de auditoria: ${String((payload as { importBatchId?: string }).importBatchId ?? 'registrado')}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível persistir a importação.'); } finally { setBusy(false); }
  }

  return <main className="admin-import"><header><a href="/">← Nexo ENEM</a><p>Administração</p><h1>Importar prova + gabarito</h1><span>Arquivos locais oficiais; nada é baixado automaticamente.</span></header>
    <form className="import-form" onSubmit={createPreview}>
      <label>Chave administrativa<input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} autoComplete="off" required /></label>
      <div className="meta-grid"><label>Ano<input inputMode="numeric" value={metadata.year} onChange={(event) => setMetadata({ ...metadata, year: event.target.value })} required /></label><label>Dia<input inputMode="numeric" value={metadata.day} onChange={(event) => setMetadata({ ...metadata, day: event.target.value })} required /></label><label>Cor<input value={metadata.color} onChange={(event) => setMetadata({ ...metadata, color: event.target.value })} required /></label><label>Idioma (opcional)<input placeholder="en, es, pt" value={metadata.language} onChange={(event) => setMetadata({ ...metadata, language: event.target.value })} /></label><label>Versão<input value={metadata.version} onChange={(event) => setMetadata({ ...metadata, version: event.target.value })} required /></label></div>
      <div className="files"><label>PDF oficial da prova<input type="file" accept="application/pdf,.pdf" onChange={(event) => setExam(event.target.files?.[0])} required /></label><label>Gabarito oficial (PDF ou imagem)<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setAnswerKey(event.target.files?.[0])} required /></label></div>
      <button type="submit" disabled={busy}>{busy ? 'Processando localmente…' : 'Gerar prévia obrigatória'}</button>
    </form>
    {message && <p className="status" role="status">{message}</p>}
    {preview && <section className="preview"><h2>Prévia #{preview.id.slice(0, 8)}</h2><div className="summary"><span>{preview.report.counts?.questions ?? 0} questões</span><span>{preview.report.counts?.answerKeyEntries ?? 0} entradas de gabarito</span><span>{preview.report.counts?.assets ?? 0} ativos visuais</span></div>
      <h3>Arquivos auditáveis</h3><ul>{preview.sources.map((source) => <li key={source.role}><b>{source.role === 'exam' ? 'Prova' : 'Gabarito'}:</b> {source.originalName} · {source.mimeType} · {source.byteSize.toLocaleString('pt-BR')} bytes · SHA-256 <code>{source.sha256}</code>{source.pageCount ? ` · ${source.pageCount} pág.` : ''}</li>)}</ul>
      <h3>Exceções ({preview.exceptions.length})</h3>{preview.exceptions.length ? <ul className="exceptions">{preview.exceptions.map((item) => <li className={item.severity} key={item.id}><b>{item.severity === 'blocking' ? 'Bloqueia' : 'Revisar'}:</b> {item.message}{item.sourcePage ? ` (página ${item.sourcePage})` : ''}</li>)}</ul> : <p className="ok">Sem exceções estruturais.</p>}
      <h3>Diff da prova existente</h3><p>{preview.diff.examExists ? `${preview.diff.changedQuestions} questão(ões) alterada(s).` : 'Ainda não existe uma prova com esta chave de idempotência.'}</p>{preview.diff.entries.filter((entry) => entry.status === 'changed').length > 0 && <ul>{preview.diff.entries.filter((entry) => entry.status === 'changed').map((entry) => <li key={entry.number}>Questão {entry.number}: {entry.fields.join(', ')}{entry.published ? ' · já publicada' : ''}</li>)}</ul>}
      <label className="draft-label">JSON revisável (confira com os PDFs; o sistema preserva origem, hashes e ativos vinculados)<textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} /></label>
      {blocking.length > 0 && <label className="check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> Revisei e corrigi cada exceção bloqueante diretamente contra os arquivos oficiais.</label>}
      {preview.diff.publishedChanges && <label className="check warning"><input type="checkbox" checked={confirmPublishedChanges} onChange={(event) => setConfirmPublishedChanges(event.target.checked)} /> Confirmo as alterações nas questões já publicadas listadas no diff.</label>}
      <button className="approve" type="button" disabled={busy || !reviewed && blocking.length > 0 || preview.diff.publishedChanges && !confirmPublishedChanges} onClick={() => void approve()}>Aprovar e persistir no banco</button>
    </section>}
  </main>;
}

async function json(response: Response) { try { return await response.json() as unknown; } catch { return null; } }
function errorMessage(value: unknown) { if (value && typeof value === 'object' && 'message' in value) return typeof value.message === 'string' ? value.message : JSON.stringify(value.message); return 'A API recusou a operação.'; }
