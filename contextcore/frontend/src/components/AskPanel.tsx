import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Bot, Check, ChevronDown, ExternalLink, FileText, LoaderCircle, Plus, Sparkles, UserRound } from 'lucide-react';
import { api } from '../api/client';
import type { AskResponse, KnowledgeBase } from '../api/types';

type Message = { role: 'assistant' | 'user'; text: string; answer?: AskResponse };

export function AskPanel({ knowledgeBases, selectedKnowledgeBaseId, onKnowledgeBaseChange, loadingKnowledgeBases = false, knowledgeBaseError = '', large = false, onNotice }: { knowledgeBases: KnowledgeBase[]; selectedKnowledgeBaseId: string; onKnowledgeBaseChange: (id: string) => void; loadingKnowledgeBases?: boolean; knowledgeBaseError?: string; large?: boolean; onNotice?: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selectedIdRef = useRef(selectedKnowledgeBaseId);
  const requestIdRef = useRef(0);
  selectedIdRef.current = selectedKnowledgeBaseId;
  useEffect(() => {
    requestIdRef.current += 1;
    setMessages([]);
    setError('');
    setLoading(false);
  }, [selectedKnowledgeBaseId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = query.trim();
    if (!question || !selectedKnowledgeBaseId || loading) return;
    const requestedKnowledgeBaseId = selectedKnowledgeBaseId;
    const requestId = ++requestIdRef.current;
    setMessages((current) => [...current, { role: 'user', text: question }]);
    setQuery(''); setLoading(true); setError('');
    try {
      const answer = await api.ask(requestedKnowledgeBaseId, question, 5);
      if (requestId === requestIdRef.current && requestedKnowledgeBaseId === selectedIdRef.current && answer.knowledgeBaseId === requestedKnowledgeBaseId) {
        setMessages((current) => [...current, { role: 'assistant', text: answer.answer, answer }]);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The answer could not be generated.';
      if (requestId === requestIdRef.current && requestedKnowledgeBaseId === selectedIdRef.current) {
        setMessages((current) => [...current, { role: 'assistant', text: message }]);
        setError(message);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  return <section className={`panel ask-panel ${large ? 'ask-panel-large' : ''}`} id="ask-panel">
    <div className="panel-heading ask-heading">
      <div><div className="eyebrow">NEXARAG ASSISTANT</div><h2>Ask your knowledge</h2></div>
      <button className="icon-button subtle-icon" title="New conversation" aria-label="New conversation" onClick={() => { setMessages([]); setError(''); }}><Plus size={17} /></button>
    </div>
    <div className="ask-context-row">
      <span>SEARCHING IN</span>
      <label className="select-wrap"><select aria-label="Knowledge base to search" value={selectedKnowledgeBaseId} onChange={(e) => onKnowledgeBaseChange(e.target.value)} disabled={loadingKnowledgeBases || Boolean(knowledgeBaseError) || !knowledgeBases.length}><option value="">{loadingKnowledgeBases ? 'Loading knowledge bases…' : knowledgeBaseError ? 'Knowledge bases unavailable' : 'Select a knowledge base'}</option>{knowledgeBases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}</select><ChevronDown size={14} /></label>
    </div>
    <div className="chat-history" aria-live="polite">
      {knowledgeBaseError ? <div className="chat-error" role="status">{knowledgeBaseError}</div> : !loadingKnowledgeBases && knowledgeBases.length === 0 ? <div className="chat-error" role="status">Your account has no accessible knowledge bases.</div> : messages.length === 0 ? <div className="chat-welcome"><div className="assistant-orb"><Sparkles size={18} /></div><b>Answers grounded in your sources.</b><p>Ask a question and NexaRAG will search this knowledge base and return citations.</p><button className="suggestion-chip" onClick={() => setQuery('What topics are covered in these documents?')}>What topics are covered here? <ArrowUp size={12} /></button></div>
        : messages.map((message, index) => <div className={`chat-message chat-${message.role}`} key={`${index}-${message.role}`}>
          <div className="message-avatar">{message.role === 'assistant' ? <Bot size={15} /> : <UserRound size={15} />}</div>
          <div className="message-content"><p>{message.text}</p>{message.answer && <>
            {message.answer.citations.length > 0 && <div className="citation-list"><div className="citation-label">SOURCES <span>{message.answer.citations.length}</span></div>{message.answer.citations.map((citation) => <button className="citation-card" key={citation.chunkId} onClick={() => onNotice?.(`Source: ${citation.documentName}, chunk ${citation.chunkIndex + 1}`)}><span className="citation-file"><FileText size={14} /></span><span><b>{citation.documentName}</b><small>{citation.sourceRef} · Chunk {citation.chunkIndex + 1}</small></span><ExternalLink size={13} /></button>)}</div>}
            <div className="answer-meta"><Check size={12} /> Based on {message.answer.retrieval.retrievedChunks} retrieved {message.answer.retrieval.retrievedChunks === 1 ? 'chunk' : 'chunks'}</div>
          </>}</div>
        </div>)}
      {loading && <div className="chat-message chat-assistant"><div className="message-avatar"><Bot size={15} /></div><div className="typing-indicator"><LoaderCircle size={14} className="spin" /> Searching sources and drafting an answer…</div></div>}
      {error && <div className="chat-error" role="status">{error}</div>}
    </div>
    <form className="chat-composer" onSubmit={submit}>
      <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder={selectedKnowledgeBaseId ? 'Ask anything about your documents…' : 'Add a knowledge base first'} rows={1} disabled={!selectedKnowledgeBaseId || loadingKnowledgeBases || Boolean(knowledgeBaseError) || loading} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
      <div className="composer-bottom"><span><Sparkles size={12} /> Answers include source citations</span><button className="send-button" type="submit" disabled={!query.trim() || !selectedKnowledgeBaseId || loadingKnowledgeBases || Boolean(knowledgeBaseError) || loading} aria-label="Send question">{loading ? <LoaderCircle className="spin" size={16} /> : <ArrowUp size={17} />}</button></div>
    </form>
    <div className="chat-disclaimer">AI-generated responses can be inaccurate. Verify important details in the source documents.</div>
  </section>;
}
