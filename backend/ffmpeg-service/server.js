const express = require('express')
const morgan = require('morgan')
const { Storage } = require('@google-cloud/storage')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))

const storage = new Storage()
const FRAMES_BUCKET = process.env.FRAMES_BUCKET || null

app.get('/health', (req, res) => { res.json({ status: 'ok' }) })

app.post('/extract', async (req, res) => {
  const { videoId, gcsUri, frequencySec } = req.body || {}
  if (!videoId || !gcsUri || !FRAMES_BUCKET) return res.status(400).json({ error: 'videoId, gcsUri, and FRAMES_BUCKET are required' })
  try {
    const tmpDir = '/tmp'
    const inputPath = path.join(tmpDir, `${videoId}.mp4`)
    const bucketName = gcsUri.replace(/^gs:\/\//, '').split('/')[0]
    const objectPath = gcsUri.replace(/^gs:\/\//, '').split('/').slice(1).join('/')
    await storage.bucket(bucketName).file(objectPath).download({ destination: inputPath })
    const outPattern = path.join(tmpDir, `${videoId}-frame-%04d.png`)
    const args = ['-i', inputPath, '-vf', `fps=1/${Number(frequencySec || 5)}`, outPattern]
    await new Promise((resolve, reject) => {
      const p = spawn('ffmpeg', args)
      p.on('error', reject)
      p.on('close', (code) => code === 0 ? resolve(null) : reject(new Error(String(code))))
    })
    const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(`${videoId}-frame-`) && f.endsWith('.png'))
    const uploaded = []
    for (const f of files) {
      const frameId = f.replace(`${videoId}-frame-`, '').replace('.png', '')
      const dest = `${videoId}/${f}`
      await storage.bucket(FRAMES_BUCKET).upload(path.join(tmpDir, f), { destination: dest, contentType: 'image/png' })
      uploaded.push({ frameId, gcsUri: `gs://${FRAMES_BUCKET}/${dest}` })
    }
    res.json({ frames: uploaded, count: uploaded.length })
  } catch (e) {
    res.status(500).json({ error: 'ffmpeg_extract_failed' })
  }
})

const port = process.env.PORT || 8080
app.listen(port, () => {})
