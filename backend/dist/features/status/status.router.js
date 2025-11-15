import { Router } from 'express';
import { store } from '../../store.js';
const router = Router();
router.get('/:videoId', (req, res) => { const { videoId } = req.params; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const runs = Array.from(store.workflowRuns.values()).filter(r => r.videoId === videoId); res.json({ video, runs }); });
router.get('/:videoId/stream', (req, res) => { const { videoId } = req.params; res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); const send = () => { const video = store.videos.get(videoId); if (!video) {
    res.write('event: error\n');
    res.write('data: ' + JSON.stringify({ error: 'video not found' }) + '\n\n');
    return;
} const runs = Array.from(store.workflowRuns.values()).filter(r => r.videoId === videoId); const payload = { video, runs, ts: Date.now() }; res.write('data: ' + JSON.stringify(payload) + '\n\n'); }; const iv = setInterval(send, 1000); req.on('close', () => clearInterval(iv)); send(); });
export default router;
