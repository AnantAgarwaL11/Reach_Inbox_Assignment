import { Router, Request, Response } from 'express';
import multer from 'multer';
import passport from 'passport';
import { requireAuth } from '../middleware/auth';
import {
  scheduleEmailsHandler,
  getScheduledEmails,
  getSentEmails,
  getAllEmails,
  getEmailById,
  cancelEmail,
  searchEmailsHandler,
  getDashboardStatsHandler,
} from '../controllers/emailController';
import {
  listSenders,
  createSender,
  updateSender,
  deleteSender,
} from '../controllers/senderController';
import {
  connectSlack,
  slackCallback,
  disconnectSlack,
  getSlackStatus,
} from '../controllers/slackController';
import { parseUploadedFile } from '../controllers/uploadController';
import { env } from '../config/env';
import { sendSuccess } from '../utils/apiResponse';

const router = Router();

// Multer: store uploaded files in memory (max 5MB)
// Files are streamed through the CSV parser without touching disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'text/plain', 'application/csv'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/api/health', (_req, res) => {
  sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
router.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${env.FRONTEND_URL}/login?error=oauth_failed` }),
  (_req, res) => res.redirect(`${env.FRONTEND_URL}/dashboard`)
);

router.post('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    sendSuccess(res, { loggedOut: true });
  });
});

router.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
  sendSuccess(res, req.user);
});

// ─── Emails ───────────────────────────────────────────────────────────────────
router.post('/api/emails/schedule', requireAuth, scheduleEmailsHandler);
router.get('/api/emails/scheduled', requireAuth, getScheduledEmails);
router.get('/api/emails/sent', requireAuth, getSentEmails);
router.get('/api/emails/search', requireAuth, searchEmailsHandler);
router.get('/api/emails/stats', requireAuth, getDashboardStatsHandler);
router.get('/api/emails', requireAuth, getAllEmails);
router.get('/api/emails/:id', requireAuth, getEmailById);
router.delete('/api/emails/:id', requireAuth, cancelEmail);

// ─── Senders ──────────────────────────────────────────────────────────────────
router.get('/api/senders', requireAuth, listSenders);
router.post('/api/senders', requireAuth, createSender);
router.put('/api/senders/:id', requireAuth, updateSender);
router.delete('/api/senders/:id', requireAuth, deleteSender);

// ─── Slack ────────────────────────────────────────────────────────────────────
router.get('/api/slack/connect', requireAuth, connectSlack);
router.get('/api/slack/callback', slackCallback);
router.delete('/api/slack/disconnect', requireAuth, disconnectSlack);
router.get('/api/slack/status', requireAuth, getSlackStatus);

// ─── File Upload ──────────────────────────────────────────────────────────────
router.post('/api/upload/recipients', requireAuth, upload.single('file'), parseUploadedFile);

export default router;
