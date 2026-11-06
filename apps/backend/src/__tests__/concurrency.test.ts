/**
 * Concurrency tests
 *
 * These tests verify that rate limiting and send delay coordination
 * remain correct when multiple workers process jobs simultaneously.
 *
 * Key insight: Node.js async concurrency means multiple jobs can be
 * in-flight simultaneously on the same thread. Without Redis-backed
 * atomic operations, they would race on shared state.
 */

jest.mock('../config/redis', () => ({
  redisClient: {
    eval: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    pttl: jest.fn(),
    ttl: jest.fn(),
  },
}));

import { checkAndIncrementRateLimit } from '../services/rateLimiter';
import { acquireSendSlot } from '../services/sendDelay';
import { redisClient } from '../config/redis';

describe('Concurrent rate limiting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only allows up to the limit even when called concurrently', async () => {
    // Simulate Redis atomic counter — increments 1-3, blocks at 4+
    let counter = 0;
    const limit = 3;

    (redisClient.eval as jest.Mock).mockImplementation(() => {
      counter++;
      if (counter > limit) {
        return Promise.resolve([0, counter, Date.now() / 1000 + 3600]);
      }
      return Promise.resolve([1, counter, Date.now() / 1000 + 3600]);
    });

    // Fire 5 concurrent checks — simulates WORKER_CONCURRENCY=5 all checking
    // the same sender simultaneously
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkAndIncrementRateLimit('sender-x', limit))
    );

    const allowed = results.filter((r) => r.allowed).length;
    const blocked = results.filter((r) => !r.allowed).length;

    // Because our mock is atomic (synchronous under the event loop),
    // exactly 3 should be allowed and 2 blocked
    expect(allowed).toBe(3);
    expect(blocked).toBe(2);

    // Redis eval was called 5 times — once per concurrent job
    expect(redisClient.eval).toHaveBeenCalledTimes(5);
  });

  it('correctly passes the limit to the Lua script', async () => {
    (redisClient.eval as jest.Mock).mockResolvedValue([1, 1, Date.now()]);
    await checkAndIncrementRateLimit('sender-y', 42);

    const call = (redisClient.eval as jest.Mock).mock.calls[0];
    // ARGV[1] is the limit (index 3 in the eval call: script, numkeys, key, limit, now)
    expect(call[3]).toBe(42);
  });
});

describe('Concurrent send delay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only one worker acquires the slot when multiple call simultaneously', async () => {
    // First SET NX succeeds, subsequent ones fail (key already exists)
    let first = true;
    (redisClient.set as jest.Mock).mockImplementation(() => {
      if (first) {
        first = false;
        return Promise.resolve('OK');
      }
      return Promise.resolve(null);
    });

    const results = await Promise.all(
      Array.from({ length: 4 }, () => acquireSendSlot('sender-z', 2000))
    );

    const acquired = results.filter(Boolean).length;
    const blocked = results.filter((r) => !r).length;

    expect(acquired).toBe(1);
    expect(blocked).toBe(3);
  });

  it('uses SET NX PX — the atomic Redis primitive', async () => {
    (redisClient.set as jest.Mock).mockResolvedValue('OK');
    await acquireSendSlot('sender-abc', 5000);

    const [key, value, exFlag, ttl, nxFlag] =
      (redisClient.set as jest.Mock).mock.calls[0];

    expect(key).toMatch(/^send_delay:sender-abc$/);
    expect(value).toBe('1');
    expect(exFlag).toBe('PX');   // Millisecond expiry
    expect(ttl).toBe(5000);
    expect(nxFlag).toBe('NX');   // Only set if not exists
  });
});
