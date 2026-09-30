import { ArrowRight, Database, FileUp, MessageSquareText, Search, Scissors, Sparkles } from 'lucide-react';

const ingestionStages = [
  { label: 'Upload', detail: 'PDF · DOCX · TXT', icon: FileUp },
  { label: 'Extract', detail: 'Readable text', icon: Scissors },
  { label: 'Chunk', detail: 'Context windows', icon: Scissors },
  { label: 'Embed', detail: 'BGE · 384 dims', icon: Sparkles },
  { label: 'Store', detail: 'PostgreSQL + vector', icon: Database },
  { label: 'Queue', detail: 'Ready to retrieve', icon: Database },
];
const ragStages = [
  { label: 'Document ingestion', detail: 'PDF · DOCX · TXT', icon: FileUp },
  { label: 'Vector embeddings', detail: 'BGE · 384 dims', icon: Sparkles },
  { label: 'Semantic search', detail: 'pgvector · cosine', icon: Search },
  { label: 'AI answers', detail: 'Source citations', icon: MessageSquareText },
];

export function Pipeline({ compact = false, rag = false }: { compact?: boolean; rag?: boolean }) {
  const stages = rag ? ragStages : ingestionStages;
  return <section className={`panel pipeline-panel ${compact ? 'pipeline-compact' : ''}`}>
    <div className="panel-heading pipeline-heading">
      <div><div className="eyebrow">{rag ? 'RETRIEVAL AUGMENTED GENERATION' : 'UNDER THE HOOD'}</div><h2>{rag ? 'From documents to grounded answers' : 'Ingestion pipeline'}</h2></div>
      <span className="pipeline-live">{rag ? 'RAG FLOW' : 'PROCESS FLOW'}</span>
    </div>
    <div className="pipeline-track">
      {stages.map(({ label, detail, icon: Icon }, index) => <div className="pipeline-step-wrap" key={label}>
        <div className="pipeline-step">
          <span className="step-icon"><Icon size={17} /></span>
          <span className="step-label">{label}</span>
          <span className="step-detail">{detail}</span>
        </div>
        {index < stages.length - 1 && <ArrowRight size={14} className="pipeline-arrow" />}
      </div>)}
    </div>
  </section>;
}
