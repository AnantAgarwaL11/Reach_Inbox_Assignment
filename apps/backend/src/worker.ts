import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis, bullMQRedis } from './config/redis';
import { initEmailTransport } from './services/emailSender';
import { ensureEmailIndex } from './services/elasticsearch';
import { createEmailWorker } from './workers/emailWorker';
import { reconcilePendingJobs } from './schedulers/reconciler';
import { logger } from './utils/logger';
import { env } from './config/env';

// ─── Worker Process ───────────────────────────────────────────────────────────
// This process is intentionally separate from the API server so they can be
// scaled and restarted independently.
//
// The worker:
//   1. Connects to PostgreSQL and Redis
//   2. Initialises the SMTP transport
//   3. Runs startup reconciliation (recovers missed jobs)
//   4. Starts the BullMQ worker with configured concurrency

async function startWorker(): Promise<void> {
  logger.info(`Starting email worker (concurrency: ${env.WORKER_CONCURRENCY})...`);

  await connectDatabase();
  await connectRedis();
  await initEmailTransport();

  try {
    await ensureEmailIndex();
  } catch (err) {
    logger.warn('Elasticsearch unavailable — indexing will be skipped', { err });
  }

  // Recover any jobs that were lost due to a previous crash or Redis restart
  await reconcilePendingJobs();

  const worker = createEmailWorker();
  logger.info('Email worker started and ready to process jobs');

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down worker`);

    // Worker.close() waits for the current job to finish before stopping.
    // This prevents cutting a job in the middle of an SMTP operation.
    await worker.close();
    logger.info('Worker closed gracefully');

    await Promise.allSettled([
      disconnectDatabase(),
      disconnectRedis(),
      bullMQRedis.quit(),
    ]);

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection in worker', { reason });
  });
}

startWorker().catch((err) => {
  const e = err as NodeJS.ErrnoException;
  logger.error('Failed to start worker', {
    name: e.name,
    message: e.message,
    code: e.code,
    stack: e.stack,
  });
  process.exit(1);
});
