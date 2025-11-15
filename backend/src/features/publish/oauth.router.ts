import { Router, Request, Response } from "express"
import { store } from "../../store.js"
import { enabled as youtubeEnabled, getAuthUrl, exchangeCode } from "../../youtube.js"

export const router = Router()

router.get("/url", (req: Request, res: Response) => {
  const url = youtubeEnabled ? getAuthUrl(["https://www.googleapis.com/auth/youtube"]) : null
  if (!url) return res.status(400).json({ error: "oauth not configured" })
  res.json({ authUrl: url })
})

router.get("/callback", async (req: Request, res: Response) => {
  const { code, userId } = (req.query as any) || {}
  if (!youtubeEnabled) return res.status(400).json({ error: "oauth not configured" })
  if (!code) return res.status(400).json({ error: "code is required" })
  try {
    const tokens = await exchangeCode(code as string)
    const key = String(userId || "default")
    store.tokens.set(key, tokens)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: "oauth exchange failed" })
  }
})

