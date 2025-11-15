import { Router } from 'express';
import { store } from '../../store.js';
const router = Router();
router.get('/', (req, res) => { const list = Array.from(store.videos.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); res.json({ videos: list }); });
router.get('/:videoId/summary', (req, res) => { const { videoId } = req.params; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const frames = Array.from(store.frames.values()).filter(f => f.videoId === videoId); const thumbnails = Array.from(store.thumbnails.values()).filter(t => t.videoId === videoId); const captions = Array.from(store.captions.values()).filter(c => c.videoId === videoId); const runs = Array.from(store.workflowRuns.values()).filter(r => r.videoId === videoId); const recThumb = thumbnails.slice().sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0))[0] || null; res.json({ video, frames, thumbnails, captions, runs, recommendedThumbnail: recThumb }); });
export default router;
