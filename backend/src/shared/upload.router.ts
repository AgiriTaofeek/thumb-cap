import { Router, Request, Response } from "express"
import { v4 as uuidv4 } from "uuid"

let gcsBucket: string | null = process.env.GCS_BUCKET || null
let gcsStorage: any = null
try {
  const { Storage } = require("@google-cloud/storage")
  gcsStorage = new Storage()
} catch {}

export const router = Router()

router.post("/upload-url", async (req: Request & { id?: string }, res: Response) => {
  const { fileName, contentType } = req.body || {}
  if (!fileName) return res.status(400).json({ error: "fileName is required" })
  const objectName = `${uuidv4()}_${fileName}`
  if (gcsBucket && gcsStorage) {
    try {
      const file = gcsStorage.bucket(gcsBucket).file(objectName)
      const [url] = await file.getSignedUrl({
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: contentType || "application/octet-stream",
      })
      return res.json({ uploadUrl: url, objectName, provider: "gcs", resumable: false })
    } catch {}
  }
  const uploadUrl = `memory://uploads/${objectName}`
  res.json({ uploadUrl, objectName, provider: "memory", resumable: false })
})
