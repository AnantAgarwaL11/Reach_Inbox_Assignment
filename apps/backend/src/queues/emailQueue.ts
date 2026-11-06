import { Queue, QueueEvents } from 'bullmq';
import { bullMQRedis } from '../config/redis';
import { EmailJobPayload } from '../types';

export const EMAIL_QUEUE_NAME = 'email-scheduler';

// The Queue object is used to add jobs (API server side).
// The Worker object (separate process) consumes from the same queue.
// Keeping them in separate processes means you can restart the worker
// without taking down the HTTP API.
export const emailQueue = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, {
  connection: bullMQRedis,
  defaultJobOptions: {
    // If a job fails, retry up to 3 times with exponential backoff.
    // This handles transient SMTP or DB errors without losing the job.
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s → 10s → 20s
    },
    // Keep completed jobs for 24h and failed jobs for 7d for audit and debugging
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

// QueueEvents lets the API server listen for job completion/failure events
// without polling. Used for real-time status updates.
export const emailQueueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
  connection: bullMQRedis,
});

// Helper: schedule a job to run at a specific future time
export async function scheduleEmailJob(
  emailId: string,
  payload: EmailJobPayload,
  scheduledAt: Date
): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  // Using emailId as the jobId makes jobs deduplicated — BullMQ will
  // ignore a second addJob call with the same ID if the job is still
  // in the queue. This is our first line of defence against double-scheduling.
  const job = await emailQueue.add('send-email', payload, {
    jobId: emailId,
    delay,
  });

  return job.id!;
}
