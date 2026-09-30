import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';

type Props = { title: string; value: string | number; note: string; icon: LucideIcon; accent?: boolean; loading?: boolean };

export function StatCard({ title, value, note, icon: Icon, accent = false, loading = false }: Props) {
  return <article className={`stat-card ${accent ? 'stat-card-accent' : ''}`}>
    <div className="stat-top"><span>{title}</span><span className="stat-icon"><Icon size={17} /></span></div>
    <div className={`stat-value ${loading ? 'skeleton-text' : ''}`}>{loading ? ' ' : value}</div>
    <div className="stat-note"><span>{note}</span><ArrowUpRight size={13} /></div>
  </article>;
}
