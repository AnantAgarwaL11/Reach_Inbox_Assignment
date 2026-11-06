import { z } from 'zod';
import dotenv from 'dotenv';

import path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '../../../../.env')
});

// Validate every required variable at startup.
// The app will crash immediately with a clear message rather than
// failing silently later when the missing value is first used.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_CALLBACK_URL: z.string().url(),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_CALLBACK_URL: z.string().default('http://localhost:3001/api/slack/callback'),
  SLACK_NOTIFICATION_CHANNEL: z.string().default('#email-alerts'),

  ETHEREAL_USER: z.string().default(''),
  ETHEREAL_PASS: z.string().default(''),

  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  // 32-hex-character key for AES-256 encryption of Slack tokens
  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 characters'),

  BULL_BOARD_USERNAME: z.string().default('admin'),
  BULL_BOARD_PASSWORD: z.string().default('admin_secret'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
