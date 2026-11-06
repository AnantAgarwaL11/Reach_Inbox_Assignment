// ─── Email ────────────────────────────────────────────────────────────────────

export type EmailStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'RESCHEDULED'
  | 'CANCELLED';

export interface Sender {
  id: string;
  userId: string;
  email: string;
  name: string;
  hourlyLimit: number;
  minimumSendDelay: number;
  createdAt: string;
  updatedAt: string;
}

export interface Email {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  idempotencyKey: string;
  queueJobId: string | null;
  errorMessage: string | null;
  previewUrl: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  sender: Sender;
}

export interface DashboardStats {
  scheduled: number;
  sent: number;
  failed: number;
}

// ─── API Response Wrapper ─────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: string;
}

export interface PagedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  recipients: string[];
  sampleInvalid: string[];
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface ScheduleResult {
  scheduled: number;
  skipped: number;
  emailIds: string[];
}

// ─── Slack ────────────────────────────────────────────────────────────────────

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
}
