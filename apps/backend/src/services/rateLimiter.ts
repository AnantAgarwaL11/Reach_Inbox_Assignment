import { redisClient } from '../config/redis';
import { RateLimitResult } from '../types';

// ─── Why a Lua script? ────────────────────────────────────────────────────────
//
// The naive approach is: GET count → if count < limit → INCR → proceed.
// This is a classic TOCTOU (time-of-check/time-of-use) race condition.
// Two workers can both read count=199, both decide it's under limit=200,
// and both increment — resulting in 201 sends that hour.
//
// A Lua script runs atomically inside Redis. No other command can execute
// between the GET and the INCR. This eliminates the race condition entirely,
// regardless of how many worker processes are running.
//
// The script:
//   1. Gets the current counter (or 0 if it doesn't exist)
//   2. If already at or over the limit → return the current count with allowed=0
//   3. Otherwise → INCR and set a TTL of 3600s on the first increment
//   4. Return the new count with allowed=1
// ─────────────────────────────────────────────────────────────────────────────

const RATE_LIMIT_LUA = `
local key   = KEYS[1]
local limit = tonumber(ARGV[1])
local now   = tonumber(ARGV[2])

local current = tonumber(redis.call('GET', key) or '0')

if current >= limit then
  -- Already at the limit. Calculate when this window resets (TTL from now).
  local ttl = tonumber(redis.call('TTL', key))
  local resetsAt = now + (ttl > 0 and ttl or 3600)
  return { 0, current, resetsAt }
end

local newCount = redis.call('INCR', key)

if newCount == 1 then
  -- First increment in this window → set TTL to end of hour
  redis.call('EXPIRE', key, 3600)
end

local ttl = tonumber(redis.call('TTL', key))
local resetsAt = now + (ttl > 0 and ttl or 3600)

return { 1, newCount, resetsAt }
`;

// Key format: rate_limit:{senderId}:{hourBucket}
// Using an hourly bucket (floored to the hour) means limits reset at the
// top of each clock hour rather than on a rolling 60-minute window.
// Rolling windows are more accurate but significantly more complex to
// implement atomically in Redis. Clock-hour buckets are the right trade-off
// for a first production implementation.
function rateLimitKey(senderId: string): string {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  return `rate_limit:${senderId}:${hourBucket}`;
}

export async function checkAndIncrementRateLimit(
  senderId: string,
  limit: number
): Promise<RateLimitResult> {
  const key = rateLimitKey(senderId);
  const nowSeconds = Math.floor(Date.now() / 1000);

  // EVAL executes the Lua script atomically.
  // KEYS and ARGV are explicitly separated — a Redis cluster requirement
  // that also makes the script's intent clearer.
  const result = await redisClient.eval(
    RATE_LIMIT_LUA,
    1,         // numkeys
    key,       // KEYS[1]
    limit,     // ARGV[1]
    nowSeconds // ARGV[2]
  ) as [number, number, number];

  const [allowed, current, resetsAt] = result;

  return {
    allowed: allowed === 1,
    current,
    limit,
    resetsAt,
  };
}

// Get the current count without incrementing — used for display/status
export async function getRateLimitStatus(
  senderId: string,
  limit: number
): Promise<RateLimitResult> {
  const key = rateLimitKey(senderId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = await redisClient.ttl(key);
  const current = parseInt((await redisClient.get(key)) ?? '0', 10);

  return {
    allowed: current < limit,
    current,
    limit,
    resetsAt: nowSeconds + (ttl > 0 ? ttl : 3600),
  };
}

// Get the timestamp when the next hourly window opens
export function getNextWindowStart(): Date {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  return new Date((hourBucket + 1) * 3_600_000);
}
