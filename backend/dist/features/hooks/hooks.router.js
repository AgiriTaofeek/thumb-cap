import { Router } from 'express';
import { addRun, startPipeline } from '../shared/pipeline.service.js';
const router = Router();
router.post('/pubsub', (req, res) => { const body = req.body || {}; const tokenEnv = process.env.PUBSUB_TOKEN || null; const tokenAttr = body.message && body.message.attributes && body.message.attributes.token; const tokenHeader = req.headers['x-pubsub-token']; if (tokenEnv && tokenEnv !== (tokenAttr || tokenHeader || null))
    return res.status(403).json({ error: 'invalid token' }); let payload = body; if (body.message && body.message.data) {
    try {
        const json = Buffer.from(String(body.message.data), 'base64').toString('utf8');
        payload = JSON.parse(json);
    }
    catch {
        return res.status(400).json({ error: 'bad pubsub data' });
    }
} const type = payload && payload.type; const videoId = payload && payload.videoId; const now = Date.now(); if (videoId)
    addRun(videoId, 'pubsub_received', 'completed', now, now); if (type === 'video_uploaded' && videoId)
    setTimeout(() => startPipeline(videoId), 10); res.status(204).end(); });
export default router;
