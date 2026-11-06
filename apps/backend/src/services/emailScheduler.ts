import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '../config/database';
import { scheduleEmailJob } from '../queues/emailQueue';
import { indexEmail } from './elasticsearch';
import { logger } from '../utils/logger';
import { EmailStatus } from '../types';

// ─── Validation ───────────────────────────────────────────────────────────────

export const scheduleEmailSchema = z.object({
  senderId: z.string().uuid('senderId must be a valid UUID'),
  recipients: z
    .array(z.string().email('Each recipient must be a valid email'))
    .min(1, 'At least one recipient is required')
    .max(1000, 'Maximum 1000 recipients per request'),
  subject: z.string().min(1).max(998), // RFC 2822 subject limit
  body: z.string().min(1),
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be an ISO 8601 datetime string' })
    .refine(
      (val) => new Date(val) > new Date(),
      { message: 'scheduledAt must be in the future' }
    ),
  idempotencyKey: z.string().optional(),
});

export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>;

// ─── Schedule Result ──────────────────────────────────────────────────────────

interface ScheduleResult {
  scheduled: number;
  skipped: number;      // duplicates (idempotency key already exists)
  emailIds: string[];
}

// ─── Scheduling Logic ─────────────────────────────────────────────────────────

export async function scheduleEmails(
  userId: string,
  input: ScheduleEmailInput
): Promise<ScheduleResult> {
  const scheduledAt = new Date(input.scheduledAt);
  const result: ScheduleResult = { scheduled: 0, skipped: 0, emailIds: [] };

  // Verify the sender belongs to this user (tenant isolation)
  const sender = await prisma.sender.findFirst({
    where: { id: input.senderId, userId },
  });

  if (!sender) {
    throw new Error('Sender not found or does not belong to this account');
  }

  // Re-validate every recipient on the backend.
  // The frontend validates too, but server-side validation is mandatory —
  // never trust client input. Zod already validated the array structure;
  // this catches any addresses that slipped through or were tampered with.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validRecipients = input.recipients.filter((r) => EMAIL_RE.test(r.trim()));
  const invalidCount = input.recipients.length - validRecipients.length;
  if (invalidCount > 0) {
    logger.warn(`Filtered ${invalidCount} invalid recipient(s) on backend`, { userId });
  }

  // Process each recipient sequentially rather than with Promise.all.
  // Each iteration hits the same database table; running them in parallel
  // risks saturating the connection pool for large batches.
  // Promise.allSettled would be appropriate if recipients were fully
  // independent and we wanted partial-success reporting — sequential is
  // correct here because idempotency makes it safe to retry the whole request.
  for (const recipient of validRecipients) {
    const idempotencyKey = input.idempotencyKey
      ? `${input.idempotencyKey}:${recipient}`
      : `${userId}:${input.senderId}:${recipient}:${scheduledAt.toISOString()}`;

    // ─── Idempotency Check ────────────────────────────────────────────────
    // If a job with this key already exists, skip it. This makes the
    // endpoint safe to retry on network failure without double-scheduling.
    const existing = await prisma.email.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      result.skipped++;
      continue;
    }

    const emailId = uuidv4();

    // ─── Transactional Outbox Pattern ─────────────────────────────────────
    // Challenge: We need to write to PostgreSQL AND add to Redis (BullMQ).
    // These are two separate systems — there is no distributed transaction.
    //
    // Strategy:
    //   1. Write the email record to PostgreSQL first (SCHEDULED status)
    //   2. Then add the BullMQ job
    //   3. If step 2 fails, the startup reconciliation picks up orphaned
    //      SCHEDULED records and re-enqueues them safely.
    //
    // This means a crash between steps 1 and 2 results in a job that is in
    // the database but not in the queue — recoverable.
    // A crash after step 2 means both are set — idempotency prevents duplication.
    // The reverse order (queue first) would leave a job with no DB record —
    // unrecoverable.

    const email = await prisma.email.create({
      data: {
        id: emailId,
        userId,
        senderId: input.senderId,
        recipient,
        subject: input.subject,
        body: input.body,
        scheduledAt,
        idempotencyKey,
        status: 'SCHEDULED',
      },
    });

    // Add the delayed BullMQ job. Using emailId as the jobId deduplicates
    // at the queue level too.
    const jobId = await scheduleEmailJob(
      emailId,
      {
        emailId,
        userId,
        senderId: input.senderId,
        idempotencyKey,
      },
      scheduledAt
    );

    // Record the jobId for startup reconciliation and debugging
    await prisma.email.update({
      where: { id: emailId },
      data: { queueJobId: jobId },
    });

    // Index to Elasticsearch asynchronously — never await this in the
    // critical path. ES failure must not fail the scheduling operation.
    indexEmail({
      id: email.id,
      userId: email.userId,
      senderId: email.senderId,
      senderEmail: sender.email,
      senderName: sender.name,
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      status: email.status as EmailStatus,
      scheduledAt: email.scheduledAt.toISOString(),
      createdAt: email.createdAt.toISOString(),
    });

    result.scheduled++;
    result.emailIds.push(emailId);

    logger.info('Email scheduled', {
      emailId,
      recipient,
      scheduledAt: scheduledAt.toISOString(),
    });
  }

  return result;
}
