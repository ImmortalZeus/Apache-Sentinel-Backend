import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token;

  if (!token) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  next();
}

export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}
