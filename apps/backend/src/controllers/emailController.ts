import { Request, Response, NextFunction } from 'express';
import { scheduleEmails, scheduleEmailSchema } from '../services/emailScheduler';
import {
  listEmailsByStatus,
  listAllEmails,
  findEmailById,
  softDeleteEmail,
  getDashboardStats,
} from '../repositories/emailRepository';
import { searchEmails } from '../services/elasticsearch';
import { emailQueue } from '../queues/emailQueue';
import { sendSuccess, sendError, paginationMeta } from '../utils/apiResponse';
import { EmailStatus } from '../types';

export async function scheduleEmailsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const input = scheduleEmailSchema.parse(req.body);
    const result = await scheduleEmails(userId, input);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function getScheduledEmails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);

    const { emails, total } = await listEmailsByStatus(
      userId,
      EmailStatus.SCHEDULED,
      page,
      pageSize
    );

    sendSuccess(res, emails, 200, paginationMeta(page, pageSize, total));
  } catch (err) {
    next(err);
  }
}

export async function getSentEmails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);

    const { emails, total } = await listEmailsByStatus(
      userId,
      EmailStatus.SENT,
      page,
      pageSize
    );

    sendSuccess(res, emails, 200, paginationMeta(page, pageSize, total));
  } catch (err) {
    next(err);
  }
}

export async function getAllEmails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);

    const { emails, total } = await listAllEmails(userId, page, pageSize);
    sendSuccess(res, emails, 200, paginationMeta(page, pageSize, total));
  } catch (err) {
    next(err);
  }
}

export async function getEmailById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const email = await findEmailById(req.params.id, req.user!.id);
    if (!email) return sendError(res, 'Email not found', 404);
    sendSuccess(res, email);
  } catch (err) {
    next(err);
  }
}

export async function cancelEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const email = await softDeleteEmail(req.params.id, req.user!.id);
    if (!email) return sendError(res, 'Email not found or cannot be cancelled', 404);

    // Also remove the job from the queue if it exists
    const job = await emailQueue.getJob(req.params.id);
    if (job) await job.remove();

    sendSuccess(res, { cancelled: true });
  } catch (err) {
    next(err);
  }
}

export async function searchEmailsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { q, status, senderId, page, pageSize } = req.query;

    const result = await searchEmails(userId, {
      q: q as string | undefined,
      status: status as EmailStatus | undefined,
      senderId: senderId as string | undefined,
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 20, 100),
    });

    sendSuccess(res, result.emails, 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getDashboardStatsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getDashboardStats(req.user!.id);
    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}
