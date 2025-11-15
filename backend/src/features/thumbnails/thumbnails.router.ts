import { Router, Request, Response } from "express"
import { v4 as uuidv4 } from "uuid"
import { store } from "../../store.js"
import { check as budgetCheck, commit as budgetCommit } from "../../cost.js"
import { enabled as vertexEnabled, predictCTR } from "../../prediction.js"
import { scoreThumbnail } from "../../shared/utils/scoring.js"
import { words } from "../../shared/utils/strings.js"
import { enabled as firestoreEnabled, saveThumbnail, updateThumbnailCtr, updateVideoRecommended } from "../../firestore.js"

export const router = Router()

router.get("/:videoId", (req: Request, res: Response) => {
  const { videoId } = req.params
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const list = Array.from(store.thumbnails.values()).filter((t) => t.videoId === videoId)
  res.json({ variants: list })
})

router.post("/:videoId/generate", (req: Request, res: Response) => {
  const { videoId } = req.params
  const { sourceFrameUri } = req.body || {}
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const styles = ["preset-1", "preset-2", "preset-3", "preset-4", "preset-5"]
  const bcGen = budgetCheck(videoId, "imagen_gen", styles.length) as any
  if (!bcGen.allowed)
    return res.status(429).json({ error: "budget exceeded", reason: bcGen.reason, remaining: bcGen.remaining })
  const variants = styles.map((style) => {
    const id = uuidv4()
    const uri = sourceFrameUri || `memory://frame/${id}`
    const rec = { videoId, variantId: id, style, gcsUri: uri, visionFeatures: null, ctrScore: null, imageData: null, createdAt: Date.now() }
    store.thumbnails.set(id, rec)
    if (firestoreEnabled) {
      try { saveThumbnail(rec as any) } catch {}
    }
    return rec
  })
  budgetCommit(videoId, "imagen_gen", styles.length)
  res.json({ variants })
})

router.post("/:videoId/score", async (req: Request, res: Response) => {
  const { videoId } = req.params
  const { title, keywords } = req.body || {}
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const list = Array.from(store.thumbnails.values()).filter((t) => t.videoId === videoId)
  if (!list.length) return res.status(400).json({ error: "no thumbnails to score" })
  const bcPred = budgetCheck(videoId, "prediction", 1) as any
  if (!bcPred.allowed)
    return res.status(429).json({ error: "budget exceeded", reason: bcPred.reason, remaining: bcPred.remaining })
  const scored = await Promise.all(
    list.map(async (t) => {
      const ctr = vertexEnabled
        ? await predictCTR({
            style: t.style || "custom",
            titleTokens: words(title || (video as any).title),
            faces: (t.visionFeatures && (t.visionFeatures.faces || 0)) || 0,
            colors: (t.visionFeatures && t.visionFeatures.dominantColors) || [],
          })
        : scoreThumbnail(t.style || "custom", title || (video as any).title, keywords || [])
      const updated = { ...t, ctrScore: ctr }
      store.thumbnails.set(t.variantId, updated)
      if (firestoreEnabled) {
        try { updateThumbnailCtr(t.variantId, ctr) } catch {}
      }
      return updated
    })
  )
  scored.sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0))
  const winner = scored[0]
  if (firestoreEnabled && winner) {
    try { updateVideoRecommended(videoId, (winner as any).variantId) } catch {}
  }
  budgetCommit(videoId, "prediction", 1)
  res.json({ winner, variants: scored })
})
