import { redisClient } from '../config/redis';

// ─── Why Redis and not setTimeout? ───────────────────────────────────────────
//
// With WORKER_CONCURRENCY=5 and multiple worker processes, five jobs for the
// same sender could all call setTimeout(2000) simultaneously and all pass.
// In-memory timers provide no cross-process coordination.
//
// Instead, after a successful send we write a Redis key with a TTL equal to
// the minimum delay. Any worker trying to send from the same sender during
// that window finds the key present and must wait.
//
// Algorithm:
//   1. Try SET key "" NX PX <delay_ms>
//      - NX = only set if the key does NOT exist
//      - PX = key expiry in milliseconds
//   2. If SET succeeds → no recent send from this sender → proceed
//   3. If SET fails → another worker just sent → wait until the key expires
// ─────────────────────────────────────────────────────────────────────────────

function delayKey(senderId: string): string {
  return `send_delay:${senderId}`;
}

// Returns true if we acquired the slot (safe to send),
// false if the sender is in a cooldown window.
export async function acquireSendSlot(
  senderId: string,
  delayMs: number
): Promise<boolean> {
  if (delayMs <= 0) return true;

  // SET NX PX — the atomic "set if not exists with expiry" primitive.
  // Redis guarantees this is atomic, so two workers cannot both succeed.
  const result = await redisClient.set(
    delayKey(senderId),
    '1',
    'PX',
    delayMs,
    'NX'
  );

  // 'OK' means the key was set (we got the slot)
  // null means the key already existed (another worker is in the cooldown window)
  return result === 'OK';
}

// How many milliseconds remain in the cooldown window, 0 if none
export async function remainingDelay(senderId: string): Promise<number> {
  const pttl = await redisClient.pttl(delayKey(senderId));
  return pttl > 0 ? pttl : 0;
}
