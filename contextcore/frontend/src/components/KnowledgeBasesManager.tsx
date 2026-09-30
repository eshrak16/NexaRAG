import { useMemo, useState, type FormEvent } from 'react';
import { Boxes, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import type { KnowledgeBase, Organization } from '../api/types';
import { can } from '../auth/permissions';

type Props = {
  items: KnowledgeBase[];
  organizations: Organization[];
  loading: boolean;
  error: string;
  search: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onUpdated: () => void;
};

export function KnowledgeBasesManager({ items, organizations, loading, error, search, selectedId, onSelect, onUpdated }: Props) {
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [mutationError, setMutationError] = useState('');
  const availableOrganizations = organizations.filter((organization) => can(organization.role, 'knowledge_base:create'));
  const visible = useMemo(() => items.filter((kb) => `${kb.name} ${kb.description ?? ''}`.toLowerCase().includes(search.toLowerCase())), [items, search]);

  async function remove(kb: KnowledgeBase) {
    if (!window.confirm(`Delete “${kb.name}” and all documents stored in it? This cannot be undone.`)) return;
    setBusyId(kb.id); setMutationError('');
    try {
      await api.deleteKnowledgeBase(kb.id);
      if (selectedId === kb.id) onSelect('');
      onUpdated();
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : 'Knowledge base could not be deleted.');
    } finally { setBusyId(''); }
  }

  return <div className="kb-management">
    <div className="kb-management-toolbar">
      <span className="kb-management-count">{visible.length} of {items.length} knowledge bases</span>
      <button className="button button-primary" disabled={!availableOrganizations.length} onClick={() => { setMutationError(''); setCreating(true); }}><Plus size={15} /> Create knowledge base</button>
    </div>
    {!availableOrganizations.length && !loading && <p className="kb-management-hint">You need an existing organization where you can create a knowledge base.</p>}
    {(error || mutationError) && <div className="dashboard-error" role="alert">{mutationError || error}<button onClick={() => { setMutationError(''); onUpdated(); }}>Retry</button></div>}
    {loading ? <div className="panel loading-panel"><LoaderCircle className="spin" /> Loading knowledge bases…</div>
      : !visible.length ? <section className="panel empty-list"><Boxes size={22} /><h3>{items.length ? 'No matching knowledge bases' : 'No knowledge bases yet'}</h3><p>{items.length ? 'Try another search.' : 'Create a knowledge base in one of your accessible organizations.'}</p></section>
        : <div className="kb-grid">{visible.map((kb) => {
          const role = organizations.find((organization) => organization.id === kb.organizationId)?.role;
          const canEdit = can(role ?? 'VIEWER', 'knowledge_base:update');
          const canDelete = can(role ?? 'VIEWER', 'knowledge_base:delete');
          return <article className={`panel kb-card ${selectedId === kb.id ? 'kb-card-selected' : ''}`} key={kb.id}>
            <div className="kb-card-top"><div className="kb-card-icon"><Boxes size={18} /></div><span className="role-pill">KNOWLEDGE BASE</span></div>
            <h3>{kb.name}</h3><p>{kb.description || 'A private knowledge space for your team documents.'}</p>
            <div className="kb-card-meta"><span>{organizations.find((organization) => organization.id === kb.organizationId)?.name || 'Organization'}</span><span className="truncate-id">{kb.id.slice(0, 8)}</span></div>
            <div className="kb-card-actions"><button className="button button-secondary" onClick={() => onSelect(kb.id)}>{selectedId === kb.id ? 'Selected' : 'Use this KB'}</button>
              {canEdit && <button className="icon-button" aria-label={`Edit ${kb.name}`} title="Edit" onClick={() => { setMutationError(''); setEditing(kb); }}><Pencil size={14} /></button>}
              {canDelete && <button className="icon-button kb-delete-button" aria-label={`Delete ${kb.name}`} title="Delete" disabled={busyId === kb.id} onClick={() => void remove(kb)}>{busyId === kb.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}</button>}
            </div>
          </article>;
        })}</div>}
    {(creating || editing) && <KnowledgeBaseForm knowledgeBase={editing} organizations={availableOrganizations} onClose={() => { setCreating(false); setEditing(null); }} onSaved={(createdId) => { setCreating(false); setEditing(null); if (createdId) onSelect(createdId); onUpdated(); }} />}
  </div>;
}

function KnowledgeBaseForm({ knowledgeBase, organizations, onClose, onSaved }: { knowledgeBase: KnowledgeBase | null; organizations: Organization[]; onClose: () => void; onSaved: (createdId?: string) => void }) {
  const [organizationId, setOrganizationId] = useState(knowledgeBase?.organizationId ?? organizations[0]?.id ?? '');
  const [name, setName] = useState(knowledgeBase?.name ?? '');
  const [description, setDescription] = useState(knowledgeBase?.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const saved = knowledgeBase
        ? await api.updateKnowledgeBase(knowledgeBase.id, name.trim(), description.trim())
        : await api.createKnowledgeBase(organizationId, name.trim(), description.trim());
      onSaved(knowledgeBase ? undefined : saved.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Knowledge base could not be saved.');
    } finally { setLoading(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
    <section className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="kb-form-title">
      <div className="dialog-heading"><div><span className="eyebrow">KNOWLEDGE BASE MANAGEMENT</span><h2 id="kb-form-title">{knowledgeBase ? 'Edit knowledge base' : 'Create knowledge base'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close" disabled={loading}><X size={18} /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        {!knowledgeBase && <label className="field-label">Organization<select className="form-select" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}
        <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required /></label>
        <label className="field-label">Description<textarea className="form-select" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-foot"><span>Access and changes are checked by the existing API.</span><button className="button button-primary" disabled={loading || !name.trim() || (!knowledgeBase && !organizationId)}>{loading ? <><LoaderCircle className="spin" size={15} /> Saving…</> : knowledgeBase ? 'Save changes' : 'Create'}</button></div>
      </form>
    </section>
  </div>;
}
