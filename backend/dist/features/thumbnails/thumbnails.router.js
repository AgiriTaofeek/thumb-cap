import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store.js';
import { scoreThumbnail, words } from '../shared/pipeline.service.js';
import { check as budgetCheck, commit as budgetCommit } from '../../cost.js';
import { enabled as vertexEnabled, predictCTR } from '../../prediction.js';
const router = Router();
router.post('/:videoId/generate', (req, res) => { const { videoId } = req.params; const { sourceFrameUri } = req.body || {}; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const styles = ['preset-1', 'preset-2', 'preset-3', 'preset-4', 'preset-5']; const bcGen = budgetCheck(videoId, 'imagen_gen', styles.length); if (!bcGen.allowed)
    return res.status(429).json({ error: 'budget exceeded', reason: bcGen.reason, remaining: bcGen.remaining }); const variants = styles.map(style => { const id = uuidv4(); const uri = sourceFrameUri || `memory://frame/${id}`; const rec = { videoId, variantId: id, style, gcsUri: uri, visionFeatures: null, ctrScore: null, imageData: null, createdAt: Date.now() }; store.thumbnails.set(id, rec); return rec; }); budgetCommit(videoId, 'imagen_gen', styles.length); res.json({ variants }); });
router.post('/:videoId/score', async (req, res) => { const { videoId } = req.params; const { title, keywords } = req.body || {}; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const list = Array.from(store.thumbnails.values()).filter(t => t.videoId === videoId); if (!list.length)
    return res.status(400).json({ error: 'no thumbnails to score' }); const bcPred = budgetCheck(videoId, 'prediction', 1); if (!bcPred.allowed)
    return res.status(429).json({ error: 'budget exceeded', reason: bcPred.reason, remaining: bcPred.remaining }); const scored = await Promise.all(list.map(async (t) => { const ctr = vertexEnabled ? await predictCTR({ style: t.style || 'custom', titleTokens: words(title || video.title), faces: (t.visionFeatures && (t.visionFeatures.faces || 0)) || 0, colors: (t.visionFeatures && t.visionFeatures.dominantColors) || [] }) : scoreThumbnail(t.style || 'custom', title || video.title, keywords || []); const updated = { ...t, ctrScore: ctr }; store.thumbnails.set(t.variantId, updated); return updated; })); scored.sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0)); const winner = scored[0]; budgetCommit(videoId, 'prediction', 1); res.json({ winner, variants: scored }); });
router.get('/:videoId', (req, res) => { const { videoId } = req.params; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const list = Array.from(store.thumbnails.values()).filter(t => t.videoId === videoId); res.json({ variants: list }); });
export default router;
