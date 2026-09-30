import { useState, type FormEvent } from 'react';
import { CheckCircle2, FileUp, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { api } from '../api/client';
import type { KnowledgeBase, UploadResult } from '../api/types';

export function UploadDialog({ knowledgeBases, selectedKnowledgeBaseId, onClose, onUploaded }: { knowledgeBases: KnowledgeBase[]; selectedKnowledgeBaseId: string; onClose: () => void; onUploaded: () => void }) {
  const [knowledgeBaseId, setKnowledgeBaseId] = useState(selectedKnowledgeBaseId || knowledgeBases[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !knowledgeBaseId) return;
    setLoading(true); setError('');
    try { setResult(await api.upload(knowledgeBaseId, file)); onUploaded(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed.'); }
    finally { setLoading(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <div className="dialog-heading"><div><span className="eyebrow">ADD TO YOUR LIBRARY</span><h2 id="upload-title">Upload a document</h2></div><button className="icon-button" onClick={onClose} aria-label="Close upload"><X size={18} /></button></div>
      {result ? <div className="upload-success"><CheckCircle2 size={31} /><h3>{result.status === 'READY' ? 'Document is ready' : 'Document processing failed'}</h3><p>{result.status === 'READY' ? 'Your file has been added, chunked, and embedded.' : result.processingError || 'The document could not be processed.'}</p><span className={`status-badge status-${result.status.toLowerCase()}`}><i />{result.status.toLowerCase()}</span><button className="button button-primary dialog-done" onClick={onClose}>Done</button></div> : <form onSubmit={submit}>
        <label className="field-label">Knowledge base<select className="form-select" value={knowledgeBaseId} onChange={(e) => setKnowledgeBaseId(e.target.value)} required><option value="" disabled>Select a knowledge base</option>{knowledgeBases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}</select></label>
        <label className={`drop-zone ${file ? 'drop-zone-selected' : ''}`}><input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); }} />{file ? <><span className="drop-icon"><FileUp size={20} /></span><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB · ready to upload</small></> : <><span className="drop-icon"><UploadCloud size={21} /></span><b>Choose a file or drop it here</b><small>PDF, DOCX, or TXT · Max size is configured by your server</small></>}</label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-foot"><span>Files are stored privately and processed with local embeddings.</span><button className="button button-primary" disabled={!file || !knowledgeBaseId || loading}>{loading ? <><LoaderCircle className="spin" size={15} /> Processing…</> : 'Upload document'}</button></div>
      </form>}
    </section>
  </div>;
}
