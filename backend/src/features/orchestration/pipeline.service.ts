import { v4 as uuidv4 } from "uuid"
import { store } from "../../store.js"
import { analyzeUri } from "../../vision.js"
import { scoreThumbnail } from "../../shared/utils/scoring.js"
import { enabled as firestoreEnabled, saveWorkflowRun, saveThumbnail, updateThumbnailCtr, saveVideo } from "../../firestore.js"

export function addRun(
  videoId: string,
  step: string,
  status: string,
  startedAt: number,
  completedAt: number | null
) {
  const runId = uuidv4()
  const run = { runId, videoId, step, status, startedAt, completedAt }
  store.workflowRuns.set(runId, run)
  if (firestoreEnabled) {
    try { saveWorkflowRun(run) } catch {}
  }
  return runId
}

export function updateRun(runId: string, updates: any) {
  const old = store.workflowRuns.get(runId)
  if (!old) return
  const run = { ...old, ...updates }
  store.workflowRuns.set(runId, run)
  if (firestoreEnabled) {
    try { saveWorkflowRun(run) } catch {}
  }
}

export function startPipeline(videoId: string) {
  const now = Date.now()
  const pending = Array.from(store.workflowRuns.values()).find(
    (r: any) => r.videoId === videoId && r.step === "extracting_frames" && r.status === "pending"
  )
  if (pending)
    updateRun((pending as any).runId, { status: "completed", completedAt: now + 50 })
  else addRun(videoId, "extracting_frames", "completed", now, now + 50)
  setTimeout(() => {
    const fNow = Date.now()
    const count = 5
    for (let i = 0; i < count; i++) {
      const id = uuidv4()
      const uri = `memory://frame/${id}`
      const rec = { frameId: id, videoId, gcsUri: uri, createdAt: fNow + i * 10 }
      store.frames.set(id, rec)
    }
    addRun(videoId, "frame_extraction", "completed", fNow, fNow + 50)
    const t1 = Date.now()
    addRun(videoId, "transcribing_audio", "completed", t1, t1 + 50)
    setTimeout(() => {
      const t2 = Date.now()
      const styles = ["preset-1", "preset-2", "preset-3", "preset-4", "preset-5"]
      styles.forEach((style) => {
        const id = uuidv4()
        const uri = `memory://frame/${id}`
        const rec = { videoId, variantId: id, style, gcsUri: uri, visionFeatures: null, ctrScore: null, imageData: null, createdAt: Date.now() }
        store.thumbnails.set(id, rec)
        if (firestoreEnabled) {
          try { saveThumbnail(rec as any) } catch {}
        }
      })
      addRun(videoId, "generating_thumbnails", "completed", t2, t2 + 50)
      setTimeout(() => {
        const t2b = Date.now()
        const listForVision = Array.from(store.thumbnails.values()).filter((x: any) => x.videoId === videoId)
        Promise.all(
          listForVision.map(async (t: any) => {
            const vf = await analyzeUri(t.gcsUri)
            const updated = { ...t, visionFeatures: vf }
            store.thumbnails.set(t.variantId, updated)
            if (firestoreEnabled) {
              try { saveThumbnail(updated as any) } catch {}
            }
          })
        ).then(() => {
          addRun(videoId, "vision_analysis", "completed", t2b, t2b + 50)
          const t3 = Date.now()
          const video = store.videos.get(videoId) || { title: "" }
          const list = Array.from(store.thumbnails.values()).filter((x: any) => x.videoId === videoId)
          const scored = list
            .map((t: any) => {
              const ctr = scoreThumbnail(t.style || "custom", (video as any).title, [])
              const updated = { ...t, ctrScore: ctr }
              store.thumbnails.set(t.variantId, updated)
              if (firestoreEnabled) {
                try { updateThumbnailCtr(t.variantId, ctr) } catch {}
              }
              return updated
            })
            .sort((a: any, b: any) => (b.ctrScore || 0) - (a.ctrScore || 0))
          const winner = scored[0]
          addRun(videoId, "scoring", "completed", t3, t3 + 50)
          setTimeout(() => {
            const t4 = Date.now()
            const v = store.videos.get(videoId)
            const updated = { ...v, status: "ready" } as any
            store.videos.set(videoId, updated)
            if (firestoreEnabled) {
              try { saveVideo(updated) } catch {}
            }
            addRun(videoId, "ready_to_review", "completed", t4, t4 + 50)
          }, 150)
        })
      }, 150)
    }, 150)
  }, 150)
}
