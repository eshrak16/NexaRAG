import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Boxes, Check, CircleHelp, Database, Eye, EyeOff, FileText, Layers3, LoaderCircle, LockKeyhole, Plus, RefreshCw, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { api, ApiError, tokenStore } from './api/client';
import type { AuthResponse, Document, KnowledgeBase, Organization } from './api/types';
import { AskPanel } from './components/AskPanel';
import { AdminPanel } from './components/AdminPanel';
import { KnowledgeBasesManager } from './components/KnowledgeBasesManager';
import { DocumentsTable } from './components/DocumentsTable';
import { Pipeline } from './components/Pipeline';
import { Sidebar, type Section } from './components/Sidebar';
import { StatCard } from './components/StatCard';
import { Topbar } from './components/Topbar';
import { UploadDialog } from './components/UploadDialog';
import { can } from './auth/permissions';

type DashboardData = { knowledgeBases: KnowledgeBase[]; documents: Document[]; documentTotal: number; organizations: Organization[] };
const emptyData: DashboardData = { knowledgeBases: [], documents: [], documentTotal: 0, organizations: [] };

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try { await onLogin(email, password); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign in failed.'); }
    finally { setLoading(false); }
  }
  return <main className="login-screen">
    <div className="login-glow" />
    <div className="login-brand"><div className="brand-mark"><Layers3 size={19} /></div><div className="brand-word">nexa<span>rag</span></div></div>
    <section className="login-card">
      <div className="login-icon"><LockKeyhole size={20} /></div><div className="eyebrow">YOUR PRIVATE KNOWLEDGE SPACE</div><h1>Welcome back.</h1><p>Sign in to explore your knowledge workspace.</p>
      <form onSubmit={submit}>
        <label className="field-label">Email address<input autoComplete="username" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required /></label>
        <label className="field-label">Password<span className="password-input-wrap"><input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" minLength={8} maxLength={128} required /><button type="button" className="icon-button password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary login-submit" disabled={loading}>{loading ? <><LoaderCircle size={16} className="spin" /> Signing in…</> : <>Sign in <ArrowUpRight size={15} /></>}</button>
      </form><div className="login-foot"><ShieldCheck size={14} /> Securely authenticated by your NexaRAG API</div>
    </section>
    <div className="login-copyright">NEXARAG KNOWLEDGE PLATFORM <span>·</span> PRIVATE BY DESIGN</div>
  </main>;
}

function pageTitle(section: Section): { eyebrow: string; title: string; description: string } {
  switch (section) {
    case 'Knowledge Bases': return { eyebrow: 'YOUR CONTENT, ORGANIZED', title: 'Knowledge bases', description: 'Browse the spaces you can access across your organizations.' };
    case 'Documents': return { eyebrow: 'YOUR LIBRARY', title: 'Documents', description: 'Manage source material ingested into your knowledge bases.' };
    case 'Organizations': return { eyebrow: 'TEAM SPACES', title: 'Organizations', description: 'Organizations available to your signed-in account.' };
    case 'Admin Panel': return { eyebrow: 'ORGANIZATION CONTROL', title: 'Admin panel', description: 'Manage access and review organization administration activity.' };
    case 'Ingestion Pipeline': return { eyebrow: 'PROCESSING OVERVIEW', title: 'Ingestion pipeline', description: 'See how files move from upload into searchable knowledge.' };
    case 'Search / Ask': return { eyebrow: 'GROUNDED ANSWERS', title: 'Search & ask', description: 'Ask questions and trace answers back to source documents.' };
    default: return { eyebrow: 'NEXARAG WORKSPACE', title: section, description: 'This view is not connected to a backend endpoint yet.' };
  }
}

function PagePlaceholder({ section }: { section: Section }) {
  const { title, description } = pageTitle(section);
  return <section className="panel placeholder-panel"><span className="placeholder-icon"><CircleHelp size={22} /></span><div className="eyebrow">NOT CONNECTED</div><h2>{title}</h2><p>{description} The current API does not expose this data, so this area is intentionally a placeholder.</p><span className="placeholder-tag">No data is fabricated</span></section>;
}

function OrganizationList({ items }: { items: Organization[] }) {
  if (!items.length) return <section className="panel empty-list"><Boxes size={22} /><h3>No organizations found</h3><p>Your account is not a member of an organization yet.</p></section>;
  return <div className="organization-list">{items.map((org) => <article className="panel organization-card" key={org.id}><div className="org-mark">{org.name.slice(0, 1).toUpperCase()}</div><div className="org-info"><h3>{org.name}</h3><p>{org.slug}</p></div><span className="role-pill">{org.role}</span>{org.role === 'MEMBER' || org.role === 'VIEWER' ? <RequestAdminButton organization={org} /> : <ArrowUpRight size={16} className="muted-icon" />}</article>)}</div>;
}

