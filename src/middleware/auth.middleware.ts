import { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Check if debug mode is enabled
  const debugMode = process.env.DEBUG_MODE === 'true';

  // If debug mode is true, skip authentication
  if (debugMode) {
    return next();
  }

  // Check for API key in headers
  const apiKey = req.headers['x-api-key'] as string;

  // Validate API key
  const expectedApiKey = process.env.ADMIN_API_KEY;

  if (!expectedApiKey) {
    // If no API key is configured, deny access for security
    return res.status(500).json({
      error: 'Server configuration error: ADMIN_API_KEY not set'
    });
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing API key'
    });
  }

  // API key is valid, proceed to next middleware
  next();
};