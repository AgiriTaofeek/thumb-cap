import { Router } from 'express';
import { getStatus as budgetStatus } from '../../cost.js';
const router = Router();
router.get('/:videoId', (req, res) => { const { videoId } = req.params; res.json(budgetStatus(videoId)); });
export default router;
