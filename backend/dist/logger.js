import { v4 as uuidv4 } from 'uuid';
export function log(level, event, meta) {
    const entry = { ts: new Date().toISOString(), level, event, ...(meta || {}) };
    try {
        console.log(JSON.stringify(entry));
    }
    catch { }
}
export function attachRequestId(req, res, next) {
    const id = req.headers['x-request-id'] || uuidv4();
    req.id = String(id);
    res.setHeader('x-request-id', req.id);
    next();
}
