import { Activity, Boxes, Building2, ChevronDown, FileText, Gauge, Layers3, MessageSquareText, Settings2, Users, X } from 'lucide-react';
import { can } from '../auth/permissions';
import type { Organization } from '../api/types';

export type Section = 'Dashboard' | 'Knowledge Bases' | 'Documents' | 'Ingestion Pipeline' | 'Search / Ask' | 'Organizations' | 'Admin Panel' | 'Users' | 'Activity Logs' | 'Settings';

const links: Array<{ label: Section; icon: typeof Gauge; connected: boolean }> = [
  { label: 'Dashboard', icon: Gauge, connected: true },
  { label: 'Knowledge Bases', icon: Boxes, connected: true },
  { label: 'Documents', icon: FileText, connected: true },
  { label: 'Ingestion Pipeline', icon: Layers3, connected: true },
  { label: 'Search / Ask', icon: MessageSquareText, connected: true },
  { label: 'Organizations', icon: Building2, connected: true },
  { label: 'Users', icon: Users, connected: false },
  { label: 'Activity Logs', icon: Activity, connected: false },
  { label: 'Settings', icon: Settings2, connected: false },
];

type Props = { active: Section; onSelect: (section: Section) => void; open: boolean; onClose: () => void; userName?: string; userEmail?: string; workspaceName?: string; connectionStatus: string; roles: Organization['role'][]; onLogout: () => void };

export function Sidebar({ active, onSelect, open, onClose, userName, userEmail, workspaceName, connectionStatus, roles, onLogout }: Props) {
  const hasDocumentAccess = roles.some((role) => can(role, 'document:upload'));
  const hasAdminAccess = roles.some((role) => can(role, 'member:read'));
  const visibleLinks = links.filter(({ label }) => label !== 'Users' && label !== 'Activity Logs' && label !== 'Settings' && (label !== 'Documents' && label !== 'Ingestion Pipeline' || hasDocumentAccess));
  return <>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Layers3 size={19} strokeWidth={2.2} /></div>
        <div className="brand-word">nexa<span>rag</span></div>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <button className="workspace-switcher">
        <span className="workspace-avatar">N</span>
        <span className="workspace-copy"><b>{workspaceName || 'Workspace'}</b><small>Workspace</small></span>
        <ChevronDown size={15} className="muted-icon" />
      </button>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {[...visibleLinks, ...(hasAdminAccess ? [{ label: 'Admin Panel' as Section, icon: Users, connected: true }] : [])].map(({ label, icon: Icon, connected }) => <button
          key={label}
          className={`nav-link ${active === label ? 'nav-link-active' : ''}`}
          onClick={() => { onSelect(label); onClose(); }}
        >
          <Icon size={17} strokeWidth={1.8} />
          <span>{label}</span>
          {!connected && <i className="nav-placeholder-dot" title="No backend endpoint" />}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-card">
          <div className="plan-topline"><span className={`plan-indicator ${connectionStatus !== 'Connected' ? 'plan-indicator-muted' : ''}`} /> API {connectionStatus}</div>
          <p>Dashboard data is scoped to your signed-in account.</p>
          <div className="plan-link">Session access</div>
        </div>
        <div className="profile-row">
          <div className="profile-avatar">{userName?.trim().charAt(0).toUpperCase() || 'N'}</div>
          <div className="profile-copy"><b>{userName || 'Signed in'}</b><small>{userEmail || 'Authenticated account'}{roles.length ? ` · ${[...new Set(roles)].join(', ')}` : ''}</small></div>
          <button className="icon-button profile-more" title="Sign out" aria-label="Sign out" onClick={onLogout}>↪</button>
        </div>
      </div>
    </aside>
  </>;
}
