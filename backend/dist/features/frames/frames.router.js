import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store.js';
import { addRun } from '../shared/pipeline.service.js';
const router = Router();
router.get('/:videoId', (req, res) => { const { videoId } = req.params; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const list = Array.from(store.frames.values()).filter(f => f.videoId === videoId); res.json({ frames: list }); });
router.post('/:videoId/extract', (req, res) => { const { videoId } = req.params; const { frequencySec, mode } = req.body || {}; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const count = 5; const now = Date.now(); const frames = []; for (let i = 0; i < count; i++) {
    const id = uuidv4();
    const uri = `memory://frame/${id}`;
    const rec = { frameId: id, videoId, gcsUri: uri, createdAt: now + i * 10 };
    store.frames.set(id, rec);
    frames.push(rec);
} addRun(videoId, 'frame_extraction', 'completed', now, now + 50); res.json({ frames, frequencySec: frequencySec || 5, mode: mode || 'interval' }); });
export default router;
