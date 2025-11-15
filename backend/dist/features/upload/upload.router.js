import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
const router = Router();
router.post('/', (req, res) => { const { fileName } = req.body || {}; if (!fileName)
    return res.status(400).json({ error: 'fileName is required' }); const objectName = `${uuidv4()}_${fileName}`; const uploadUrl = `memory://uploads/${objectName}`; res.json({ uploadUrl, objectName, provider: 'memory', resumable: false }); });
export default router;
