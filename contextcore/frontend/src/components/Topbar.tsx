import { Bell, Bookmark, Command, LayoutDashboard, Menu, Moon, Search, Sun } from 'lucide-react';
import type { Section } from './Sidebar';

type Props = { active: Section; onSearch: (value: string) => void; query: string; onMenu: () => void; light: boolean; onTheme: () => void; compact: boolean; onCompact: () => void; onNotice: (title: string) => void; userName: string };

export function Topbar({ active, onSearch, query, onMenu, light, onTheme, compact, onCompact, onNotice, userName }: Props) {
  return <header className="topbar">
    <div className="topbar-left">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenu}><Menu size={19} /></button>
      <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{active}</strong></div>
    </div>
    <div className="topbar-tools">
      <label className="global-search"><Search size={15} /><input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search documents..." /><kbd><Command size={10} /> K</kbd></label>
      <span className="topbar-divider" />
      <button className="icon-button toolbar-icon" aria-label="Toggle theme" title="Toggle theme" onClick={onTheme}>{light ? <Moon size={17} /> : <Sun size={17} />}</button>
      <button className="icon-button toolbar-icon" aria-label="Bookmarks" title="Bookmarks are not connected to an API" onClick={() => onNotice('Bookmarks are not available in the current API.')}><Bookmark size={17} /></button>
      <button className="icon-button toolbar-icon notification-button" aria-label="Notifications" title="Notifications are not connected to an API" onClick={() => onNotice('Activity and notification endpoints are not available yet.')}><Bell size={17} /></button>
      <button className={`icon-button toolbar-icon ${compact ? 'control-active' : ''}`} aria-label="Toggle compact layout" title="Toggle compact layout" onClick={onCompact}><LayoutDashboard size={17} /></button>
      <div className="header-avatar" title={userName}>{userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
    </div>
  </header>;
}
