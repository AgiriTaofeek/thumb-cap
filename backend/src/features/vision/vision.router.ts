import { Router, Request, Response } from "express"
import { store } from "../../store.js"
import { analyzeUri } from "../../vision.js"
import { check as budgetCheck, commit as budgetCommit } from "../../cost.js"
import { enabled as firestoreEnabled, saveThumbnail } from "../../firestore.js"

export const router = Router()

router.post("/:videoId/analyze", async (req: Request, res: Response) => {
  const { videoId } = req.params
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const list = Array.from(store.thumbnails.values()).filter((t) => t.videoId === videoId)
  const bcVis = budgetCheck(videoId, "vision_analysis", list.length || 1) as any
  if (!bcVis.allowed)
    return res.status(429).json({ error: "budget exceeded", reason: bcVis.reason, remaining: bcVis.remaining })
  const results: any[] = []
  for (const t of list) {
    const vf = await analyzeUri((t as any).gcsUri)
    const updated = { ...(t as any), visionFeatures: vf }
    store.thumbnails.set((t as any).variantId, updated)
    if (firestoreEnabled) {
      try { saveThumbnail(updated as any) } catch {}
    }
    results.push(updated)
  }
  budgetCommit(videoId, "vision_analysis", list.length || 1)
  res.json({ variants: results })
})
