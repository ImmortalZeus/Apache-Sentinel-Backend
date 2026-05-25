import { Router } from 'express';
import { blockedIPController } from '../controllers/blocked.ip.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication (except in debug mode)
router.get('/', authMiddleware, blockedIPController.getBlockedIPs);
router.post('/block', authMiddleware, blockedIPController.blockIP);
router.post('/unblock', authMiddleware, blockedIPController.unblockIP);

export default router;