function RequestAdminButton({ organization }: { organization: Organization }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <div><button className="button button-secondary" disabled={busy || Boolean(message)} onClick={() => { setBusy(true); setMessage(''); void api.requestAdmin(organization.id).then(() => setMessage('Request pending')).catch((error) => setMessage(error instanceof Error ? error.message : 'Request failed')).finally(() => setBusy(false)); }}>{busy ? 'Submitting…' : message || 'Request Admin access'}</button></div>;
}

export default function App() {
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUser] = useState<AuthResponse['user'] | null>(null);
  const [checking, setChecking] = useState(Boolean(token || tokenStore.getRefresh()));
  const [section, setSection] = useState<Section>('Dashboard');
  const [pathname, setPathname] = useState(window.location.pathname);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);
  const [compact, setCompact] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const logout = useCallback(() => {
    const revoke = api.logout(tokenStore.getRefresh());
    tokenStore.clear(); setToken(null); setUser(null); setData(emptyData); setDataReady(false); setSelectedKnowledgeBaseId(''); setSection('Dashboard');
    setDataError(''); setSearch(''); setRefreshIndex(0);
    void revoke;
    if (window.location.pathname !== '/login') window.history.replaceState({}, '', '/login');
    setPathname('/login');
  }, []);

  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener('nexarag:logout', onLogout);
    return () => window.removeEventListener('nexarag:logout', onLogout);
  }, [logout]);

  useEffect(() => {
    if (!token && !tokenStore.getRefresh()) { setChecking(false); return; }
    let alive = true;
    api.restoreSession().then(async (result) => {
      let organizations: Organization[] = [];
      try { organizations = await api.organizations(); }
      catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) throw reason;
        if (alive) setDataError(reason instanceof Error ? reason.message : 'Organizations could not be loaded.');
      }
      if (alive) { setToken(tokenStore.get()); setUser(result.user); setData((current) => ({ ...current, organizations })); }
    }).catch(() => { if (alive) logout(); }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [token, logout]);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function setSectionAndRoute(next: Section) {
    const route: Record<Section, string> = { Dashboard: '/dashboard', 'Knowledge Bases': '/knowledge-bases', Documents: '/documents', 'Search / Ask': '/search', Settings: '/settings', 'Admin Panel': '/admin', 'Ingestion Pipeline': '/dashboard', Organizations: '/organizations', Users: '/admin', 'Activity Logs': '/admin' };
    setSection(next);
    const nextPath = route[next];
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setPathname(nextPath);
  }

  useEffect(() => {
    const route: Record<string, Section> = { '/': 'Dashboard', '/dashboard': 'Dashboard', '/knowledge-bases': 'Knowledge Bases', '/documents': 'Documents', '/search': 'Search / Ask', '/settings': 'Settings', '/admin': 'Admin Panel', '/organizations': 'Organizations' };
    if (pathname === '/login' && token && user) { window.history.replaceState({}, '', '/dashboard'); setPathname('/dashboard'); return; }
    const next = route[pathname];
    if (next) setSection(next);
  }, [pathname, token, user]);

  useEffect(() => {
    if (!checking && (!token || !user) && pathname !== '/login') {
      window.history.replaceState({}, '', '/login');
      setPathname('/login');
    }
  }, [checking, token, user, pathname]);

  useEffect(() => {
    if (pathname !== '/admin' || !dataReady) return;
    if (!data.organizations.some((organization) => can(organization.role, 'member:read'))) {
      window.history.replaceState({}, '', '/dashboard'); setPathname('/dashboard'); setSection('Dashboard');
    }
  }, [pathname, dataReady, data.organizations]);

  const loadDashboard = useCallback(async () => {
    setDataLoading(true); setDataError('');
    try {
      const [firstPage, organizations] = await Promise.all([api.knowledgeBases(1, 100), api.organizations()]);
      const bases = [...firstPage.data];
      for (let page = 2; page <= firstPage.pagination.totalPages; page += 6) {
        const pages = Array.from({ length: Math.min(6, firstPage.pagination.totalPages - page + 1) }, (_, offset) => page + offset);
        const results = await Promise.all(pages.map((pageNumber) => api.knowledgeBases(pageNumber, 100)));
        results.forEach((result) => bases.push(...result.data));
      }
      const docs: Document[] = [];
      let documentTotal = 0;
      for (let index = 0; index < bases.length; index += 6) {
        const group = bases.slice(index, index + 6);
        const results = await Promise.all(group.map(async (kb) => {
          const first = await api.documents(kb.id, 100);
          return { documents: first.data, total: first.pagination.total };
        }));
        for (const result of results) { docs.push(...result.documents); documentTotal += result.total; }
      }
      docs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      setData({ knowledgeBases: bases, documents: docs.slice(0, 80), documentTotal, organizations });
      setDataReady(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { logout(); return; }
      setDataError(reason instanceof Error ? reason.message : 'Dashboard data could not be loaded.');
    } finally { setDataLoading(false); }
  }, [logout]);

  useEffect(() => { if (token && user) void loadDashboard(); }, [token, user, loadDashboard, refreshIndex]);

  useEffect(() => {
    if (!dataReady) return;
    setSelectedKnowledgeBaseId((current) => data.knowledgeBases.some((kb) => kb.id === current) ? current : data.knowledgeBases[0]?.id ?? '');
  }, [data.knowledgeBases, dataReady]);

  const knowledgeBaseDocuments = useMemo(() => data.documents.filter((doc) => doc.knowledgeBaseId === selectedKnowledgeBaseId), [data.documents, selectedKnowledgeBaseId]);
  const writableKnowledgeBases = useMemo(() => data.knowledgeBases.filter((kb) => can(data.organizations.find((org) => org.id === kb.organizationId)?.role, 'document:upload')), [data.knowledgeBases, data.organizations]);
  const canUploadSelected = writableKnowledgeBases.some((kb) => kb.id === selectedKnowledgeBaseId);
  const filteredDocuments = useMemo(() => knowledgeBaseDocuments.filter((doc) => `${doc.name} ${doc.originalFileName}`.toLowerCase().includes(search.toLowerCase())), [knowledgeBaseDocuments, search]);
  const page = pageTitle(section);
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();

  async function handleLogin(email: string, password: string) {
    const response = await api.login(email, password);
    try {
      const organizations = await api.organizations();
      setData({ ...emptyData, organizations });
      setUser(response.user);
      setToken(response.accessToken);
    } catch (error) {
      const revoke = api.logout(response.refreshToken);
      tokenStore.clear();
      await revoke;
      throw error;
    }
  }

  if (checking) return <main className="boot-screen"><div className="brand-mark"><Layers3 size={18} /></div><LoaderCircle className="spin" size={18} /></main>;
  if (!token || !user) return <LoginScreen onLogin={handleLogin} />;

  return <div className={`app-shell ${lightTheme ? 'theme-light' : ''} ${compact ? 'compact-layout' : ''}`}>
    <Sidebar active={section} onSelect={setSectionAndRoute} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} userName={user.name} userEmail={user.email} workspaceName={data.organizations[0]?.name} connectionStatus={dataError ? 'Unavailable' : dataLoading || !dataReady ? 'Connecting' : 'Connected'} roles={data.organizations.map((organization) => organization.role)} onLogout={logout} />
    <div className="main-column">
      <Topbar active={section} onSearch={setSearch} query={search} onMenu={() => setMobileNavOpen(true)} light={lightTheme} onTheme={() => setLightTheme((value) => !value)} compact={compact} onCompact={() => setCompact((value) => !value)} onNotice={setNotice} userName={user.name} />
      <main className="main-content">
        {section === 'Dashboard' ? <>
          <div className="dashboard-intro"><div><div className="eyebrow intro-eyebrow">{todayLabel} <span>·</span> WORKSPACE OVERVIEW</div><h1>Your Knowledge,<br className="mobile-break" /> <span>Powered by AI.</span></h1><p>Bring your documents together. Get trusted answers from everything your team knows.</p></div><div className="intro-actions"><button className="button button-secondary" onClick={() => setSectionAndRoute('Search / Ask')}><Sparkles size={15} /> Ask a question</button><button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload document</button></div></div>
          {dataError && <div className="dashboard-error"><span>{dataError}</span><button onClick={() => setRefreshIndex((value) => value + 1)}><RefreshCw size={14} /> Retry</button></div>}
          <div className="stats-grid">
            <StatCard title="Knowledge bases" value={dataLoading ? '—' : data.knowledgeBases.length} note="Accessible to your account" icon={Boxes} loading={dataLoading} accent />
            <StatCard title="Documents" value={dataLoading ? '—' : data.documentTotal.toLocaleString()} note="Across accessible bases" icon={FileText} loading={dataLoading} />
            <StatCard title="Chunks indexed" value="—" note="Not exposed by current API" icon={Layers3} />
            <StatCard title="Processing jobs" value="—" note="No job summary endpoint" icon={Workflow} />
          </div>
          <div className="dashboard-grid"><div className="dashboard-left">
            <DocumentsTable documents={filteredDocuments} knowledgeBases={data.knowledgeBases} loading={dataLoading || !dataReady} error={dataError} search={search} onRetry={() => setRefreshIndex((value) => value + 1)} onUpload={canUploadSelected ? () => setUploadOpen(true) : undefined} />
            {data.organizations.some((organization) => organization.role !== 'VIEWER') && <Pipeline compact rag />}
          </div><div className="dashboard-right"><AskPanel knowledgeBases={data.knowledgeBases} selectedKnowledgeBaseId={selectedKnowledgeBaseId} onKnowledgeBaseChange={setSelectedKnowledgeBaseId} loadingKnowledgeBases={dataLoading || !dataReady} knowledgeBaseError={dataError} onNotice={setNotice} /><div className="trust-note"><div className="trust-icon"><ShieldCheck size={15} /></div><div><b>Your data stays yours</b><p>Search runs within your authorized knowledge base. Answers include source citations.</p></div><Check size={14} className="trust-check" /></div></div></div>
        </> : <>
          <div className="page-intro"><div className="eyebrow">{page.eyebrow}</div><div className="page-title-row"><div><h1>{page.title}</h1><p>{page.description}</p></div>{section === 'Documents' && canUploadSelected && <button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload document</button>}</div></div>
          {section === 'Knowledge Bases' && <KnowledgeBasesManager items={data.knowledgeBases} organizations={data.organizations} loading={dataLoading || !dataReady} error={dataError} search={search} selectedId={selectedKnowledgeBaseId} onSelect={setSelectedKnowledgeBaseId} onUpdated={() => setRefreshIndex((value) => value + 1)} />}
          {section === 'Admin Panel' && (!dataReady ? <div className="panel loading-panel"><LoaderCircle className="spin" /> Checking organization permissions…</div> : data.organizations.some((organization) => can(organization.role, 'member:read')) ? <AdminPanel organizations={data.organizations.filter((organization) => can(organization.role, 'member:read'))} onChanged={() => setRefreshIndex((value) => value + 1)} /> : <div className="panel empty-list"><ShieldCheck size={22} /><h3>Organization administrator access required</h3><p>Your role does not grant access to the Admin Panel.</p></div>)}
          {section === 'Documents' && <DocumentsTable documents={filteredDocuments} knowledgeBases={data.knowledgeBases} loading={dataLoading || !dataReady} error={dataError} search={search} onRetry={() => setRefreshIndex((value) => value + 1)} onUpload={canUploadSelected ? () => setUploadOpen(true) : undefined} standalone />}
          {section === 'Organizations' && (dataError ? <div className="dashboard-error">{dataError}</div> : dataLoading ? <div className="panel loading-panel"><LoaderCircle className="spin" /> Loading organizations…</div> : <OrganizationList items={data.organizations} />)}
          {section === 'Ingestion Pipeline' && <><Pipeline /><div className="panel pipeline-details"><div className="detail-icon"><Database size={17} /></div><div><b>Local BGE embeddings</b><p>New uploads are extracted, chunked, embedded with BAAI/bge-small-en-v1.5, and stored in PostgreSQL with 384 dimensions.</p></div><span className="status-badge status-ready"><i />configured</span></div></>}
          {section === 'Search / Ask' && <div className="ask-page-layout"><div className="ask-explainer panel"><div className="assistant-orb"><Sparkles size={18} /></div><div><div className="eyebrow">RETRIEVAL AUGMENTED GENERATION</div><h2>Grounded in your documents.</h2><p>Choose a knowledge base, ask in natural language, and inspect the sources behind each answer.</p></div><div className="ask-spec"><span>RETRIEVAL <b>Semantic · cosine</b></span><span>EMBEDDINGS <b>BGE · 384 dimensions</b></span><span>CITATIONS <b>Linked to source chunks</b></span></div></div><AskPanel knowledgeBases={data.knowledgeBases} selectedKnowledgeBaseId={selectedKnowledgeBaseId} onKnowledgeBaseChange={setSelectedKnowledgeBaseId} loadingKnowledgeBases={dataLoading || !dataReady} knowledgeBaseError={dataError} large onNotice={setNotice} /></div>}
          {!['Knowledge Bases', 'Documents', 'Organizations', 'Ingestion Pipeline', 'Search / Ask'].includes(section) && <PagePlaceholder section={section} />}
        </>}
        <footer className="main-footer"><span>© {new Date().getFullYear()} NexaRAG</span><span><i className={dataError || !dataReady ? 'footer-disconnected' : ''} /> {dataError ? 'API unavailable' : dataLoading || !dataReady ? 'Connecting to API' : 'API connected'}</span><button onClick={() => setNotice('Help documentation is not connected yet.')}>Help & support <ArrowUpRight size={12} /></button></footer>
      </main>
    </div>
    {uploadOpen && <UploadDialog knowledgeBases={writableKnowledgeBases} selectedKnowledgeBaseId={selectedKnowledgeBaseId} onClose={() => setUploadOpen(false)} onUploaded={() => setRefreshIndex((value) => value + 1)} />}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>×</button></div>}
  </div>;
}
