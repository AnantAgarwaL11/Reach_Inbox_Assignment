import https from 'https';
import { prisma } from '../config/database';
import { decrypt } from '../utils/encryption';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';

// ─── Slack API Call ───────────────────────────────────────────────────────────
// Using Node's built-in https module to avoid adding a heavy SDK dependency.
// The Slack Web API is straightforward JSON over HTTPS.
async function callSlackApi(
  method: string,
  token: string,
  body: object
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const req = https.request(
      {
        hostname: 'slack.com',
        path: `/api/${method}`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON from Slack API'));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Rate-Limit Notification ──────────────────────────────────────────────────
// We deduplicate notifications per sender per hour to avoid flooding Slack.
// A single Redis key with a 1-hour TTL acts as the deduplication gate.
function notificationDedupeKey(senderId: string): string {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  return `slack_notified:${senderId}:${hourBucket}`;
}

export async function notifySlackRateLimitReached(
  userId: string,
  senderEmail: string,
  senderId: string,
  limit: number,
  rescheduledCount: number
): Promise<void> {
  // Deduplication: only send one notification per sender per hour
  const dedupeKey = notificationDedupeKey(senderId);
  const alreadyNotified = await redisClient.set(dedupeKey, '1', 'EX', 3600, 'NX');
  if (alreadyNotified === null) {
    logger.debug('Slack rate-limit notification already sent this hour', { senderId });
    return;
  }

  // Retrieve the user's Slack integration
  const integration = await prisma.slackIntegration.findUnique({
    where: { userId },
  });

  if (!integration?.connected) {
    // Slack is not connected — skip silently, do not crash
    logger.debug('Slack not connected, skipping notification', { userId });
    return;
  }

  let token: string;
  try {
    token = decrypt(integration.accessToken);
  } catch (err) {
    logger.error('Failed to decrypt Slack token', { userId, err });
    return;
  }

  const message = {
    channel: env.SLACK_NOTIFICATION_CHANNEL,
    text: `⚠️ Sender rate limit reached`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚠️ Hourly send limit reached*\nSender *${senderEmail}* hit its limit of *${limit} emails/hour*.\n*${rescheduledCount}* email(s) have been rescheduled to the next window.`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Rescheduled at: ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };

  try {
    const result = await callSlackApi('chat.postMessage', token, message);
    if (!result.ok) {
      logger.warn('Slack API returned an error', { error: result.error });
    } else {
      logger.info('Slack notification sent', { senderEmail, limit, rescheduledCount });
    }
  } catch (err) {
    // Slack notification failures must never affect email processing
    logger.error('Failed to send Slack notification', { err });
  }
}
