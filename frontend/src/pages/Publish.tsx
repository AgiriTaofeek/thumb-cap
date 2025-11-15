import React, { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { getOAuthUrl, publishYouTube, uploadYouTubeThumbnail } from "../lib/api"

export default function Publish() {
  const { videoId = "" } = useParams()
  const [youtubeVideoId, setYoutubeVideoId] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [connected, setConnected] = useState(false)
  const [imageData, setImageData] = useState<string | null>(null)
  const [msg, setMsg] = useState("")

  useEffect(() => {
    const saved = localStorage.getItem(`edited:${videoId}`)
    setImageData(saved)
  }, [videoId])

  async function connect() {
    try {
      const { authUrl } = await getOAuthUrl()
      if (authUrl) window.location.href = authUrl
    } catch {}
  }

  async function onPublishMetadata() {
    try {
      await publishYouTube({ userId: "default", youtubeVideoId, title, description })
      setMsg("Published metadata")
      setConnected(true)
    } catch {
      setMsg("Failed to publish metadata")
    }
  }

  async function onUploadThumbnail() {
    try {
      await uploadYouTubeThumbnail({ userId: "default", youtubeVideoId, imageData: imageData || undefined })
      setMsg("Uploaded thumbnail")
      setConnected(true)
    } catch {
      setMsg("Failed to upload thumbnail")
    }
  }

  return (
    <div className="panel">
      <div className="panel__section">
        <div className="row">
          <button className="btn" onClick={connect}>Connect YouTube</button>
          <span className={connected ? "tag tag--ok" : "tag"}>{connected ? "Connected" : "Not connected"}</span>
        </div>
      </div>
      <div className="panel__section">
        <div className="field">
          <label>YouTube Video ID</label>
          <input value={youtubeVideoId} onChange={(e) => setYoutubeVideoId(e.target.value)} />
        </div>
        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn" onClick={onPublishMetadata} disabled={!youtubeVideoId}>Publish Metadata</button>
          <button className="btn" onClick={onUploadThumbnail} disabled={!youtubeVideoId || !imageData}>Upload Thumbnail</button>
        </div>
        {msg && <div className="notice">{msg}</div>}
      </div>
    </div>
  )
}

