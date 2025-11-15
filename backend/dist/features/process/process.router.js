import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store.js';
import { publishMessage, enabled as pubsubEnabled } from '../../pubsub.js';
import { retry } from '../../retry.js';
import { startPipeline, addRun } from '../shared/pipeline.service.js';
import { log } from '../../logger.js';
const router = Router();
router.post('/', (req, res) => {
    const { videoId, gcsUri, title, language } = req.body || {};
    log('info', 'process.start', { reqId: req.id, gcsUri, title, language });
    if (!gcsUri || !title)
        return res.status(400).json({ error: 'gcsUri and title are required' });
    const id = videoId || uuidv4();
    const now = Date.now();
    store.videos.set(id, { id, userId: null, status: 'queued', gcsUri, title, language: language || 'en', createdAt: now });
    const runId = uuidv4();
    addRun(id, 'uploading', 'completed', now, now);
    store.workflowRuns.set(uuidv4(), { runId: uuidv4(), videoId: id, step: 'extracting_frames', status: 'pending', startedAt: now, completedAt: null });
    if (pubsubEnabled)
        retry(() => publishMessage({ type: 'video_uploaded', videoId: id, gcsUri, title, language: language || 'en' }), { retries: 2, baseMs: 300 }).catch(() => { });
    res.json({ videoId: id });
    setTimeout(() => startPipeline(id), 10);
});
export default router;
