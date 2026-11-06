import { emailQueue } from '../queues/emailQueue';
import { findPendingEmails } from '../repositories/emailRepository';
import { prisma } from '../config/database';
import { EmailStatus } from '../types';
import { logger } from '../utils/logger';

// ─── Startup Reconciliation ───────────────────────────────────────────────────
//
// Problem: When the worker restarts, some future-scheduled jobs might be
// missing from Redis (e.g. if Redis was restarted without persistence,
// or if the process crashed between DB write and Redis enqueue).
//
// Strategy:
//   1. Find all SCHEDULED/RESCHEDULED emails with scheduledAt > now
//   2. For each, check if its BullMQ job still exists in Redis
//   3. If the job is missing → re-enqueue it safely (deduplicated by jobId)
//   4. If the job exists → leave it alone
//
// What we explicitly do NOT do:
//   - Blindly re-enqueue everything (would create duplicates)
//   - Re-enqueue emails in PROCESSING state (ambiguous — might have sent)
//   - Re-enqueue emails with terminal states (SENT, FAILED, CANCELLED)
//
// PROCESSING state handling:
//   A crash during PROCESSING means we don't know if the email was sent.
//   We mark these as FAILED with a clear error message so they surface
//   for operator review. This is documented as a known limitation.
// ─────────────────────────────────────────────────────────────────────────────

export async function reconcilePendingJobs(): Promise<void> {
  logger.info('Starting startup reconciliation...');

  // Handle any emails stuck in PROCESSING — they were in-flight when the
  // worker crashed and are now in an ambiguous delivery state
  const processingCount = await prisma.email.updateMany({
    where: { status: EmailStatus.PROCESSING },
    data: {
      status: EmailStatus.FAILED,
      errorMessage:
        'Worker crashed during processing. Delivery status is unknown. ' +
        'Check the Ethereal inbox to determine if this email was delivered.',
    },
  });

  if (processingCount.count > 0) {
    logger.warn(
      `Marked ${processingCount.count} PROCESSING email(s) as FAILED due to ambiguous delivery state`
    );
  }

  // Find emails that should be queued but might not be
  const pendingEmails = await findPendingEmails();

  if (pendingEmails.length === 0) {
    logger.info('Reconciliation complete — no pending emails found');
    return;
  }

  logger.info(`Checking ${pendingEmails.length} pending email(s) for missing queue jobs`);

  let requeued = 0;
  let alreadyQueued = 0;

  // Check each email individually. This is intentionally sequential rather
  // than using Promise.all — we don't want to hammer Redis with hundreds of
  // simultaneous requests on startup.
  for (const email of pendingEmails) {
    const jobId = email.queueJobId ?? email.id;
    const existingJob = await emailQueue.getJob(jobId);

    if (existingJob) {
      // Job exists in Redis — leave it alone
      alreadyQueued++;
      continue;
    }

    // Job is missing — re-enqueue it
    // Using the same jobId ensures BullMQ deduplicates if somehow the job
    // already exists but getJob failed to find it
    const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());

    await emailQueue.add(
      'send-email',
      {
        emailId: email.id,
        userId: email.userId,
        senderId: email.senderId,
        idempotencyKey: email.idempotencyKey,
      },
      {
        jobId,
        delay,
      }
    );

    requeued++;
    logger.info('Re-enqueued missing job', {
      emailId: email.id,
      scheduledAt: email.scheduledAt.toISOString(),
      delay,
    });
  }

  logger.info('Reconciliation complete', {
    total: pendingEmails.length,
    alreadyQueued,
    requeued,
  });
}
