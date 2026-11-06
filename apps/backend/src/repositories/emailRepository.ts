import { prisma } from '../config/database';
import { EmailStatus } from '../types';

// All database operations for the Email entity live here.
// Controllers and services call repository functions — they never
// write raw Prisma queries. This keeps the query logic in one place
// and makes it easy to add caching or switch ORMs later.

interface CreateEmailData {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  idempotencyKey: string;
  status: EmailStatus;
}

export async function createEmail(data: CreateEmailData) {
  return prisma.email.create({ data, include: { sender: true } });
}

export async function findEmailById(id: string, userId: string) {
  return prisma.email.findFirst({
    where: { id, userId },
    include: { sender: true },
  });
}

export async function findEmailByIdempotencyKey(key: string) {
  return prisma.email.findUnique({ where: { idempotencyKey: key } });
}

export async function updateEmailStatus(
  id: string,
  status: EmailStatus,
  extras?: {
    sentAt?: Date;
    errorMessage?: string;
    previewUrl?: string;
    queueJobId?: string;
    retryCount?: number;
  }
) {
  return prisma.email.update({
    where: { id },
    data: { status, ...extras, updatedAt: new Date() },
  });
}

export async function listEmailsByStatus(
  userId: string,
  status: EmailStatus,
  page: number,
  pageSize: number
) {
  const skip = (page - 1) * pageSize;

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where: { userId, status },
      include: { sender: true },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.email.count({ where: { userId, status } }),
  ]);

  // Promise.all is appropriate here: both queries are independent reads.
  // They run concurrently over the same connection pool, cutting latency roughly in half.
  return { emails, total };
}

export async function listAllEmails(
  userId: string,
  page: number,
  pageSize: number
) {
  const skip = (page - 1) * pageSize;

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where: { userId },
      include: { sender: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.email.count({ where: { userId } }),
  ]);

  return { emails, total };
}

// Used by startup reconciliation: find all SCHEDULED/RESCHEDULED emails
// that are due in the future and need their queue job verified.
export async function findPendingEmails() {
  return prisma.email.findMany({
    where: {
      status: { in: [EmailStatus.SCHEDULED, EmailStatus.RESCHEDULED] },
      scheduledAt: { gte: new Date() },
    },
    include: { sender: true },
  });
}

export async function getDashboardStats(userId: string) {
  const [scheduled, sent, failed] = await Promise.all([
    prisma.email.count({ where: { userId, status: EmailStatus.SCHEDULED } }),
    prisma.email.count({ where: { userId, status: EmailStatus.SENT } }),
    prisma.email.count({ where: { userId, status: EmailStatus.FAILED } }),
  ]);

  return { scheduled, sent, failed };
}

export async function softDeleteEmail(id: string, userId: string) {
  // Verify ownership before cancelling
  const email = await prisma.email.findFirst({
    where: { id, userId, status: { in: [EmailStatus.SCHEDULED, EmailStatus.RESCHEDULED] } },
  });

  if (!email) return null;

  return prisma.email.update({
    where: { id },
    data: { status: EmailStatus.CANCELLED },
  });
}
