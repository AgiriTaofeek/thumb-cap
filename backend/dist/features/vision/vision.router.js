import { Router } from 'express';
import { store } from '../../store.js';
import { analyzeUri } from '../../vision.js';
import { check as budgetCheck, commit as budgetCommit } from '../../cost.js';
const router = Router();
router.post('/:videoId/analyze', async (req, res) => { const { videoId } = req.params; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const list = Array.from(store.thumbnails.values()).filter(t => t.videoId === videoId); const bcVis = budgetCheck(videoId, 'vision_analysis', list.length || 1); if (!bcVis.allowed)
    return res.status(429).json({ error: 'budget exceeded', reason: bcVis.reason, remaining: bcVis.remaining }); const results = []; for (const t of list) {
    const vf = await analyzeUri(t.gcsUri);
    const updated = { ...t, visionFeatures: vf };
    store.thumbnails.set(t.variantId, updated);
    results.push(updated);
} budgetCommit(videoId, 'vision_analysis', list.length || 1); res.json({ variants: results }); });
export default router;
