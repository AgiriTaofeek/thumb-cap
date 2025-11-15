import { Router, Request, Response } from "express"
import { v4 as uuidv4 } from "uuid"
import { store } from "../../store.js"
import { enabled as pubsubEnabled, publishMessage } from "../../pubsub.js"
import { retry } from "../../retry.js"
import { log } from "../../logger.js"
import { getStatus as budgetStatus } from "../../cost.js"
import { addRun, startPipeline } from "./pipeline.service.js"
import { enabled as firestoreEnabled, saveVideo, saveWorkflowRun } from "../../firestore.js"

export const router = Router()

router.get("/budget/:videoId", (req: Request, res: Response) => {
  const { videoId } = req.params
  res.json(budgetStatus(videoId))
})

router.post("/process", (req: Request & { id?: string }, res: Response) => {
  const { videoId, gcsUri, title, language } = req.body || {}
  log("info", "process.start", { reqId: req.id, gcsUri, title, language })
  if (!gcsUri || !title) return res.status(400).json({ error: "gcsUri and title are required" })
  const id = videoId || uuidv4()
  const now = Date.now()
  store.videos.set(id, { id, userId: null, status: "queued", gcsUri, title, language: language || "en", createdAt: now })
  const runId = uuidv4()
  store.workflowRuns.set(runId, { runId, videoId: id, step: "uploading", status: "completed", startedAt: now, completedAt: now })
  if (firestoreEnabled) {
    try { saveVideo(store.videos.get(id)) } catch {}
    try { saveWorkflowRun(store.workflowRuns.get(runId)) } catch {}
  }
  store.workflowRuns.set(uuidv4(), { runId: uuidv4(), videoId: id, step: "extracting_frames", status: "pending", startedAt: now, completedAt: null })
  if (pubsubEnabled)
    retry(
      () =>
        publishMessage(
          { type: "video_uploaded", videoId: id, gcsUri, title, language: language || "en" },
          { token: String(process.env.PUBSUB_TOKEN || '') }
        ),
      { retries: 2, baseMs: 300 }
    ).catch(() => {})
  res.json({ videoId: id })
  setTimeout(() => startPipeline(id), 10)
})

router.get("/status/:videoId", (req: Request & { id?: string }, res: Response) => {
  const { videoId } = req.params
  log("info", "status.get", { reqId: req.id, videoId })
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const runs = Array.from(store.workflowRuns.values()).filter((r) => r.videoId === videoId)
  res.json({ video, runs })
})

router.get("/status/:videoId/stream", (req: Request, res: Response) => {
  const { videoId } = req.params
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  const send = () => {
    const video = store.videos.get(videoId)
    if (!video) {
      res.write(`event: error\n`)
      res.write(`data: ${JSON.stringify({ error: "video not found" })}\n\n`)
      return
    }
    const runs = Array.from(store.workflowRuns.values()).filter((r) => r.videoId === videoId)
    const payload = { video, runs, ts: Date.now() }
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  const iv = setInterval(send, 1000)
  req.on("close", () => clearInterval(iv))
  send()
})

router.post("/admin/cleanup", (req: Request, res: Response) => {
  const days = Number(process.env.RETENTION_DAYS || 30)
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let removed = { thumbnails: 0, frames: 0, transcripts: 0 }
  for (const [id, t] of Array.from(store.thumbnails.entries())) {
    if ((t as any).createdAt && (t as any).createdAt < cutoff) {
      store.thumbnails.delete(id)
      removed.thumbnails++
    }
  }
  for (const [id, f] of Array.from(store.frames.entries())) {
    if ((f as any).createdAt && (f as any).createdAt < cutoff) {
      store.frames.delete(id)
      removed.frames++
    }
  }
  for (const [vid, tr] of Array.from(store.transcripts.entries())) {
    if ((tr as any).createdAt && (tr as any).createdAt < cutoff) {
      store.transcripts.delete(vid)
      removed.transcripts++
    }
  }
  res.json({ days, removed })
})
