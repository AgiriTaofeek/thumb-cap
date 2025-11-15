import React, { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import ProgressBar from "../components/ProgressBar"
import { getUploadUrl, uploadFile, startProcess } from "../lib/api"
import { connectStatusStream } from "../lib/sse"

export default function Upload() {
  const nav = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [language, setLanguage] = useState("en")
  const [progress, setProgress] = useState(0)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [status, setStatus] = useState<any>(null)
  const steps = useMemo(() => {
    const runs = (status && status.runs) || []
    const completed = runs.filter((r: any) => r.status === "completed").length
    const total = Math.max(runs.length, 1)
    return Math.round((completed / total) * 100)
  }, [status])

  useEffect(() => {
    let es: EventSource | null = null
    if (videoId) {
      es = connectStatusStream(videoId, (d) => setStatus(d))
    }
    return () => {
      if (es) es.close()
    }
  }, [videoId])

  async function onStart() {
    if (!file || !title) return
    const up = await getUploadUrl(file.name)
    await uploadFile(up.uploadUrl, file, (p) => setProgress(p))
    const out = await startProcess({ gcsUri: up.uploadUrl, title, language })
    setVideoId(out.videoId)
  }

  return (
    <div className="panel">
      <div className="panel__section">
        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title" />
        </div>
        <div className="field">
          <label>Language</label>
          <input value={language} onChange={(e) => setLanguage(e.target.value)} />
        </div>
        <div className="field">
          <label>File</label>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <button className="btn" onClick={onStart} disabled={!file || !title}>Upload and Process</button>
        <div className="spacer" />
        <div className="label">Upload Progress</div>
        <ProgressBar value={progress} />
      </div>
      {videoId && (
        <div className="panel__section">
          <div className="label">Pipeline Progress</div>
          <ProgressBar value={steps} />
          <div className="spacer" />
          <button className="btn" onClick={() => nav(`/review/${videoId}`)}>Go to Review</button>
        </div>
      )}
    </div>
  )
}

