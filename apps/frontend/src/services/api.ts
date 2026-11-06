import type {
  User,
  Email,
  Sender,
  DashboardStats,
  UploadResult,
  ScheduleResult,
  SlackStatus,
  PagedResult,
  ApiResponse,
} from '../types';

// Re-export types so pages that import them from '../services/api' keep working
export type { User, Email, Sender, DashboardStats, UploadResult, ScheduleResult, SlackStatus, PagedResult };

const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Generic request — returns the full ApiResponse so callers get both data and meta
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const json = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login';
    }
    throw new ApiError(json.error ?? 'Request failed', res.status);
  }

  return json as ApiResponse<T>;
}

// Shortcut for endpoints that only return data (no pagination)
async function requestData<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await request<T>(path, options);
  return response.data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const getMe = () => requestData<User>('/auth/me');
export const logout = () =>
  fetch('/auth/logout', { method: 'POST', credentials: 'include' });

// ─── Senders ──────────────────────────────────────────────────────────────────

export const getSenders = () => requestData<Sender[]>('/senders');

export const createSender = (data: Omit<Sender, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) =>
  requestData<Sender>('/senders', { method: 'POST', body: JSON.stringify(data) });

export const updateSender = (id: string, data: Partial<Sender>) =>
  requestData<Sender>(`/senders/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteSender = (id: string) =>
  requestData<{ deleted: boolean }>(`/senders/${id}`, { method: 'DELETE' });

// ─── Emails (paginated) ───────────────────────────────────────────────────────

export const getScheduledEmails = async (page = 1): Promise<PagedResult<Email>> => {
  const res = await request<Email[]>(`/emails/scheduled?page=${page}&pageSize=20`);
  return { data: res.data, meta: res.meta! };
};

export const getSentEmails = async (page = 1): Promise<PagedResult<Email>> => {
  const res = await request<Email[]>(`/emails/sent?page=${page}&pageSize=20`);
  return { data: res.data, meta: res.meta! };
};

export const getAllEmails = async (page = 1): Promise<PagedResult<Email>> => {
  const res = await request<Email[]>(`/emails?page=${page}&pageSize=20`);
  return { data: res.data, meta: res.meta! };
};

export const getEmailById = (id: string) => requestData<Email>(`/emails/${id}`);

export const cancelEmail = (id: string) =>
  requestData<{ cancelled: boolean }>(`/emails/${id}`, { method: 'DELETE' });

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchEmails = async (params: {
  q?: string;
  status?: string;
  senderId?: string;
  page?: number;
}): Promise<PagedResult<Email>> => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.senderId) qs.set('senderId', params.senderId);
  if (params.page) qs.set('page', String(params.page));
  qs.set('pageSize', '20');

  const res = await request<Email[]>(`/emails/search?${qs}`);
  return { data: res.data, meta: res.meta! };
};

export const getDashboardStats = () => requestData<DashboardStats>('/emails/stats');

// ─── Schedule ─────────────────────────────────────────────────────────────────

export const scheduleEmails = (data: {
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string;
  idempotencyKey?: string;
}) =>
  requestData<ScheduleResult>('/emails/schedule', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadRecipients(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE_URL}/upload/recipients`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const json = await res.json();
  if (!res.ok) throw new ApiError(json.error ?? 'Upload failed', res.status);
  return json.data as UploadResult;
}

// ─── Slack ────────────────────────────────────────────────────────────────────

export const getSlackStatus = () => requestData<SlackStatus>('/slack/status');
export const disconnectSlack = () =>
  requestData<{ disconnected: boolean }>('/slack/disconnect', { method: 'DELETE' });
