import { Router, Request, Response } from 'express';
import { validateCredentials, generateToken, userExists, createUser } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ message: 'Username and password required' });
      return;
    }

    const user = await validateCredentials(username, password);
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = generateToken(user);

    // Set httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ username: req.user?.username, role: req.user?.role });
});

// POST /api/auth/seed (dev only - creates admin if not exists)
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    const exists = await userExists('admin');
    if (exists) {
      res.json({ message: 'Admin already exists' });
      return;
    }

    await createUser('admin', 'admin', 'admin');
    res.json({ message: 'Admin created' });
  } catch (error) {
    console.error('[Auth] Seed error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
