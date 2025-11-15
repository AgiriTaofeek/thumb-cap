import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store.js';
import { scoreCaption, words } from '../shared/pipeline.service.js';
import { check as budgetCheck, commit as budgetCommit } from '../../cost.js';
const router = Router();
router.post('/:videoId/generate', (req, res) => { const { videoId } = req.params; const { transcript, keywords } = req.body || {}; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); if (!transcript)
    return res.status(400).json({ error: 'transcript is required' }); const bcCap = budgetCheck(videoId, 'caption_gen', 3); if (!bcCap.allowed)
    return res.status(429).json({ error: 'budget exceeded', reason: bcCap.reason, remaining: bcCap.remaining }); const k = Array.isArray(keywords) ? keywords : words(String(keywords || '')).slice(0, 6); const base = transcript.trim(); const seo = `${base} ${k.slice(0, 5).join(' ')}`.trim(); const hook = `Watch now: ${base}`; const friendly = `In this video: ${base}`; const variants = [{ type: 'SEO', text: seo }, { type: 'Hook', text: hook }, { type: 'Friendly', text: friendly }].map(v => { const s = scoreCaption(v.text, k); const id = uuidv4(); const rec = { videoId, variantId: id, type: v.type, text: v.text, seoScore: s.seoScore, engagementScore: s.engagementScore, translations: null }; store.captions.set(id, rec); return rec; }); budgetCommit(videoId, 'caption_gen', 3); res.json({ variants }); });
router.post('/:videoId/score', (req, res) => { const { videoId } = req.params; const { keywords } = req.body || {}; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const k = Array.isArray(keywords) ? keywords : words(String(keywords || '')).slice(0, 6); const list = Array.from(store.captions.values()).filter(c => c.videoId === videoId); const updated = list.map(c => { const s = scoreCaption(c.text, k); const rec = { ...c, seoScore: s.seoScore, engagementScore: s.engagementScore }; store.captions.set(c.variantId, rec); return rec; }); res.json({ variants: updated }); });
router.get('/:videoId', (req, res) => { const { videoId } = req.params; const video = store.videos.get(videoId); if (!video)
    return res.status(404).json({ error: 'video not found' }); const list = Array.from(store.captions.values()).filter(c => c.videoId === videoId); res.json({ variants: list }); });
export default router;
