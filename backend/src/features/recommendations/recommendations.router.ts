import { Router, Request, Response } from "express"
import { store } from "../../store.js"

export const router = Router()

router.get("/:videoId", (req: Request, res: Response) => {
  const { videoId } = req.params
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const thumbs = Array.from(store.thumbnails.values()).filter((t) => t.videoId === videoId)
  const caps = Array.from(store.captions.values()).filter((c) => c.videoId === videoId)
  const bestThumb = thumbs.sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0))[0] || null
  const bestSeo = caps.sort((a, b) => (b.seoScore || 0) - (a.seoScore || 0))[0] || null
  const bestEng = caps.sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0))[0] || null
  res.json({ thumbnail: bestThumb, captions: { seo: bestSeo, engagement: bestEng } })
})

