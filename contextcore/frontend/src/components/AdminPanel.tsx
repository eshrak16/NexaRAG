import { useEffect, useState } from 'react';
import { Activity, LoaderCircle, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { api } from '../api/client';
import type { AdminRoleRequest, AuditEvent, Organization, OrganizationMember } from '../api/types';

type Props = { organizations: Organization[]; onChanged: () => void };

export function AdminPanel({ organizations, onChanged }: Props) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [requests, setRequests] = useState<AdminRoleRequest[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'VIEWER'>('MEMBER');
  const [organizationName, setOrganizationName] = useState('');
  const organization = organizations.find((item) => item.id === organizationId);
  const canManageMembers = organization?.role === 'OWNER' || organization?.role === 'ADMIN';
  const isOwner = organization?.role === 'OWNER';

  useEffect(() => { if (!organizations.some((item) => item.id === organizationId)) setOrganizationId(organizations[0]?.id ?? ''); }, [organizations, organizationId]);
  useEffect(() => { setOrganizationName(organization?.name ?? ''); }, [organization?.id, organization?.name]);
  useEffect(() => {
    if (!organizationId || !organization) return;
    let alive = true;
    setBusy(true); setError('');
    const loads: Promise<unknown>[] = [];
    if (canManageMembers) loads.push(api.organizationMembers(organizationId).then((value) => { if (alive) setMembers(value); }));
    if (isOwner) loads.push(api.adminRequests(organizationId).then((value) => { if (alive) setRequests(value); }));
    if (isOwner) loads.push(api.auditEvents(organizationId).then((value) => { if (alive) setEvents(value); }));
    Promise.all(loads).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : 'Admin data could not be loaded.'); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [organizationId, organization?.role, canManageMembers, isOwner]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The operation could not be completed.'); }
    finally { setBusy(false); }
  }

  if (!organizations.length) return <section className="panel empty-list"><ShieldCheck size={22} /><h3>No organization is available</h3><p>Admin tools are scoped to an organization membership.</p></section>;
  return <div className="admin-panel">
    <div className="admin-toolbar"><label className="field-label">Organization<select className="form-select" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label><span className="role-pill">{organization?.role}</span></div>
    {error && <div className="dashboard-error" role="alert">{error}</div>}
    {busy && <div className="panel loading-panel"><LoaderCircle className="spin" /> Loading or saving organization data…</div>}
    {canManageMembers && <section className="panel admin-section"><div className="admin-section-heading"><div><div className="eyebrow">ORGANIZATION ACCESS</div><h2><Users size={18} /> Members</h2></div></div>
      <form className="member-add-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await api.addOrganizationMember(organizationId, email, role); setEmail(''); setMembers(await api.organizationMembers(organizationId)); }); }}><input type="email" required placeholder="Existing user's email" value={email} onChange={(event) => setEmail(event.target.value)} /><select className="form-select" value={role} onChange={(event) => setRole(event.target.value as 'MEMBER' | 'VIEWER')}><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option></select><button className="button button-primary" disabled={busy}><UserPlus size={15} /> Add member</button></form>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th><th>Manage</th></tr></thead><tbody>{members.map((member) => <tr key={member.userId}><td><b>{member.name}</b><small>{member.email}</small></td><td><span className="role-pill">{member.role}</span></td><td>Active</td><td>{new Date(member.createdAt).toLocaleDateString()}</td><td>{member.role !== 'OWNER' && <div className="member-actions"><select aria-label={`Role for ${member.name}`} className="form-select" value={member.role === 'VIEWER' ? 'VIEWER' : 'MEMBER'} disabled={!isOwner && member.role === 'ADMIN'} onChange={(event) => void run(async () => { await api.setOrganizationMemberRole(organizationId, member.userId, event.target.value as 'MEMBER' | 'VIEWER'); setMembers(await api.organizationMembers(organizationId)); })}><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option></select><button className="button button-secondary" disabled={busy || (!isOwner && member.role === 'ADMIN')} onClick={() => { if (window.confirm(`Remove ${member.name} from ${organization?.name}?`)) void run(async () => { await api.removeOrganizationMember(organizationId, member.userId); setMembers(await api.organizationMembers(organizationId)); }); }}>Remove</button></div>}</td></tr>)}</tbody></table></div>
    </section>}
    {isOwner && <section className="panel admin-section"><div className="admin-section-heading"><div><div className="eyebrow">OWNER REVIEW</div><h2><ShieldCheck size={18} /> Admin requests</h2></div></div>{requests.length ? requests.map((item) => <div className="request-row" key={item.id}><div><b>{item.user.name}</b><small>{item.user.email} · {item.status} · {new Date(item.createdAt).toLocaleString()}</small></div>{item.status === 'PENDING' && <div className="member-actions"><button className="button button-primary" disabled={busy} onClick={() => void run(async () => { await api.reviewAdminRequest(organizationId, item.id, 'approve'); setRequests(await api.adminRequests(organizationId)); })}>Approve</button><button className="button button-secondary" disabled={busy} onClick={() => void run(async () => { await api.reviewAdminRequest(organizationId, item.id, 'reject'); setRequests(await api.adminRequests(organizationId)); })}>Reject</button></div>}</div>) : <p className="admin-empty">No Admin access requests.</p>}</section>}
    {isOwner && <section className="panel admin-section"><div className="admin-section-heading"><div><div className="eyebrow">ORGANIZATION ACTIVITY</div><h2><Activity size={18} /> Audit events</h2></div></div>{events.length ? events.map((event) => <div className="request-row" key={event.id}><div><b>{event.action.replaceAll('_', ' ')}</b><small>{event.actor?.name ?? 'Former user'} · {new Date(event.createdAt).toLocaleString()}</small></div></div>) : <p className="admin-empty">No audit events yet.</p>}</section>}
    {isOwner && <section className="panel admin-section"><div className="eyebrow">ORGANIZATION SETTINGS</div><h2>Workspace name</h2><form className="member-add-form" onSubmit={(event) => { event.preventDefault(); void run(() => api.updateOrganization(organizationId, organizationName.trim())); }}><input aria-label="Organization name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} minLength={2} maxLength={120} required /><button className="button button-primary" disabled={busy || !organizationName.trim()}>Save settings</button></form><p>Only an organization Owner can update these settings.</p></section>}
    {organization?.role === 'MEMBER' || organization?.role === 'VIEWER' ? <section className="panel admin-section"><div className="eyebrow">ELEVATED ACCESS</div><h2>Request Admin access</h2><p>Requests are reviewed by an organization Owner. Admin access is not granted until approved.</p><button className="button button-primary" disabled={busy} onClick={() => void run(() => api.requestAdmin(organizationId))}>Request Admin access</button></section> : null}
    {organization?.role === 'ADMIN' && <section className="panel admin-section"><div className="eyebrow">ADMIN ACCESS</div><p>Owner approval, organization settings, and audit records are reserved for the organization Owner.</p></section>}
  </div>;
}
