import { Request, Response, NextFunction } from 'express';
import https from 'https';
import { prisma } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import { env } from '../config/env';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { logger } from '../utils/logger';

function slackApiPost(path: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const payload = body.toString();
    const req = https.request(
      {
        hostname: 'slack.com',
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON from Slack')); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export function connectSlack(req: Request, res: Response): void {
  if (!env.SLACK_CLIENT_ID) {
    sendError(res, 'Slack integration is not configured', 501);
    return;
  }

  // State parameter prevents CSRF on the OAuth callback
  const state = Buffer.from(JSON.stringify({ userId: req.user!.id })).toString('base64');

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'chat:write,channels:read',
    redirect_uri: env.SLACK_CALLBACK_URL,
    state,
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
}

export async function slackCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${env.FRONTEND_URL}/settings?slack_error=${error}`);
    }

    // Decode and validate state
    const decoded = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const userId = decoded.userId as string;

    // Exchange code for access token
    const tokenResponse = await slackApiPost(
      '/api/oauth.v2.access',
      new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code: code as string,
        redirect_uri: env.SLACK_CALLBACK_URL,
      })
    );

    if (!tokenResponse.ok) {
      logger.error('Slack OAuth failed', { error: tokenResponse.error });
      return res.redirect(`${env.FRONTEND_URL}/settings?slack_error=oauth_failed`);
    }

    const accessToken = tokenResponse.access_token as string;
    const teamId = (tokenResponse.team as { id: string }).id;
    const teamName = (tokenResponse.team as { name: string }).name;

    // Encrypt the token before storing
    await prisma.slackIntegration.upsert({
      where: { userId },
      update: {
        accessToken: encrypt(accessToken),
        teamId,
        teamName,
        connected: true,
      },
      create: {
        userId,
        accessToken: encrypt(accessToken),
        teamId,
        teamName,
        connected: true,
      },
    });

    res.redirect(`${env.FRONTEND_URL}/settings?slack_connected=true`);
  } catch (err) {
    next(err);
  }
}

export async function disconnectSlack(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await prisma.slackIntegration.updateMany({
      where: { userId: req.user!.id },
      data: { connected: false },
    });
    sendSuccess(res, { disconnected: true });
  } catch (err) {
    next(err);
  }
}

export async function getSlackStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const integration = await prisma.slackIntegration.findUnique({
      where: { userId: req.user!.id },
    });

    sendSuccess(res, {
      connected: integration?.connected ?? false,
      teamName: integration?.teamName ?? null,
    });
  } catch (err) {
    next(err);
  }
}
