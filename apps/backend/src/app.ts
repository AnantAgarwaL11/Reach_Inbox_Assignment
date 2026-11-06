import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import rateLimit from 'express-rate-limit';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import passport from 'passport';
import { env } from './config/env';
import { redisClient } from './config/redis';
import { emailQueue } from './queues/emailQueue';
import routes from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import './integrations/googleOAuth'; // Side-effect: registers passport strategy

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Bull Board's UI uses inline scripts
}));

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true, // Required for session cookies across origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Session (Redis-backed) ───────────────────────────────────────────────────
// Using Redis as the session store means sessions persist across server restarts
// and work correctly when running multiple API server instances.
const redisStore = new RedisStore({
  // connect-redis v7 accepts ioredis clients directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: redisClient as any,
  prefix: 'sess:',
});

app.use(
  session({
    store: redisStore,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,  // Not accessible from JavaScript
      secure: env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ─── Passport ─────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ─── Bull Board ───────────────────────────────────────────────────────────────
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(createBullBoard as any)({
  queues: [new BullMQAdapter(emailQueue as any)],
  serverAdapter,
});

// Protect the Bull Board dashboard with HTTP Basic Auth
app.use(
  '/admin/queues',
  (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="Bull Board"');
      return res.status(401).send('Authentication required');
    }

    const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64')
      .toString()
      .split(':');

    if (user === env.BULL_BOARD_USERNAME && pass === env.BULL_BOARD_PASSWORD) {
      return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Bull Board"');
    res.status(401).send('Invalid credentials');
  },
  serverAdapter.getRouter()
);

// ─── Application Routes ───────────────────────────────────────────────────────
app.use(routes);

// ─── Centralised Error Handler ────────────────────────────────────────────────
// Must be registered after all routes — Express identifies error handlers
// by their 4-parameter signature (err, req, res, next)
app.use(errorHandler);

export default app;
