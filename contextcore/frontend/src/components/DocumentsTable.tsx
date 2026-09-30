import { ArrowUpRight, FileText, MoreHorizontal } from 'lucide-react';
import type { Document, KnowledgeBase } from '../api/types';

type Props = { documents: Document[]; knowledgeBases: KnowledgeBase[]; loading: boolean; error?: string; search?: string; onRetry?: () => void; onUpload?: () => void; standalone?: boolean };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export function DocumentsTable({ documents, knowledgeBases, loading, error, search = '', onRetry, onUpload, standalone = false }: Props) {
  const kbNames = new Map(knowledgeBases.map((kb) => [kb.id, kb.name]));
  const visible = documents.filter((doc) => `${doc.name} ${doc.originalFileName}`.toLowerCase().includes(search.toLowerCase()));
  return <section className={`panel documents-panel ${standalone ? 'documents-standalone' : ''}`}>
    <div className="panel-heading">
      <div><div className="eyebrow">YOUR LIBRARY</div><h2>Recent documents</h2></div>
      <div className="panel-heading-actions">
        {onUpload && <button className="text-action" onClick={onUpload}>Upload document <ArrowUpRight size={14} /></button>}
        <button className="icon-button subtle-icon" aria-label="More document options" onClick={() => onRetry?.()}><MoreHorizontal size={18} /></button>
      </div>
    </div>
    {error ? <div className="inline-state error-state"><span>{error}</span>{onRetry && <button onClick={onRetry}>Retry</button>}</div>
      : loading ? <div className="table-skeleton"><i /><i /><i /><i /></div>
      : visible.length === 0 ? <div className="empty-state"><div className="empty-icon"><FileText size={19} /></div><b>{search ? 'No matching documents' : 'No documents yet'}</b><p>{search ? 'Try another filename or clear the search.' : 'Upload a PDF, DOCX, or TXT file to start building your knowledge base.'}</p>{!search && onUpload && <button className="button button-secondary" onClick={onUpload}>Upload a document</button>}</div>
      : <div className="table-scroll"><table className="documents-table"><thead><tr><th>FILE NAME</th><th>KNOWLEDGE BASE</th><th>STATUS</th><th>CHUNKS</th><th>UPLOADED</th><th /></tr></thead><tbody>
        {visible.slice(0, 10).map((doc) => <tr key={doc.id}>
          <td><div className="file-cell"><span className={`file-type file-type-${doc.mimeType.includes('pdf') ? 'pdf' : doc.mimeType.includes('word') ? 'docx' : 'txt'}`}><FileText size={15} /></span><span className="file-name"><b>{doc.name}</b><small>{(doc.fileSize / 1024 / 1024).toFixed(doc.fileSize < 1024 * 1024 ? 2 : 1)} MB</small></span></div></td>
          <td><span className="kb-pill">{kbNames.get(doc.knowledgeBaseId) || 'Knowledge base'}</span></td>
          <td><span className={`status-badge status-${doc.status.toLowerCase()}`}><i />{doc.status.toLowerCase()}</span></td>
          <td><span className="unavailable-value" title="Chunk counts are not returned by the document list endpoint">—</span></td>
          <td className="date-cell">{formatDate(doc.createdAt)}</td>
          <td><button className="icon-button row-more" aria-label={`Options for ${doc.name}`}><MoreHorizontal size={16} /></button></td>
        </tr>)}
      </tbody></table></div>}
    {!loading && !error && visible.length > 0 && <div className="table-footer"><span>Showing {Math.min(visible.length, 10)} of {visible.length} recent results</span><span className="footer-note">Chunk counts unavailable in API</span></div>}
  </section>;
}
