import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { sendSuccess, sendError } from '../utils/apiResponse';

const createSenderSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  hourlyLimit: z.number().int().min(1).max(10000).default(200),
  minimumSendDelay: z.number().int().min(0).max(60000).default(2000),
});

const updateSenderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  hourlyLimit: z.number().int().min(1).max(10000).optional(),
  minimumSendDelay: z.number().int().min(0).max(60000).optional(),
});

export async function listSenders(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const senders = await prisma.sender.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, senders);
  } catch (err) {
    next(err);
  }
}

export async function createSender(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const data = createSenderSchema.parse(req.body);

    const sender = await prisma.sender.create({
      data: { ...data, userId },
    });

    sendSuccess(res, sender, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateSender(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const data = updateSenderSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.sender.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) return sendError(res, 'Sender not found', 404);

    const sender = await prisma.sender.update({
      where: { id: req.params.id },
      data,
    });

    sendSuccess(res, sender);
  } catch (err) {
    next(err);
  }
}

export async function deleteSender(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    const existing = await prisma.sender.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) return sendError(res, 'Sender not found', 404);

    await prisma.sender.delete({ where: { id: req.params.id } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}
