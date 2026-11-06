import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface SendEmailOptions {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  messageId: string;
  previewUrl: string | null;
}

let transporter: Transporter | null = null;
let testAccount: { user: string; pass: string } | null = null;

// Initialise the SMTP transport once at startup.
// If ETHEREAL_USER/PASS are set in .env we reuse that account across restarts,
// which is useful because Ethereal preview URLs stay valid indefinitely.
// If not set, we create a fresh test account automatically.
export async function initEmailTransport(): Promise<void> {
  try {
    if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
      testAccount = { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASS };
      logger.info('Using configured Ethereal account', { user: testAccount.user });
    } else {
      // ── Diagnostic checkpoint 1: outbound HTTPS to Ethereal API ──────────────
      logger.debug('Attempting to create Ethereal test account via nodemailer.createTestAccount()…');
      try {
        testAccount = await nodemailer.createTestAccount();
      } catch (createErr) {
        const e = createErr as NodeJS.ErrnoException;
        logger.error('nodemailer.createTestAccount() failed — outbound HTTPS to Ethereal API may be blocked', {
          name: e.name,
          message: e.message,
          code: e.code,
          stack: e.stack,
        });
        throw createErr;
      }
      // ── Diagnostic checkpoint 2: account created — log username only ─────────
      logger.info('Created new Ethereal test account', { user: testAccount.user });
      // NOTE: ETHEREAL_PASS is intentionally NOT logged to prevent credential leakage.
      logger.info('Add ETHEREAL_USER and ETHEREAL_PASS to your .env to reuse this account across restarts.');
    }

    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // TLS via STARTTLS
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    // ── Diagnostic checkpoint 3: SMTP STARTTLS handshake ─────────────────────
    logger.debug('Verifying SMTP connection to smtp.ethereal.email:587…');
    try {
      await transporter.verify();
    } catch (verifyErr) {
      const e = verifyErr as NodeJS.ErrnoException;
      logger.error('transporter.verify() failed — SMTP connection or authentication error', {
        name: e.name,
        message: e.message,
        code: e.code,
        // responseCode is set by nodemailer when the SMTP server replies with an error
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseCode: (e as any).responseCode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: (e as any).response,
        stack: e.stack,
      });
      throw verifyErr;
    }

    logger.info('Ethereal SMTP transport ready');
  } catch (err) {
    // Re-throw so server.ts / worker.ts can log it and exit cleanly.
    // Individual catch blocks above already logged the specific failure.
    throw err;
  }
}


export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!transporter) {
    throw new Error('Email transport not initialised — call initEmailTransport() first');
  }

  const info = await transporter.sendMail({
    from: `"${options.fromName}" <${options.from}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  // nodemailer.getTestMessageUrl() returns null for real SMTP providers
  // and a preview URL for Ethereal. We always capture it when available.
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  if (previewUrl) {
    logger.info('Email sent — preview at:', { previewUrl });
  }

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
