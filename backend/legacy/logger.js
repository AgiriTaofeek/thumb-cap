const { v4: uuidv4 } = require("uuid");

function log(level, event, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...((meta && typeof meta === "object") ? meta : {}),
  };
  try { console.log(JSON.stringify(entry)); } catch (_) {}
}

function attachRequestId(req, res, next) {
  const id = req.headers["x-request-id"] || uuidv4();
  req.id = String(id);
  res.setHeader("x-request-id", req.id);
  next();
}

module.exports = { log, attachRequestId };
