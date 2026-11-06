// Re-export EmailStatus as a plain TypeScript enum so the codebase compiles
// before `prisma generate` has been run (e.g. in CI or a fresh checkout).
// Once prisma generate runs, the real @prisma/client types are compatible.
export enum EmailStatus {
  SCHEDULED   = 'SCHEDULED',
  PROCESSING  = 'PROCESSING',
  SENT        = 'SENT',
  FAILED      = 'FAILED',
  RESCHEDULED = 'RESCHEDULED',
  CANCELLED   = 'CANCELLED',
}

// ─── Job Payload ──────────────────────────────────────────────────────────────
// This is what gets serialised into the BullMQ Redis job.
// Keep it minimal — IDs only, no large blobs. The worker fetches the full
// record from PostgreSQL to avoid stale data issues on delayed jobs.
export interface EmailJobPayload {
  emailId: string;
  userId: string;
  senderId: string;
  idempotencyKey: string;
}

// ─── API Response Wrapper ─────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Authenticated Request ────────────────────────────────────────────────────
// Extended Express Request type used by authenticated routes
export interface AuthenticatedUser {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatar?: string | null;
}

// Augment Express Request so TypeScript knows about req.user
declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

// ─── Email DTOs ───────────────────────────────────────────────────────────────
export interface ScheduleEmailDto {
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string; // ISO 8601
  idempotencyKey?: string;
}

export interface EmailRecord {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  sentAt: Date | null;
  status: EmailStatus;
  idempotencyKey: string;
  queueJobId: string | null;
  errorMessage: string | null;
  previewUrl: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sender DTOs ──────────────────────────────────────────────────────────────
export interface CreateSenderDto {
  email: string;
  name: string;
  hourlyLimit?: number;
  minimumSendDelay?: number;
}

export interface UpdateSenderDto {
  name?: string;
  hourlyLimit?: number;
  minimumSendDelay?: number;
}

// ─── Search ───────────────────────────────────────────────────────────────────
export interface EmailSearchQuery {
  q?: string;
  status?: EmailStatus;
  senderId?: string;
  page?: number;
  pageSize?: number;
}

// ─── Rate Limit State ─────────────────────────────────────────────────────────
export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetsAt: number; // Unix timestamp (seconds)
}
