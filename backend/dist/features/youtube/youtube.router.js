import { Router } from 'express';
import { setTokens, updateVideoMetadata, uploadThumbnail, enabled as youtubeEnabled } from '../../youtube.js';
import { store } from '../../store.js';
function dataUrlToBuffer(dataUrl) { if (!dataUrl || typeof dataUrl !== 'string')
    return null; const m = dataUrl.match(/^data:(.+);base64,(.*)$/); if (!m)
    return null; const mime = m[1]; const b64 = m[2]; try {
    const buf = Buffer.from(b64, 'base64');
    return { buf, mime };
}
catch {
    return null;
} }
const router = Router();
router.post('/publish', async (req, res) => { const { userId, youtubeVideoId, title, description } = req.body || {}; if (!youtubeEnabled)
    return res.status(400).json({ error: 'oauth not configured' }); if (!youtubeVideoId)
    return res.status(400).json({ error: 'youtubeVideoId is required' }); const key = String(userId || 'default'); const tokens = store.tokens.get(key); if (!tokens)
    return res.status(401).json({ error: 'no tokens for user' }); setTokens(tokens); try {
    await updateVideoMetadata({ youtubeVideoId, title, description });
    res.json({ ok: true });
}
catch {
    res.status(502).json({ error: 'youtube update failed' });
} });
router.post('/thumbnail', async (req, res) => { const { userId, youtubeVideoId, variantId, imageData } = req.body || {}; if (!youtubeEnabled)
    return res.status(400).json({ error: 'oauth not configured' }); if (!youtubeVideoId)
    return res.status(400).json({ error: 'youtubeVideoId is required' }); const key = String(userId || 'default'); const tokens = store.tokens.get(key); if (!tokens)
    return res.status(401).json({ error: 'no tokens for user' }); setTokens(tokens); let source = imageData; if (!source && variantId) {
    const t = store.thumbnails.get(String(variantId));
    source = t && t.imageData;
} const parsed = dataUrlToBuffer(source); if (!parsed)
    return res.status(400).json({ error: 'imageData or variant with imageData is required' }); try {
    await uploadThumbnail({ youtubeVideoId, buffer: parsed.buf, mimeType: parsed.mime });
    res.json({ ok: true });
}
catch {
    res.status(502).json({ error: 'youtube thumbnail upload failed' });
} });
export default router;
