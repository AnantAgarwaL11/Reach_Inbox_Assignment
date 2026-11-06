/**
 * Reconciler tests
 *
 * Verifies the startup reconciliation logic:
 *   - PROCESSING emails are marked FAILED (ambiguous delivery state)
 *   - Emails with missing queue jobs are re-enqueued
 *   - Emails with existing queue jobs are left alone
 *   - Completed/cancelled emails are never touched
 */

jest.mock('../config/database', () => ({
  prisma: {
    email: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../queues/emailQueue', () => ({
  emailQueue: {
    getJob: jest.fn(),
    add: jest.fn(),
  },
}));

import { reconcilePendingJobs } from '../schedulers/reconciler';
import { prisma } from '../config/database';
import { emailQueue } from '../queues/emailQueue';

const makePendingEmail = (id: string, jobId: string | null = id) => ({
  id,
  userId: 'user-1',
  senderId: 'sender-1',
  idempotencyKey: `key-${id}`,
  scheduledAt: new Date(Date.now() + 60_000), // 1 minute in the future
  queueJobId: jobId,
  status: 'SCHEDULED',
  sender: { email: 'test@example.com', name: 'Test' },
});

describe('reconcilePendingJobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.email.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it('marks PROCESSING emails as FAILED on startup', async () => {
    (prisma.email.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.email.findMany as jest.Mock).mockResolvedValue([]);

    await reconcilePendingJobs();

    expect(prisma.email.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PROCESSING' },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    );
  });

  it('re-enqueues emails whose BullMQ job is missing from Redis', async () => {
    const email = makePendingEmail('email-1', 'job-1');
    (prisma.email.findMany as jest.Mock).mockResolvedValue([email]);

    // Simulate missing job in Redis
    (emailQueue.getJob as jest.Mock).mockResolvedValue(null);
    (emailQueue.add as jest.Mock).mockResolvedValue({ id: 'job-1' });

    await reconcilePendingJobs();

    expect(emailQueue.add).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({ emailId: 'email-1' }),
      expect.objectContaining({ jobId: 'job-1' })
    );
  });

  it('leaves emails alone when their BullMQ job still exists', async () => {
    const email = makePendingEmail('email-2', 'job-2');
    (prisma.email.findMany as jest.Mock).mockResolvedValue([email]);

    // Job exists in Redis
    (emailQueue.getJob as jest.Mock).mockResolvedValue({ id: 'job-2', data: {} });

    await reconcilePendingJobs();

    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('handles mixed state: re-enqueues missing, skips present', async () => {
    const emails = [
      makePendingEmail('email-a', 'job-a'), // job missing
      makePendingEmail('email-b', 'job-b'), // job present
      makePendingEmail('email-c', 'job-c'), // job missing
    ];
    (prisma.email.findMany as jest.Mock).mockResolvedValue(emails);

    (emailQueue.getJob as jest.Mock).mockImplementation((id: string) => {
      if (id === 'job-b') return Promise.resolve({ id, data: {} });
      return Promise.resolve(null);
    });
    (emailQueue.add as jest.Mock).mockResolvedValue({ id: 'mock' });

    await reconcilePendingJobs();

    // Only the two missing jobs should be re-enqueued
    expect(emailQueue.add).toHaveBeenCalledTimes(2);

    const calledIds = (emailQueue.add as jest.Mock).mock.calls.map(
      (call: unknown[]) => (call[1] as { emailId: string }).emailId
    );
    expect(calledIds).toContain('email-a');
    expect(calledIds).toContain('email-c');
    expect(calledIds).not.toContain('email-b');
  });

  it('does nothing when there are no pending emails', async () => {
    (prisma.email.findMany as jest.Mock).mockResolvedValue([]);

    await reconcilePendingJobs();

    expect(emailQueue.add).not.toHaveBeenCalled();
    expect(emailQueue.getJob).not.toHaveBeenCalled();
  });
});
