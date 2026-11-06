import IORedis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

// BullMQ requires its own IORedis connection — it sets specific options
// (enableReadyCheck, maxRetriesPerRequest) that conflict with how ioredis
// handles general-purpose use. We therefore keep two clients:
//   - redisClient  → general use (rate limiting, distributed locks, session)
//   - bullMQRedis  → dedicated BullMQ connection

function createClient(name: string): IORedis {
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ; harmless for general use
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on('connect', () => logger.info(`Redis [${name}] connected`));
  client.on('error', (err) => logger.error(`Redis [${name}] error`, { err }));
  client.on('close', () => logger.warn(`Redis [${name}] connection closed`));

  return client;
}

export const redisClient = createClient('main');

// BullMQ needs its own dedicated connection per the library docs.
// Using the same connection for both would cause subtle failures.
export const bullMQRedis = createClient('bullmq');

export async function connectRedis(): Promise<void> {
  // ioredis clients are module-level singletons. Under ts-node-dev hot-reload
  // the module cache is preserved across restarts, so a client whose status is
  // already 'ready' or 'connecting' must NOT call connect() again — it throws
  // "Redis is already connecting/connected".
  const needsConnect = (client: IORedis) =>
    client.status !== 'ready' && client.status !== 'connecting';

  await Promise.all([
    needsConnect(redisClient) ? redisClient.connect() : Promise.resolve(),
    needsConnect(bullMQRedis) ? bullMQRedis.connect() : Promise.resolve(),
  ]);
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all([redisClient.quit(), bullMQRedis.quit()]);
}
