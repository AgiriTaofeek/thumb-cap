import { Router } from 'express';
import { isUnsafeVideo } from '../shared/pipeline.service.js';
const router = Router();
router.post('/:videoId/check', (req, res) => { const { videoId } = req.params; const unsafe = isUnsafeVideo(videoId); res.json({ unsafe }); });
export default router;
