import { Worker, Job } from 'bullmq';
import { EmailStatus } from '../types';
import { bullMQRedis } from '../config/redis';
import { prisma } from '../config/database';
import { sendEmail } from '../services/emailSender';
import { checkAndIncrementRateLimit, getNextWindowStart } from '../services/rateLimiter';
import { acquireSendSlot, remainingDelay } from '../services/sendDelay';
import { scheduleEmailJob } from '../queues/emailQueue';
import { notifySlackRateLimitReached } from '../services/slack';
import { updateEmailInIndex } from '../services/elasticsearch';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { EmailJobPayload } from '../types';

// ─── Why Concurrency is NOT the Same as Parallelism ──────────────────────────
//
// Node.js is single-threaded. WORKER_CONCURRENCY=5 means BullMQ will call the
// processor function up to 5 times before waiting for one to resolve. This is
// async concurrency — 5 I/O operations in flight simultaneously using the
// event loop, not 5 threads running in parallel.
//
// This is efficient for I/O-bound work (SMTP, database queries) because Node
// can process other events while waiting for I/O responses.
//
// It does NOT provide CPU parallelism. For CPU-intensive work, you would need
// worker_threads or separate processes.
//
// Critical implication: 5 concurrent jobs might target the same sender.
// In-memory checks (if count < limit) are not safe across concurrent async
// operations because the check and increment are not atomic.
// All distributed coordination (rate limits, delays) MUST go through Redis.
// ─────────────────────────────────────────────────────────────────────────────

export function createEmailWorker(): Worker<EmailJobPayload> {
  const worker = new Worker<EmailJobPayload>(
    'email-scheduler',
    async (job: Job<EmailJobPayload>) => {
      const { emailId, userId, senderId } = job.data;

      logger.info('Processing email job', { jobId: job.id, emailId });

      // ─── Step 1: Fetch the full email record from PostgreSQL ────────────
      // We store only IDs in the job payload. This avoids stale data:
      // the email might have been cancelled or rescheduled since enqueueing.
      const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: { sender: true },
      });

      if (!email) {
        logger.warn('Email not found in database, skipping', { emailId });
        return; // Job is gone — treat as complete, do not retry
      }

      // ─── Step 2: Check for already-terminal states ──────────────────────
      // A restart might re-process a job that was already completed.
      // The database is the source of truth.
      if (email.status === EmailStatus.SENT || email.status === EmailStatus.CANCELLED) {
        logger.info('Email already in terminal state, skipping', {
          emailId,
          status: email.status,
        });
        return;
      }

      // ─── Step 3: Mark as PROCESSING ────────────────────────────────────
      // This status prevents duplicate sends if two workers somehow pick up
      // the same job (BullMQ prevents this, but defence-in-depth is valuable).
      await prisma.email.update({
        where: { id: emailId },
        data: { status: EmailStatus.PROCESSING },
      });

      // ─── Step 4: Distributed Rate Limit Check ──────────────────────────
      const limit = email.sender.hourlyLimit;
      const rateLimitResult = await checkAndIncrementRateLimit(senderId, limit);

      if (!rateLimitResult.allowed) {
        logger.info('Rate limit reached, rescheduling', {
          emailId,
          senderId,
          current: rateLimitResult.current,
          limit,
        });
        await rescheduleEmail(email, userId, senderId, limit);
        return;
      }

      // ─── Step 5: Minimum Send Delay Check ──────────────────────────────
      const acquired = await acquireSendSlot(
        senderId,
        email.sender.minimumSendDelay
      );

      if (!acquired) {
        // Another worker just sent from this sender. Put the job back in the
        // queue with the remaining delay so it retries correctly.
        const remaining = await remainingDelay(senderId);
        logger.debug('Send delay active, re-queuing', { emailId, remaining });

        // We update status back to SCHEDULED before throwing so BullMQ
        // retries the job after the backoff period.
        await prisma.email.update({
          where: { id: emailId },
          data: { status: EmailStatus.SCHEDULED },
        });

        throw new Error(`Send delay active: ${remaining}ms remaining`);
      }

      // ─── Step 6: Send the Email ────────────────────────────────────────
      // IMPORTANT: This is the ambiguous zone.
      // If the process crashes AFTER the SMTP server accepts the message
      // but BEFORE we write SENT to PostgreSQL, we cannot know if it was
      // delivered. On retry, the email would be sent again.
      //
      // Mitigation: The database status transitions from PROCESSING → SENT
      // atomically. On startup, any PROCESSING emails are ambiguous — we
      // mark them FAILED with a note, which surfaces them for manual review.
      // This is documented in the README as a known limitation.
      // Perfect exactly-once SMTP delivery requires end-to-end delivery
      // receipts that Ethereal (and most SMTP providers) do not provide.
      let previewUrl: string | null = null;

      try {
        const result = await sendEmail({
          from: email.sender.email,
          fromName: email.sender.name,
          to: email.recipient,
          subject: email.subject,
          html: email.body,
        });
        previewUrl = result.previewUrl;
      } catch (smtpError) {
        // SMTP failed — record the error and let BullMQ retry (up to job.opts.attempts)
        logger.error('SMTP send failed', { emailId, smtpError });
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: EmailStatus.FAILED,
            errorMessage: smtpError instanceof Error ? smtpError.message : 'Unknown SMTP error',
            retryCount: (email.retryCount ?? 0) + 1,
          },
        });
        await updateEmailInIndex(emailId, { status: EmailStatus.FAILED });
        throw smtpError; // Re-throw so BullMQ retries
      }

      // ─── Step 7: Mark SENT ─────────────────────────────────────────────
      const sentAt = new Date();
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: EmailStatus.SENT,
          sentAt,
          previewUrl,
        },
      });

      await updateEmailInIndex(emailId, {
        status: EmailStatus.SENT,
        sentAt: sentAt.toISOString(),
      });

      logger.info('Email sent successfully', { emailId, recipient: email.recipient, previewUrl });
    },
    {
      connection: bullMQRedis,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, emailId: job?.data?.emailId, err: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { err });
  });

  return worker;
}

// ─── Reschedule Helper ────────────────────────────────────────────────────────

async function rescheduleEmail(
  email: {
    id: string;
    subject: string;
    body: string;
    recipient: string;
    idempotencyKey: string;
    sender: { email: string };
  },
  userId: string,
  senderId: string,
  limit: number
): Promise<void> {
  const nextWindow = getNextWindowStart();
  const newJobId = `${email.id}:reschedule:${nextWindow.getTime()}`;

  const jobId = await scheduleEmailJob(
    newJobId,
    {
      emailId: email.id,
      userId,
      senderId,
      idempotencyKey: email.idempotencyKey,
    },
    nextWindow
  );

  await prisma.email.update({
    where: { id: email.id },
    data: {
      status: EmailStatus.RESCHEDULED,
      scheduledAt: nextWindow,
      queueJobId: jobId ?? newJobId,
    },
  });

  await updateEmailInIndex(email.id, {
    status: EmailStatus.RESCHEDULED,
    scheduledAt: nextWindow.toISOString(),
  });

  // Pass the sender's email address (not the recipient) to the Slack notification
  await notifySlackRateLimitReached(userId, email.sender.email, senderId, limit, 1);
}
