import { Router, Request, Response } from "express"
import { store } from "../../store.js"
import { startPipeline, addRun } from "./pipeline.service.js"

export const router = Router()

router.post("/pubsub", (req: Request, res: Response) => {
  const body = req.body || {}
  const tokenEnv = process.env.PUBSUB_TOKEN || null
  const tokenAttr = body.message && body.message.attributes && body.message.attributes.token
  const tokenHeader = req.headers["x-pubsub-token"] as string | undefined
  if (tokenEnv && tokenEnv !== (tokenAttr || tokenHeader || null)) return res.status(403).json({ error: "invalid token" })
  let payload: any = body
  if (body.message && body.message.data) {
    try {
      const json = Buffer.from(String(body.message.data), "base64").toString("utf8")
      payload = JSON.parse(json)
    } catch {
      return res.status(400).json({ error: "bad pubsub data" })
    }
  }
  const type = payload && payload.type
  const videoId = payload && payload.videoId
  const now = Date.now()
  if (videoId) addRun(videoId, "pubsub_received", "completed", now, now)
  if (type === "video_uploaded" && videoId) setTimeout(() => startPipeline(videoId), 10)
  res.status(204).end()
})

