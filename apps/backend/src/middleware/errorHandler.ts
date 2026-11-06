import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

// Express error handlers have 4 parameters. TypeScript/ESLint will complain
// about unused `_next` but it's required for Express to treat this as an
// error handler rather than a regular middleware.
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Zod validation errors → 400 Bad Request with field-level detail
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Known application errors with a status code attached
  const status = (err as { status?: number }).status ?? 500;

  if (status < 500) {
    res.status(status).json({ success: false, error: err.message });
    return;
  }

  // Unexpected server errors — log the stack and return a safe message
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again.',
  });
}
