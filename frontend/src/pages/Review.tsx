import React, { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import ThumbnailCard from "../components/ThumbnailCard"
import CaptionCard from "../components/CaptionCard"
import { getVideoSummary, extractFrames, generateThumbnails, analyzeVision, scoreThumbnails, transcribe, getTranscript, generateCaptions, scoreCaptions } from "../lib/api"

export default function Review() {
  const { videoId = "" } = useParams()
  const nav = useNavigate()
  const [summary, setSummary] = useState<any>(null)
  const [selectedThumb, setSelectedThumb] = useState<any>(null)
  const [selectedCaption, setSelectedCaption] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const s = await getVideoSummary(videoId)
    setSummary(s)
  }

  useEffect(() => {
    refresh()
  }, [videoId])

  async function onExtractFrames() {
    setLoading(true)
    await extractFrames(videoId, 5, "interval")
    await refresh()
    setLoading(false)
  }

  async function onGenerateThumbnails() {
    setLoading(true)
    const firstFrame = (summary && summary.frames && summary.frames[0] && summary.frames[0].gcsUri) || undefined
    await generateThumbnails(videoId, firstFrame)
    await refresh()
    setLoading(false)
  }

  async function onAnalyzeVision() {
    setLoading(true)
    await analyzeVision(videoId)
    await refresh()
    setLoading(false)
  }

  async function onScoreThumbnails() {
    setLoading(true)
    const title = summary && summary.video && summary.video.title
    await scoreThumbnails(videoId, title || "")
    await refresh()
    setLoading(false)
  }

  async function onTranscribe() {
    setLoading(true)
    await transcribe(videoId)
    await refresh()
    setLoading(false)
  }

  async function onGenerateCaptions() {
    setLoading(true)
    const tr = await getTranscript(videoId).catch(() => null)
    const text = (tr && tr.text) || `Mock transcript for ${(summary && summary.video && summary.video.title) || "video"}`
    await generateCaptions(videoId, text)
    await refresh()
    setLoading(false)
  }

  async function onScoreCaptions() {
    setLoading(true)
    await scoreCaptions(videoId)
    await refresh()
    setLoading(false)
  }

  return (
    <div className="panel">
      <div className="panel__section">
        <div className="row">
          <button className="btn" onClick={onExtractFrames} disabled={loading}>Extract Frames</button>
          <button className="btn" onClick={onGenerateThumbnails} disabled={loading}>Generate Thumbnails</button>
          <button className="btn" onClick={onAnalyzeVision} disabled={loading}>Analyze Vision</button>
          <button className="btn" onClick={onScoreThumbnails} disabled={loading}>Score CTR</button>
        </div>
        <div className="grid">
          {(summary && summary.thumbnails || []).map((t: any) => (
            <ThumbnailCard key={t.variantId} variant={t} selected={selectedThumb && selectedThumb.variantId === t.variantId} onSelect={setSelectedThumb} />
          ))}
        </div>
      </div>
      <div className="panel__section">
        <div className="row">
          <button className="btn" onClick={onTranscribe} disabled={loading}>Transcribe</button>
          <button className="btn" onClick={onGenerateCaptions} disabled={loading}>Generate Captions</button>
          <button className="btn" onClick={onScoreCaptions} disabled={loading}>Score Captions</button>
        </div>
        <div className="grid">
          {(summary && summary.captions || []).map((c: any) => (
            <CaptionCard key={c.variantId} variant={c} selected={selectedCaption && selectedCaption.variantId === c.variantId} onSelect={setSelectedCaption} />
          ))}
        </div>
      </div>
      <div className="panel__section">
        <div className="row">
          <button className="btn" disabled={!selectedThumb} onClick={() => selectedThumb && nav(`/editor/${videoId}/${selectedThumb.variantId}`)}>Edit Selected Thumbnail</button>
          <button className="btn" onClick={() => nav(`/publish/${videoId}`)}>Publish</button>
        </div>
      </div>
    </div>
  )
}

