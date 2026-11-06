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
let initializationStarted = false;

function configureTransport(account: { user: string; pass: string }): void {
  const configuredTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });
  transporter = configuredTransporter;

  logger.debug('Verifying SMTP connection to smtp.ethereal.email:587…');
  void configuredTransporter.verify().then(() => {
    logger.info('Ethereal SMTP transport ready');
  }).catch((err: unknown) => {
    logger.warn('SMTP verification failed; the API will remain available and email sends may fail until SMTP is available', { err });
  });
}

// Configure SMTP in the background so outbound provider delays cannot prevent
// the API from opening its HTTP port.
export function initEmailTransport(): Promise<void> {
  if (initializationStarted) return Promise.resolve();
  initializationStarted = true;

  if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
    logger.info('Using configured Ethereal account', { user: env.ETHEREAL_USER });
    configureTransport({ user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASS });
    return Promise.resolve();
  }

  logger.debug('Attempting to create Ethereal test account via nodemailer.createTestAccount()…');
  void nodemailer.createTestAccount().then((account) => {
    logger.info('Created new Ethereal test account', { user: account.user });
    logger.info('Set ETHEREAL_USER and ETHEREAL_PASS to reuse this account across restarts.');
    configureTransport(account);
  }).catch((err: unknown) => {
    logger.warn('Could not create an Ethereal test account; the API will remain available but email sending is unavailable', { err });
  });

  return Promise.resolve();
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
