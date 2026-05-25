import { Router } from 'express';
import { logController } from '../controllers/log.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication (except in debug mode)
router.get('/', authMiddleware, logController.getLogs);

export default router;