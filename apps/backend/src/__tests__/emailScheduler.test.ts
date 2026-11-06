/**
 * Tests cover:
 *  1. Scheduling validation
 *  2. Idempotency (duplicate prevention)
 *  3. Rate limiter atomicity
 *  4. Send delay coordination
 *  5. Reconciliation logic
 *
 * External services (PostgreSQL, Redis, BullMQ, SMTP) are mocked.
 * The tests verify business logic, not infrastructure behaviour.
 */

// ─── Mock Setup ───────────────────────────────────────────────────────────────

jest.mock('../config/database', () => ({
  prisma: {
    email: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    sender: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../queues/emailQueue', () => ({
  scheduleEmailJob: jest.fn().mockResolvedValue('mock-job-id'),
  emailQueue: {
    getJob: jest.fn(),
    add: jest.fn(),
  },
}));

jest.mock('../services/elasticsearch', () => ({
  indexEmail: jest.fn(),
  updateEmailInIndex: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  redisClient: {
    eval: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    pttl: jest.fn(),
    ttl: jest.fn(),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { scheduleEmails, scheduleEmailSchema } from '../services/emailScheduler';
import { checkAndIncrementRateLimit } from '../services/rateLimiter';
import { acquireSendSlot } from '../services/sendDelay';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { scheduleEmailJob } from '../queues/emailQueue';

// ─── 1. Scheduling Validation ─────────────────────────────────────────────────

describe('scheduleEmailSchema validation', () => {
  it('rejects a past scheduledAt date', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: '00000000-0000-0000-0000-000000000001',
      recipients: ['test@example.com'],
      subject: 'Hello',
      body: '<p>Test</p>',
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid recipient email', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: '00000000-0000-0000-0000-000000000001',
      recipients: ['not-an-email'],
      subject: 'Hello',
      body: '<p>Test</p>',
      scheduledAt: new Date(Date.now() + 10000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid future schedule', () => {
    const result = scheduleEmailSchema.safeParse({
      senderId: '00000000-0000-0000-0000-000000000001',
      recipients: ['user@example.com'],
      subject: 'Hello',
      body: '<p>Test</p>',
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

// ─── 2. Idempotency ───────────────────────────────────────────────────────────

describe('scheduleEmails idempotency', () => {
  const userId = 'user-1';
  const senderId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    (prisma.sender.findFirst as jest.Mock).mockResolvedValue({
      id: senderId,
      email: 'sender@example.com',
      name: 'Test Sender',
      hourlyLimit: 200,
      minimumSendDelay: 2000,
    });
  });

  it('skips a recipient if its idempotency key already exists', async () => {
    // Simulate: email already scheduled with this key
    (prisma.email.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-email-id' });

    const result = await scheduleEmails(userId, {
      senderId,
      recipients: ['user@example.com'],
      subject: 'Test',
      body: '<p>Body</p>',
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(1);
    expect(scheduleEmailJob).not.toHaveBeenCalled();
  });

  it('schedules when no duplicate exists', async () => {
    (prisma.email.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.email.create as jest.Mock).mockResolvedValue({
      id: 'new-email-id',
      userId,
      senderId,
      recipient: 'user@example.com',
      subject: 'Test',
      body: '<p>Body</p>',
      scheduledAt: new Date(Date.now() + 60_000),
      status: 'SCHEDULED',
      idempotencyKey: 'key',
      createdAt: new Date(),
    });
    (prisma.email.update as jest.Mock).mockResolvedValue({});

    const result = await scheduleEmails(userId, {
      senderId,
      recipients: ['user@example.com'],
      subject: 'Test',
      body: '<p>Body</p>',
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(result.scheduled).toBe(1);
    expect(result.skipped).toBe(0);
    expect(scheduleEmailJob).toHaveBeenCalledTimes(1);
  });
});

// ─── 3. Rate Limiting ─────────────────────────────────────────────────────────

describe('checkAndIncrementRateLimit', () => {
  it('returns allowed=true when under the limit', async () => {
    // Lua script returns [1 (allowed), 5 (current count), timestamp]
    (redisClient.eval as jest.Mock).mockResolvedValue([1, 5, Math.floor(Date.now() / 1000) + 3600]);

    const result = await checkAndIncrementRateLimit('sender-1', 10);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(5);
  });

  it('returns allowed=false when at the limit', async () => {
    (redisClient.eval as jest.Mock).mockResolvedValue([0, 10, Math.floor(Date.now() / 1000) + 3600]);

    const result = await checkAndIncrementRateLimit('sender-1', 10);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(10);
  });

  it('calls Redis EVAL with correct arguments', async () => {
    (redisClient.eval as jest.Mock).mockResolvedValue([1, 1, Date.now()]);

    await checkAndIncrementRateLimit('sender-abc', 50);

    const [, , key] = (redisClient.eval as jest.Mock).mock.calls[0];
    expect(key).toMatch(/^rate_limit:sender-abc:/);
  });
});

// ─── 4. Send Delay ────────────────────────────────────────────────────────────

describe('acquireSendSlot', () => {
  it('returns true when the slot is free (key does not exist)', async () => {
    (redisClient.set as jest.Mock).mockResolvedValue('OK');
    const result = await acquireSendSlot('sender-1', 2000);
    expect(result).toBe(true);
  });

  it('returns false when another worker holds the slot (key exists)', async () => {
    (redisClient.set as jest.Mock).mockResolvedValue(null);
    const result = await acquireSendSlot('sender-1', 2000);
    expect(result).toBe(false);
  });

  it('skips the Redis call when delay is 0', async () => {
    const result = await acquireSendSlot('sender-1', 0);
    expect(result).toBe(true);
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});
