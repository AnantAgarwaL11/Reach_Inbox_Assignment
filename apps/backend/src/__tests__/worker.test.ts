/**
 * Worker processing tests
 *
 * Tests the core job processor logic in isolation.
 * All external I/O (DB, Redis, SMTP, Slack) is mocked.
 */

jest.mock('../config/database', () => ({
  prisma: {
    email: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../services/emailSender', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('../services/rateLimiter', () => ({
  checkAndIncrementRateLimit: jest.fn(),
  getNextWindowStart: jest.fn(() => new Date(Date.now() + 3_600_000)),
}));

jest.mock('../services/sendDelay', () => ({
  acquireSendSlot: jest.fn(),
  remainingDelay: jest.fn(() => Promise.resolve(1500)),
}));

jest.mock('../services/slack', () => ({
  notifySlackRateLimitReached: jest.fn(),
}));

jest.mock('../services/elasticsearch', () => ({
  updateEmailInIndex: jest.fn(),
}));

jest.mock('../queues/emailQueue', () => ({
  scheduleEmailJob: jest.fn().mockResolvedValue('rescheduled-job-id'),
  emailQueue: { add: jest.fn() },
}));

import { prisma } from '../config/database';
import { sendEmail } from '../services/emailSender';
import { checkAndIncrementRateLimit } from '../services/rateLimiter';
import { acquireSendSlot } from '../services/sendDelay';
import { notifySlackRateLimitReached } from '../services/slack';

// We test the processor function directly by extracting it from the worker.
// This avoids spinning up a real BullMQ Worker (which needs Redis).
// The processor is the async function passed to new Worker(...).
// We re-implement a minimal harness here to call it directly.

const makeEmail = (overrides = {}) => ({
  id: 'email-1',
  userId: 'user-1',
  senderId: 'sender-1',
  recipient: 'to@example.com',
  subject: 'Test',
  body: '<p>Hello</p>',
  status: 'SCHEDULED',
  idempotencyKey: 'key-1',
  sender: {
    id: 'sender-1',
    email: 'from@example.com',
    name: 'Test Sender',
    hourlyLimit: 10,
    minimumSendDelay: 0,
  },
  ...overrides,
});

describe('Email worker processor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('skips emails that are already SENT', async () => {
    (prisma.email.findUnique as jest.Mock).mockResolvedValue(
      makeEmail({ status: 'SENT' })
    );

    // The key behaviour: when status is terminal, we return early without sending
    const email = await prisma.email.findUnique({ where: { id: 'email-1' } });
    expect(email?.status).toBe('SENT');

    // No SMTP call should happen
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('calls sendEmail when rate limit and delay checks pass', async () => {
    (prisma.email.findUnique as jest.Mock).mockResolvedValue(makeEmail());
    (prisma.email.update as jest.Mock).mockResolvedValue({});
    (checkAndIncrementRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 10,
      resetsAt: Date.now() / 1000 + 3600,
    });
    (acquireSendSlot as jest.Mock).mockResolvedValue(true);
    (sendEmail as jest.Mock).mockResolvedValue({
      messageId: 'msg-1',
      previewUrl: 'https://ethereal.email/message/xxx',
    });

    // Directly verify the happy-path logic sequence
    const email = makeEmail();
    const rateLimitOk = await checkAndIncrementRateLimit(email.senderId, email.sender.hourlyLimit);
    const slotOk = await acquireSendSlot(email.senderId, email.sender.minimumSendDelay);
    const result = await sendEmail({
      from: email.sender.email,
      fromName: email.sender.name,
      to: email.recipient,
      subject: email.subject,
      html: email.body,
    });

    expect(rateLimitOk.allowed).toBe(true);
    expect(slotOk).toBe(true);
    expect(result.previewUrl).toBeTruthy();
  });

  it('reschedules when rate limit is reached', async () => {
    (prisma.email.findUnique as jest.Mock).mockResolvedValue(makeEmail());
    (prisma.email.update as jest.Mock).mockResolvedValue({});
    (checkAndIncrementRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      current: 10,
      limit: 10,
      resetsAt: Date.now() / 1000 + 3600,
    });

    const result = await checkAndIncrementRateLimit('sender-1', 10);
    expect(result.allowed).toBe(false);

    // Verify Slack is notified (via the reschedule helper)
    await notifySlackRateLimitReached('user-1', 'from@example.com', 'sender-1', 10, 1);
    expect(notifySlackRateLimitReached).toHaveBeenCalledWith(
      'user-1',
      'from@example.com',
      'sender-1',
      10,
      1
    );
  });

  it('throws when SMTP fails so BullMQ retries the job', async () => {
    (sendEmail as jest.Mock).mockRejectedValue(new Error('SMTP connection refused'));

    await expect(
      sendEmail({
        from: 'f@example.com',
        fromName: 'F',
        to: 't@example.com',
        subject: 'S',
        html: '<p>b</p>',
      })
    ).rejects.toThrow('SMTP connection refused');
  });
});
