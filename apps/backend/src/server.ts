import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { initEmailTransport } from './services/emailSender';
import { ensureEmailIndex } from './services/elasticsearch';
import { logger } from './utils/logger';

// ─── Startup Sequence ─────────────────────────────────────────────────────────
// Order matters:
//   1. Database (Prisma needs to connect before any query)
//   2. Redis (needed for sessions and queues)
//   3. Start SMTP and Elasticsearch initialization without blocking the API
//   4. HTTP server

async function start(): Promise<void> {
  logger.info('Starting ReachInbox API server...');

  await connectDatabase();
  logger.info('PostgreSQL connected');

  await connectRedis();
  logger.info('Redis connected');

  await initEmailTransport();

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`API server listening on port ${port}`);
    logger.info(`Bull Board: http://localhost:${port}/admin/queues`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });

  void ensureEmailIndex().catch((err) => {
    logger.warn('Elasticsearch unavailable at startup — email indexing may be delayed', { err });
  });

  // ─── Graceful Shutdown ────────────────────────────────────────────────────
  // On SIGTERM/SIGINT (Docker stop, Ctrl+C, process manager):
  //   1. Stop accepting new HTTP connections
  //   2. Wait for in-flight requests to complete
  //   3. Close database and Redis connections cleanly
  //
  // This prevents connection pool exhaustion and ensures in-flight requests
  // complete before the process exits.
  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — starting graceful shutdown`);

    server.close(async () => {
      logger.info('HTTP server closed');

      await Promise.allSettled([
        disconnectDatabase(),
        disconnectRedis(),
      ]);

      logger.info('Connections closed — exiting');
      process.exit(0);
    });

    // Force exit after 10s if something hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — force exiting');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled promise rejections — log them rather than crashing silently
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });
}

start().catch((err) => {
  const e = err as NodeJS.ErrnoException;
  logger.error('Failed to start server', {
    name: e.name,
    message: e.message,
    code: e.code,
    stack: e.stack,
  });
  process.exit(1);
});
