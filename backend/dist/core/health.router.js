import { Router } from 'express';
import { log } from '../logger.js';
const router = Router();
router.get('/health', (req, res) => { log('info', 'health', { reqId: req.id }); res.json({ status: 'ok' }); });
export default router;
