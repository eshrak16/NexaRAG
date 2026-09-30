import type { AdminRoleRequest, AskResponse, AuditEvent, AuthResponse, Document, KnowledgeBase, Organization, OrganizationMember, PageResult, UploadResult } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'nexarag.access-token';
const REFRESH_TOKEN_KEY = 'nexarag.refresh-token';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  getRefresh: () => sessionStorage.getItem(REFRESH_TOKEN_KEY),
  set: (token: string, refreshToken?: string) => { sessionStorage.setItem(TOKEN_KEY, token); if (refreshToken) sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken); },
  clear: () => { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(REFRESH_TOKEN_KEY); },
};

let refreshInFlight: Promise<AuthResponse | null> | null = null;
async function refreshSession(): Promise<AuthResponse | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) })
      .then(async (response) => { if (!response.ok) return null; return await response.json() as AuthResponse; })
      .then((result) => { if (result) tokenStore.set(result.accessToken, result.refreshToken); else tokenStore.clear(); return result; })
      .catch(() => { tokenStore.clear(); return null; })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true, retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (authenticated && token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Could not reach the NexaRAG API. Check that the backend is running.', 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : null;
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : `Request failed (${response.status}).`;
    if (response.status === 401 && authenticated && !retried && !path.startsWith('/auth/')) {
      const refreshed = await refreshSession();
      if (refreshed) return request<T>(path, init, authenticated, true);
    }
    if (response.status === 401 && path !== '/auth/me') tokenStore.clear();
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export const api = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const result = await request<AuthResponse>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }, false);
    tokenStore.set(result.accessToken, result.refreshToken);
    return result;
  },
  me: () => request<{ user: AuthResponse['user'] }>('/auth/me'),
  restoreSession: async () => {
    if (!tokenStore.get() && !(await refreshSession())) throw new ApiError('Please sign in to continue.', 401);
    try {
      return await request<{ user: AuthResponse['user'] }>('/auth/me');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || !(await refreshSession())) throw error;
      return request<{ user: AuthResponse['user'] }>('/auth/me');
    }
  },
  logout: (refreshToken = tokenStore.getRefresh()) => request<{ success: boolean }>('/auth/logout', {
    method: 'POST', body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  }, false).catch(() => ({ success: false })),
  knowledgeBases: (page = 1, limit = 100) => request<PageResult<KnowledgeBase>>(`/knowledge-bases?page=${page}&limit=${limit}`),
  createKnowledgeBase: (organizationId: string, name: string, description: string) => request<KnowledgeBase>('/knowledge-bases', {
    method: 'POST', body: JSON.stringify({ organizationId, name, description: description || null }),
  }),
  updateKnowledgeBase: (knowledgeBaseId: string, name: string, description: string) => request<KnowledgeBase>(
    `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
    { method: 'PATCH', body: JSON.stringify({ name, description: description || null }) },
  ),
  deleteKnowledgeBase: (knowledgeBaseId: string) => request<KnowledgeBase>(
    `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
    { method: 'DELETE' },
  ),
  documents: (knowledgeBaseId: string, limit = 100, page = 1) => request<PageResult<Document>>(
    `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents?page=${page}&limit=${limit}`,
  ),
  organizations: () => request<Organization[]>('/organizations'),
  updateOrganization: (organizationId: string, name: string) => request<Organization>(`/organizations/${encodeURIComponent(organizationId)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  organizationMembers: (organizationId: string) => request<OrganizationMember[]>(`/organizations/${encodeURIComponent(organizationId)}/members`),
  addOrganizationMember: (organizationId: string, email: string, role: 'MEMBER' | 'VIEWER') => request<{ userId: string; role: Organization['role'] }>(`/organizations/${encodeURIComponent(organizationId)}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  setOrganizationMemberRole: (organizationId: string, userId: string, role: 'MEMBER' | 'VIEWER') => request<{ userId: string; role: Organization['role'] }>(`/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeOrganizationMember: (organizationId: string, userId: string) => request<void>(`/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  adminRequests: (organizationId: string) => request<AdminRoleRequest[]>(`/organizations/${encodeURIComponent(organizationId)}/admin-requests`),
  requestAdmin: (organizationId: string) => request<AdminRoleRequest>(`/organizations/${encodeURIComponent(organizationId)}/admin-requests`, { method: 'POST' }),
  reviewAdminRequest: (organizationId: string, requestId: string, decision: 'approve' | 'reject') => request<AdminRoleRequest>(`/organizations/${encodeURIComponent(organizationId)}/admin-requests/${encodeURIComponent(requestId)}/${decision}`, { method: 'POST' }),
  auditEvents: (organizationId: string) => request<AuditEvent[]>(`/organizations/${encodeURIComponent(organizationId)}/audit-events`),
  ask: (knowledgeBaseId: string, query: string, topK = 5) => request<AskResponse>(
    `/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/ask`,
    { method: 'POST', body: JSON.stringify({ query, topK }) },
  ),
  upload: (knowledgeBaseId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<UploadResult>(`/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/upload`, {
      method: 'POST', body: form,
    });
  },
};
