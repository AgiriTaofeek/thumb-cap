import { Router, Request, Response } from "express"
import { store } from "../../store.js"
import { enabled as youtubeEnabled, setTokens, updateVideoMetadata, uploadThumbnail } from "../../youtube.js"

export const router = Router()

router.post("/publish", async (req: Request, res: Response) => {
  const { userId, youtubeVideoId, title, description } = req.body || {}
  if (!youtubeEnabled) return res.status(400).json({ error: "oauth not configured" })
  if (!youtubeVideoId) return res.status(400).json({ error: "youtubeVideoId is required" })
  const key = String(userId || "default")
  const tokens = store.tokens.get(key)
  if (!tokens) return res.status(401).json({ error: "no tokens for user" })
  setTokens(tokens)
  try {
    await updateVideoMetadata({ youtubeVideoId, title, description })
    res.json({ ok: true })
  } catch {
    res.status(502).json({ error: "youtube update failed" })
  }
})

function dataUrlToBuffer(dataUrl?: string) {
  if (!dataUrl || typeof dataUrl !== "string") return null
  const m = dataUrl.match(/^data:(.+);base64,(.*)$/)
  if (!m) return null
  const mime = m[1]
  const b64 = m[2]
  try {
    const buf = Buffer.from(b64, "base64")
    return { buf, mime }
  } catch {
    return null
  }
}

router.post("/thumbnail", async (req: Request, res: Response) => {
  const { userId, youtubeVideoId, variantId, imageData } = req.body || {}
  if (!youtubeEnabled) return res.status(400).json({ error: "oauth not configured" })
  if (!youtubeVideoId) return res.status(400).json({ error: "youtubeVideoId is required" })
  const key = String(userId || "default")
  const tokens = store.tokens.get(key)
  if (!tokens) return res.status(401).json({ error: "no tokens for user" })
  setTokens(tokens)
  let source = imageData as string | undefined
  if (!source && variantId) {
    const t = store.thumbnails.get(String(variantId))
    source = t && (t as any).imageData
  }
  const parsed = dataUrlToBuffer(source)
  if (!parsed) return res.status(400).json({ error: "imageData or variant with imageData is required" })
  try {
    await uploadThumbnail({ youtubeVideoId, buffer: parsed.buf, mimeType: parsed.mime })
    res.json({ ok: true })
  } catch {
    res.status(502).json({ error: "youtube thumbnail upload failed" })
  }
})

