import { Router, Request, Response } from "express"
import { v4 as uuidv4 } from "uuid"
import { store } from "../../store.js"
import { enabled as speechEnabled, transcribeGcsUri } from "../../speech.js"
import { enabled as translateEnabled, translateText } from "../../translation.js"
import { check as budgetCheck, commit as budgetCommit } from "../../cost.js"
import { scoreCaption } from "../../shared/utils/scoring.js"
import { enabled as firestoreEnabled, saveCaption } from "../../firestore.js"

export const router = Router()

router.post("/:videoId/generate", (req: Request, res: Response) => {
  const { videoId } = req.params
  const { transcript, keywords } = req.body || {}
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  if (!transcript) return res.status(400).json({ error: "transcript is required" })
  const bcCap = budgetCheck(videoId, "caption_gen", 3) as any
  if (!bcCap.allowed)
    return res.status(429).json({ error: "budget exceeded", reason: bcCap.reason, remaining: bcCap.remaining })
  const k = Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/).slice(0, 6)
  const base = String(transcript).trim()
  const seo = `${base} ${k.slice(0, 5).join(" ")}`.trim()
  const hook = `Watch now: ${base}`
  const friendly = `In this video: ${base}`
  const variants = [
    { type: "SEO", text: seo },
    { type: "Hook", text: hook },
    { type: "Friendly", text: friendly },
  ].map((v) => {
    const s = scoreCaption(v.text, k)
    const id = uuidv4()
    const rec = { videoId, variantId: id, type: v.type, text: v.text, seoScore: s.seoScore, engagementScore: s.engagementScore, translations: null }
    store.captions.set(id, rec)
    if (firestoreEnabled) {
      try { saveCaption(rec as any) } catch {}
    }
    return rec
  })
  budgetCommit(videoId, "caption_gen", 3)
  res.json({ variants })
})

router.post("/:videoId/score", (req: Request, res: Response) => {
  const { videoId } = req.params
  const { keywords } = req.body || {}
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const k = Array.isArray(keywords) ? keywords : String(keywords || "").split(/\s+/).slice(0, 6)
  const list = Array.from(store.captions.values()).filter((c) => c.videoId === videoId)
  const updated = list.map((c) => {
    const s = scoreCaption(c.text, k)
    const rec = { ...c, seoScore: s.seoScore, engagementScore: s.engagementScore }
    store.captions.set(c.variantId, rec)
    if (firestoreEnabled) {
      try { saveCaption(rec as any) } catch {}
    }
    return rec
  })
  res.json({ variants: updated })
})

router.get("/:videoId", (req: Request, res: Response) => {
  const { videoId } = req.params
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const list = Array.from(store.captions.values()).filter((c) => c.videoId === videoId)
  res.json({ variants: list })
})

router.post("/translate/:videoId", async (req: Request, res: Response) => {
  const { videoId } = req.params
  const { variantId, target } = req.body || {}
  if (!variantId || !target) return res.status(400).json({ error: "variantId and target are required" })
  const cap = store.captions.get(String(variantId))
  if (!cap || (cap as any).videoId !== videoId) return res.status(404).json({ error: "caption not found" })
  let translated = (cap as any).text
  if (translateEnabled) {
    try {
      const out = await translateText((cap as any).text, target)
      translated = out.translatedText || translated
    } catch {}
  }
  const updated = { ...(cap as any), translations: { ...((cap as any).translations || {}), [target]: translated } }
  store.captions.set((cap as any).variantId, updated)
  if (firestoreEnabled) {
    try { saveCaption(updated as any) } catch {}
  }
  res.json(updated)
})

router.post("/transcribe/:videoId", async (req: Request, res: Response) => {
  const { videoId } = req.params
  const { gcsUri, languageCode } = req.body || {}
  const video = store.videos.get(videoId)
  if (!video) return res.status(404).json({ error: "video not found" })
  const uri = gcsUri || (video as any).gcsUri
  let text = `Mock transcript for ${(video as any).title}`
  if (speechEnabled) {
    try {
      const out = await transcribeGcsUri(uri, languageCode || "en-US")
      text = out.text || text
    } catch {}
  }
  const rec = { videoId, text, createdAt: Date.now() }
  store.transcripts.set(videoId, rec)
  res.json(rec)
})

router.get("/transcript/:videoId", (req: Request, res: Response) => {
  const { videoId } = req.params
  const rec = store.transcripts.get(videoId)
  if (!rec) return res.status(404).json({ error: "transcript not found" })
  res.json(rec)
})
