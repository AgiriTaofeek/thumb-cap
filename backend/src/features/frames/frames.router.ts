import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { store } from "../../store.js";

let gcsBucket: string | null = process.env.FRAMES_BUCKET || null;
let gcsStorage: any = null;
try {
  const { Storage } = require("@google-cloud/storage");
  gcsStorage = new Storage();
} catch {}

export const router = Router();

router.get("/:videoId", (req: Request, res: Response) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const list = Array.from(store.frames.values()).filter(
    (f) => f.videoId === videoId
  );
  res.json({ frames: list });
});

router.post("/:videoId/extract", (req: Request, res: Response) => {
  const { videoId } = req.params;
  const { frequencySec, mode } = req.body || {};
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const count = 5;
  const now = Date.now();
  const frames: any[] = [];
  for (let i = 0; i < count; i++) {
    const id = uuidv4();
    const uri = `memory://frame/${id}`;
    const rec = { frameId: id, videoId, gcsUri: uri, createdAt: now + i * 10 };
    store.frames.set(id, rec);
    frames.push(rec);
  }
  res.json({
    frames,
    frequencySec: frequencySec || 5,
    mode: mode || "interval",
  });
});

router.post("/:videoId/sync", async (req: Request, res: Response) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  if (!gcsBucket || !gcsStorage)
    return res.status(400).json({ error: "frames bucket not configured" });
  try {
    const prefix = `${videoId}/`;
    const [files] = await gcsStorage
      .bucket(gcsBucket)
      .getFiles({ prefix });
    const frames: any[] = [];
    for (const f of files) {
      const [meta] = await f.getMetadata();
      const name: string = String(f.name || "");
      const id = name.split("/").pop() || uuidv4();
      const uri = `gs://${gcsBucket}/${name}`;
      const createdAt = Number(new Date(meta && meta.timeCreated ? meta.timeCreated : Date.now()).getTime());
      const rec = { frameId: id, videoId, gcsUri: uri, createdAt };
      store.frames.set(id, rec);
      frames.push(rec);
    }
    res.json({ frames, count: frames.length });
  } catch {
    res.status(500).json({ error: "frames_sync_failed" });
  }
});
