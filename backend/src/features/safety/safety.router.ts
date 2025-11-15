import { Router, Request, Response } from "express"
import { store } from "../../store.js"

export const router = Router()

function isUnsafeVideo(videoId: string) {
  const thumbs = Array.from(store.thumbnails.values()).filter((t) => t.videoId === videoId)
  const caps = Array.from(store.captions.values()).filter((c) => c.videoId === videoId)
  const badWords = ["nsfw", "explicit", "adult", "violence"]
  const capUnsafe = caps.some((c) =>
    badWords.some((w) => String((c as any).text || "").toLowerCase().includes(w))
  )
  const styleUnsafe = thumbs.some((t) => badWords.includes(String((t as any).style || "").toLowerCase()))
  const safeSearchUnsafe = thumbs.some((t) => {
    const ss = (t as any).visionFeatures && (t as any).visionFeatures.safeSearch
    if (!ss) return false
    const lvl = (x: any) => String(x || "UNKNOWN")
    const high = ["LIKELY", "VERY_LIKELY"]
    return high.includes(lvl(ss.adult)) || high.includes(lvl(ss.violence))
  })
  return capUnsafe || styleUnsafe || safeSearchUnsafe
}

router.post("/:videoId/check", (req: Request, res: Response) => {
  const { videoId } = req.params
  const unsafe = isUnsafeVideo(videoId)
  res.json({ unsafe })
})

