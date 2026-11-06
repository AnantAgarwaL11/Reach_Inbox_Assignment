import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/apiResponse';

// Passport.js serialises the user into the session and deserialises it
// on each request. req.isAuthenticated() returns true when the session
// contains a valid user object.

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  sendError(res, 'Authentication required', 401);
}

// Use this on routes that should work whether or not the user is logged in,
// but want to know who they are if they are.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  next();
}
