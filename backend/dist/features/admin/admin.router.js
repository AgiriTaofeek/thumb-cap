import { Router } from 'express';
import { store } from '../../store.js';
const router = Router();
router.post('/cleanup', (req, res) => { const days = Number(process.env.RETENTION_DAYS || 30); const cutoff = Date.now() - days * 24 * 60 * 60 * 1000; let removed = { thumbnails: 0, frames: 0, transcripts: 0 }; for (const [id, t] of Array.from(store.thumbnails.entries())) {
    if (t.createdAt && t.createdAt < cutoff) {
        store.thumbnails.delete(id);
        removed.thumbnails++;
    }
} for (const [id, f] of Array.from(store.frames.entries())) {
    if (f.createdAt && f.createdAt < cutoff) {
        store.frames.delete(id);
        removed.frames++;
    }
} for (const [vid, tr] of Array.from(store.transcripts.entries())) {
    if (tr.createdAt && tr.createdAt < cutoff) {
        store.transcripts.delete(vid);
        removed.transcripts++;
    }
} res.json({ days, removed }); });
export default router;
