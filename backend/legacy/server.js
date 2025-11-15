const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const { store } = require("./store");
const { enabled: pubsubEnabled, publishMessage } = require("./pubsub");
const { log, attachRequestId } = require("./logger");
const { retry } = require("./retry");
const {
  enabled: youtubeEnabled,
  getAuthUrl,
  exchangeCode,
  setTokens,
  updateVideoMetadata,
  uploadThumbnail,
} = require("./youtube");
const { enabled: visionEnabled, analyzeUri } = require("./vision");
const { enabled: vertexEnabled, predictCTR } = require("./prediction");
const { enabled: speechEnabled, transcribeGcsUri } = require("./speech");
const { enabled: translateEnabled, translateText } = require("./translation");
const {
  enabled: costEnabled,
  check: budgetCheck,
  commit: budgetCommit,
  getStatus: budgetStatus,
} = require("./cost");
const {
  enabled: firestoreEnabled,
  saveVideo,
  saveThumbnail,
  updateThumbnailCtr,
  saveCaption,
  saveWorkflowRun,
  updateVideoRecommended,
} = require("./firestore");
let gcsBucket = process.env.GCS_BUCKET || null;
let gcsStorage = null;
try {
  const { Storage } = require("@google-cloud/storage");
  gcsStorage = new Storage();
} catch (e) {
  gcsStorage = null;
}

dotenv.config();
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(attachRequestId);
app.use(cors());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  log("info", "health", { reqId: req.id });
  res.json({ status: "ok" });
});
app.get("/budget/:videoId", (req, res) => {
  const { videoId } = req.params;
  res.json(budgetStatus(videoId));
});

app.post("/process", (req, res) => {
  const { videoId, gcsUri, title, language } = req.body || {};
  log("info", "process.start", { reqId: req.id, gcsUri, title, language });
  if (!gcsUri || !title)
    return res.status(400).json({ error: "gcsUri and title are required" });
  const id = videoId || uuidv4();
  const now = Date.now();
  store.videos.set(id, {
    id,
    userId: null,
    status: "queued",
    gcsUri,
    title,
    language: language || "en",
    createdAt: now,
  });
  const runId = uuidv4();
  store.workflowRuns.set(runId, {
    runId,
    videoId: id,
    step: "uploading",
    status: "completed",
    startedAt: now,
    completedAt: now,
  });
  if (firestoreEnabled) {
    saveVideo(store.videos.get(id));
    saveWorkflowRun(store.workflowRuns.get(runId));
  }
  if (pubsubEnabled)
    retry(
      () =>
        publishMessage({
          type: "video_uploaded",
          videoId: id,
          gcsUri,
          title,
          language: language || "en",
        }),
      { retries: 2, baseMs: 300 }
    ).catch(() => {});
  store.workflowRuns.set(uuidv4(), {
    runId: uuidv4(),
    videoId: id,
    step: "extracting_frames",
    status: "pending",
    startedAt: now,
    completedAt: null,
  });
  res.json({ videoId: id });
  setTimeout(() => startPipeline(id), 10);
});

app.get("/status/:videoId", (req, res) => {
  const { videoId } = req.params;
  log("info", "status.get", { reqId: req.id, videoId });
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const runs = Array.from(store.workflowRuns.values()).filter(
    (r) => r.videoId === videoId
  );
  res.json({ video, runs });
});
app.get("/status/:videoId/stream", (req, res) => {
  const { videoId } = req.params;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = () => {
    const video = store.videos.get(videoId);
    if (!video) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: "video not found" })}\n\n`);
      return;
    }
    const runs = Array.from(store.workflowRuns.values()).filter(
      (r) => r.videoId === videoId
    );
    const payload = { video, runs, ts: Date.now() };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const iv = setInterval(send, 1000);
  req.on("close", () => clearInterval(iv));
  send();
});
app.get("/frames/:videoId", (req, res) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const list = Array.from(store.frames.values()).filter(
    (f) => f.videoId === videoId
  );
  res.json({ frames: list });
});
app.get("/videos", (req, res) => {
  const list = Array.from(store.videos.values()).sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
  res.json({ videos: list });
});
app.get("/videos/:videoId/summary", (req, res) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const frames = Array.from(store.frames.values()).filter(
    (f) => f.videoId === videoId
  );
  const thumbnails = Array.from(store.thumbnails.values()).filter(
    (t) => t.videoId === videoId
  );
  const captions = Array.from(store.captions.values()).filter(
    (c) => c.videoId === videoId
  );
  const runs = Array.from(store.workflowRuns.values()).filter(
    (r) => r.videoId === videoId
  );
  const recThumb =
    thumbnails
      .slice()
      .sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0))[0] || null;
  res.json({
    video,
    frames,
    thumbnails,
    captions,
    runs,
    recommendedThumbnail: recThumb,
  });
});
app.post("/frames/:videoId/extract", (req, res) => {
  const { videoId } = req.params;
  const { frequencySec, mode } = req.body || {};
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const count = 5;
  const now = Date.now();
  const frames = [];
  for (let i = 0; i < count; i++) {
    const id = uuidv4();
    const uri = `memory://frame/${id}`;
    const rec = { frameId: id, videoId, gcsUri: uri, createdAt: now + i * 10 };
    store.frames.set(id, rec);
    frames.push(rec);
  }
  addRun(videoId, "frame_extraction", "completed", now, now + 50);
  res.json({
    frames,
    frequencySec: frequencySec || 5,
    mode: mode || "interval",
  });
});

app.post("/transcribe/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const { gcsUri, languageCode } = req.body || {};
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const uri = gcsUri || video.gcsUri;
  let text = `Mock transcript for ${video.title}`;
  if (speechEnabled) {
    try {
      const out = await transcribeGcsUri(uri, languageCode || "en-US");
      text = out.text || text;
    } catch (_) {}
  }
  const rec = { videoId, text, createdAt: Date.now() };
  store.transcripts.set(videoId, rec);
  addRun(videoId, "transcribing_audio", "completed", Date.now(), Date.now());
  res.json(rec);
});

app.get("/transcript/:videoId", (req, res) => {
  const { videoId } = req.params;
  const rec = store.transcripts.get(videoId);
  if (!rec) return res.status(404).json({ error: "transcript not found" });
  res.json(rec);
});

app.post("/translate/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const { variantId, target } = req.body || {};
  if (!variantId || !target)
    return res.status(400).json({ error: "variantId and target are required" });
  const cap = store.captions.get(String(variantId));
  if (!cap || cap.videoId !== videoId)
    return res.status(404).json({ error: "caption not found" });
  let translated = cap.text;
  if (translateEnabled) {
    try {
      const out = await translateText(cap.text, target);
      translated = out.translatedText || translated;
    } catch (_) {}
  }
  const updated = {
    ...cap,
    translations: { ...(cap.translations || {}), [target]: translated },
  };
  store.captions.set(cap.variantId, updated);
  if (firestoreEnabled) saveCaption(updated);
  res.json(updated);
});

app.post("/hooks/pubsub", (req, res) => {
  const body = req.body || {};
  const tokenEnv = process.env.PUBSUB_TOKEN || null;
  const tokenAttr =
    body.message && body.message.attributes && body.message.attributes.token;
  const tokenHeader = req.headers["x-pubsub-token"];
  if (tokenEnv && tokenEnv !== (tokenAttr || tokenHeader || null))
    return res.status(403).json({ error: "invalid token" });
  let payload = body;
  if (body.message && body.message.data) {
    try {
      const json = Buffer.from(String(body.message.data), "base64").toString(
        "utf8"
      );
      payload = JSON.parse(json);
    } catch (_) {
      return res.status(400).json({ error: "bad pubsub data" });
    }
  }
  const type = payload && payload.type;
  const videoId = payload && payload.videoId;
  const now = Date.now();
  if (videoId) addRun(videoId, "pubsub_received", "completed", now, now);
  if (type === "video_uploaded" && videoId)
    setTimeout(() => startPipeline(videoId), 10);
  res.status(204).end();
});

app.get("/recommendations/:videoId", (req, res) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const thumbs = Array.from(store.thumbnails.values()).filter(
    (t) => t.videoId === videoId
  );
  const caps = Array.from(store.captions.values()).filter(
    (c) => c.videoId === videoId
  );
  const bestThumb =
    thumbs.sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0))[0] || null;
  const bestSeo =
    caps.sort((a, b) => (b.seoScore || 0) - (a.seoScore || 0))[0] || null;
  const bestEng =
    caps.sort(
      (a, b) => (b.engagementScore || 0) - (a.engagementScore || 0)
    )[0] || null;
  res.json({
    thumbnail: bestThumb,
    captions: { seo: bestSeo, engagement: bestEng },
  });
});

app.get("/oauth/url", (req, res) => {
  const url = youtubeEnabled
    ? getAuthUrl(["https://www.googleapis.com/auth/youtube"])
    : null;
  if (!url) return res.status(400).json({ error: "oauth not configured" });
  res.json({ authUrl: url });
});

app.get("/oauth/callback", async (req, res) => {
  const { code, userId } = req.query || {};
  if (!youtubeEnabled)
    return res.status(400).json({ error: "oauth not configured" });
  if (!code) return res.status(400).json({ error: "code is required" });
  try {
    const tokens = await exchangeCode(code);
    const key = String(userId || "default");
    store.tokens.set(key, tokens);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "oauth exchange failed" });
  }
});

app.post("/edit", (req, res) => {
  const { videoId, variantId, imageData, style } = req.body || {};
  log("info", "edit.save", { reqId: req.id, videoId, variantId, style });
  if (!videoId || !imageData)
    return res
      .status(400)
      .json({ error: "videoId and imageData are required" });
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const id = variantId || uuidv4();
  const uri = `memory://${id}`;
  store.thumbnails.set(id, {
    videoId,
    variantId: id,
    style: style || "custom",
    gcsUri: uri,
    visionFeatures: null,
    ctrScore: null,
    imageData,
  });
  if (firestoreEnabled) saveThumbnail(store.thumbnails.get(id));
  res.json({ variantId: id, gcsUri: uri });
});

app.post("/publish", (req, res) => {
  const { videoId, mode, youtubeVideoId, captionText } = req.body || {};
  log("info", "publish", { reqId: req.id, videoId, mode, youtubeVideoId });
  if (!videoId || !mode)
    return res.status(400).json({ error: "videoId and mode are required" });
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const unsafe = isUnsafeVideo(videoId);
  if (unsafe) return res.status(400).json({ error: "content flagged unsafe" });
  store.videos.set(videoId, {
    ...video,
    status: "published",
    youtubeVideoId: youtubeVideoId || null,
  });
  if (captionText) {
    const capId = uuidv4();
    store.captions.set(capId, {
      videoId,
      variantId: capId,
      type: "chosen",
      text: captionText,
      seoScore: null,
      engagementScore: null,
      translations: null,
    });
    if (firestoreEnabled) saveCaption(store.captions.get(capId));
  }
  if (firestoreEnabled) saveVideo(store.videos.get(videoId));
  res.json({ ok: true });
});

app.post("/youtube/publish", async (req, res) => {
  const { userId, youtubeVideoId, title, description } = req.body || {};
  if (!youtubeEnabled)
    return res.status(400).json({ error: "oauth not configured" });
  if (!youtubeVideoId)
    return res.status(400).json({ error: "youtubeVideoId is required" });
  const key = String(userId || "default");
  const tokens = store.tokens.get(key);
  if (!tokens) return res.status(401).json({ error: "no tokens for user" });
  setTokens(tokens);
  try {
    await updateVideoMetadata({ youtubeVideoId, title, description });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: "youtube update failed" });
  }
});

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  try {
    const buf = Buffer.from(b64, "base64");
    return { buf, mime };
  } catch (_) {
    return null;
  }
}

app.post("/youtube/thumbnail", async (req, res) => {
  const { userId, youtubeVideoId, variantId, imageData } = req.body || {};
  if (!youtubeEnabled)
    return res.status(400).json({ error: "oauth not configured" });
  if (!youtubeVideoId)
    return res.status(400).json({ error: "youtubeVideoId is required" });
  const key = String(userId || "default");
  const tokens = store.tokens.get(key);
  if (!tokens) return res.status(401).json({ error: "no tokens for user" });
  setTokens(tokens);
  let source = imageData;
  if (!source && variantId) {
    const t = store.thumbnails.get(String(variantId));
    source = t && t.imageData;
  }
  const parsed = dataUrlToBuffer(source);
  if (!parsed)
    return res
      .status(400)
      .json({ error: "imageData or variant with imageData is required" });
  try {
    await uploadThumbnail({
      youtubeVideoId,
      buffer: parsed.buf,
      mimeType: parsed.mime,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: "youtube thumbnail upload failed" });
  }
});

function words(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreCaption(text, keywords) {
  const w = words(text);
  const k = (keywords || []).map((x) => String(x).toLowerCase());
  const count = w.length || 1;
  const kd = k.length ? w.filter((x) => k.includes(x)).length / count : 0;
  const readability = Math.min(1, Math.max(0, 1 - Math.abs(14 - count) / 20));
  const engagement = Math.min(
    1,
    w.filter((x) =>
      [
        "best",
        "pro",
        "ultimate",
        "free",
        "secret",
        "how",
        "wow",
        "amazing",
      ].includes(x)
    ).length / 5
  );
  return {
    seoScore: Math.round(kd * 100),
    engagementScore: Math.round(((readability + engagement) / 2) * 100),
  };
}

function scoreThumbnail(style, title, keywords) {
  const base = 0.5;
  const kw = (keywords || []).map((x) => String(x).toLowerCase());
  const t = words(title);
  const match = kw.length ? t.filter((x) => kw.includes(x)).length : 0;
  const styleBoost =
    style === "preset-1"
      ? 0.1
      : style === "preset-2"
      ? 0.12
      : style === "preset-3"
      ? 0.08
      : 0.06;
  const score = Math.min(1, base + styleBoost + Math.min(0.2, match * 0.03));
  return Math.round(score * 100);
}

app.post("/thumbnails/:videoId/score", (req, res) => {
  const { videoId } = req.params;
  const { title, keywords } = req.body || {};
  log("info", "thumbnails.score", { reqId: req.id, videoId, title });
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const list = Array.from(store.thumbnails.values()).filter(
    (t) => t.videoId === videoId
  );
  if (!list.length)
    return res.status(400).json({ error: "no thumbnails to score" });
  const bcPred = budgetCheck(videoId, "prediction", 1);
  if (!bcPred.allowed)
    return res.status(429).json({
      error: "budget exceeded",
      reason: bcPred.reason,
      remaining: bcPred.remaining,
    });
  const scored = list
    .map((t) => {
      const ctr = vertexEnabled
        ? predictCTR({
            style: t.style || "custom",
            titleTokens: words(title || video.title),
            faces: (t.visionFeatures && t.visionFeatures.faces) || 0,
            colors: (t.visionFeatures && t.visionFeatures.dominantColors) || [],
          })
        : scoreThumbnail(
            t.style || "custom",
            title || video.title,
            keywords || []
          );
      const updated = { ...t, ctrScore: ctr };
      store.thumbnails.set(t.variantId, updated);
      if (firestoreEnabled) updateThumbnailCtr(t.variantId, ctr);
      return updated;
    })
    .sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0));
  const winner = scored[0];
  if (firestoreEnabled) updateVideoRecommended(videoId, winner.variantId);
  budgetCommit(videoId, "prediction", 1);
  res.json({ winner, variants: scored });
});

app.post("/captions/:videoId/generate", (req, res) => {
  const { videoId } = req.params;
  const { transcript, keywords } = req.body || {};
  log("info", "captions.generate", { reqId: req.id, videoId });
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  if (!transcript)
    return res.status(400).json({ error: "transcript is required" });
  const bcCap = budgetCheck(videoId, "caption_gen", 3);
  if (!bcCap.allowed)
    return res.status(429).json({
      error: "budget exceeded",
      reason: bcCap.reason,
      remaining: bcCap.remaining,
    });
  const k = Array.isArray(keywords)
    ? keywords
    : words(String(keywords || "")).slice(0, 6);
  const base = transcript.trim();
  const seo = `${base} ${k.slice(0, 5).join(" ")}`.trim();
  const hook = `Watch now: ${base}`;
  const friendly = `In this video: ${base}`;
  const variants = [
    { type: "SEO", text: seo },
    { type: "Hook", text: hook },
    { type: "Friendly", text: friendly },
  ].map((v) => {
    const s = scoreCaption(v.text, k);
    const id = uuidv4();
    const rec = {
      videoId,
      variantId: id,
      type: v.type,
      text: v.text,
      seoScore: s.seoScore,
      engagementScore: s.engagementScore,
      translations: null,
    };
    store.captions.set(id, rec);
    if (firestoreEnabled) saveCaption(rec);
    return rec;
  });
  budgetCommit(videoId, "caption_gen", 3);
  res.json({ variants });
});

app.post("/captions/:videoId/score", (req, res) => {
  const { videoId } = req.params;
  const { keywords } = req.body || {};
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const k = Array.isArray(keywords)
    ? keywords
    : words(String(keywords || "")).slice(0, 6);
  const list = Array.from(store.captions.values()).filter(
    (c) => c.videoId === videoId
  );
  const updated = list.map((c) => {
    const s = scoreCaption(c.text, k);
    const rec = {
      ...c,
      seoScore: s.seoScore,
      engagementScore: s.engagementScore,
    };
    store.captions.set(c.variantId, rec);
    if (firestoreEnabled) saveCaption(rec);
    return rec;
  });
  res.json({ variants: updated });
});

app.get("/thumbnails/:videoId", (req, res) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const list = Array.from(store.thumbnails.values()).filter(
    (t) => t.videoId === videoId
  );
  res.json({ variants: list });
});

app.get("/captions/:videoId", (req, res) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const list = Array.from(store.captions.values()).filter(
    (c) => c.videoId === videoId
  );
  res.json({ variants: list });
});
app.get("/frames/:videoId", (req, res) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const list = Array.from(store.frames.values()).filter(
    (f) => f.videoId === videoId
  );
  res.json({ frames: list });
});
app.post("/frames/:videoId/extract", (req, res) => {
  const { videoId } = req.params;
  const { frequencySec, mode } = req.body || {};
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const count = 5;
  const now = Date.now();
  const frames = [];
  for (let i = 0; i < count; i++) {
    const id = uuidv4();
    const uri = `memory://frame/${id}`;
    const rec = { frameId: id, videoId, gcsUri: uri, createdAt: now + i * 10 };
    store.frames.set(id, rec);
    frames.push(rec);
  }
  addRun(videoId, "frame_extraction", "completed", now, now + 50);
  res.json({
    frames,
    frequencySec: frequencySec || 5,
    mode: mode || "interval",
  });
});

app.post("/upload-url", async (req, res) => {
  const { fileName, contentType } = req.body || {};
  if (!fileName) return res.status(400).json({ error: "fileName is required" });
  const objectName = `${uuidv4()}_${fileName}`;
  if (gcsBucket && gcsStorage) {
    try {
      const file = gcsStorage.bucket(gcsBucket).file(objectName);
      const [url] = await file.getSignedUrl({
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: contentType || "application/octet-stream",
      });
      return res.json({
        uploadUrl: url,
        objectName,
        provider: "gcs",
        resumable: false,
      });
    } catch (err) {
      const uploadUrl = `memory://uploads/${objectName}`;
      return res.json({
        uploadUrl,
        objectName,
        provider: "memory",
        resumable: false,
      });
    }
  }
  const uploadUrl = `memory://uploads/${objectName}`;
  res.json({ uploadUrl, objectName, provider: "memory", resumable: false });
});
app.post("/admin/cleanup", (req, res) => {
  const days = Number(process.env.RETENTION_DAYS || 30);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = { thumbnails: 0, frames: 0, transcripts: 0 };
  for (const [id, t] of Array.from(store.thumbnails.entries())) {
    if (t.createdAt && t.createdAt < cutoff) {
      store.thumbnails.delete(id);
      removed.thumbnails++;
    }
  }
  for (const [id, f] of Array.from(store.frames.entries())) {
    if (f.createdAt && f.createdAt < cutoff) {
      store.frames.delete(id);
      removed.frames++;
    }
  }
  for (const [vid, tr] of Array.from(store.transcripts.entries())) {
    if (tr.createdAt && tr.createdAt < cutoff) {
      store.transcripts.delete(vid);
      removed.transcripts++;
    }
  }
  res.json({ days, removed });
});

app.post("/vision/:videoId/analyze", async (req, res) => {
  const { videoId } = req.params;
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const list = Array.from(store.thumbnails.values()).filter(
    (t) => t.videoId === videoId
  );
  const bcVis = budgetCheck(videoId, "vision_analysis", list.length || 1);
  if (!bcVis.allowed)
    return res.status(429).json({
      error: "budget exceeded",
      reason: bcVis.reason,
      remaining: bcVis.remaining,
    });
  const results = [];
  for (const t of list) {
    const vf = await analyzeUri(t.gcsUri);
    const updated = { ...t, visionFeatures: vf };
    store.thumbnails.set(t.variantId, updated);
    if (firestoreEnabled) saveThumbnail(updated);
    results.push(updated);
  }
  budgetCommit(videoId, "vision_analysis", list.length || 1);
  res.json({ variants: results });
});

app.post("/thumbnails/:videoId/generate", (req, res) => {
  const { videoId } = req.params;
  const { sourceFrameUri } = req.body || {};
  const video = store.videos.get(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });
  const styles = ["preset-1", "preset-2", "preset-3", "preset-4", "preset-5"];
  const bcGen = budgetCheck(videoId, "imagen_gen", styles.length);
  if (!bcGen.allowed)
    return res.status(429).json({
      error: "budget exceeded",
      reason: bcGen.reason,
      remaining: bcGen.remaining,
    });
  const variants = styles.map((style) => {
    const id = uuidv4();
    const uri = sourceFrameUri || `memory://frame/${id}`;
    const rec = {
      videoId,
      variantId: id,
      style,
      gcsUri: uri,
      visionFeatures: null,
      ctrScore: null,
      imageData: null,
    };
    store.thumbnails.set(id, rec);
    if (firestoreEnabled) saveThumbnail(rec);
    return rec;
  });
  budgetCommit(videoId, "imagen_gen", styles.length);
  res.json({ variants });
});

function isUnsafeVideo(videoId) {
  const thumbs = Array.from(store.thumbnails.values()).filter(
    (t) => t.videoId === videoId
  );
  const caps = Array.from(store.captions.values()).filter(
    (c) => c.videoId === videoId
  );
  const badWords = ["nsfw", "explicit", "adult", "violence"];
  const capUnsafe = caps.some((c) =>
    badWords.some((w) =>
      String(c.text || "")
        .toLowerCase()
        .includes(w)
    )
  );
  const styleUnsafe = thumbs.some((t) =>
    badWords.includes(String(t.style || "").toLowerCase())
  );
  const safeSearchUnsafe = thumbs.some((t) => {
    const ss = t.visionFeatures && t.visionFeatures.safeSearch;
    if (!ss) return false;
    const lvl = (x) => String(x || "UNKNOWN");
    const high = ["LIKELY", "VERY_LIKELY"];
    return high.includes(lvl(ss.adult)) || high.includes(lvl(ss.violence));
  });
  return capUnsafe || styleUnsafe || safeSearchUnsafe;
}

app.post("/safety/:videoId/check", (req, res) => {
  const { videoId } = req.params;
  const unsafe = isUnsafeVideo(videoId);
  res.json({ unsafe });
});

function addRun(videoId, step, status, startedAt, completedAt) {
  const runId = uuidv4();
  const run = { runId, videoId, step, status, startedAt, completedAt };
  store.workflowRuns.set(runId, run);
  if (firestoreEnabled) saveWorkflowRun(run);
  return runId;
}

function updateRun(runId, updates) {
  const old = store.workflowRuns.get(runId);
  if (!old) return;
  const run = { ...old, ...updates };
  store.workflowRuns.set(runId, run);
  if (firestoreEnabled) saveWorkflowRun(run);
}

function startPipeline(videoId) {
  const now = Date.now();
  const pending = Array.from(store.workflowRuns.values()).find(
    (r) =>
      r.videoId === videoId &&
      r.step === "extracting_frames" &&
      r.status === "pending"
  );
  if (pending)
    updateRun(pending.runId, { status: "completed", completedAt: now + 50 });
  else addRun(videoId, "extracting_frames", "completed", now, now + 50);
  setTimeout(() => {
    const fNow = Date.now();
    const count = 5;
    for (let i = 0; i < count; i++) {
      const id = uuidv4();
      const uri = `memory://frame/${id}`;
      const rec = {
        frameId: id,
        videoId,
        gcsUri: uri,
        createdAt: fNow + i * 10,
      };
      store.frames.set(id, rec);
    }
    addRun(videoId, "frame_extraction", "completed", fNow, fNow + 50);
    const t1 = Date.now();
    addRun(videoId, "transcribing_audio", "completed", t1, t1 + 50);
    setTimeout(() => {
      const t2 = Date.now();
      const styles = [
        "preset-1",
        "preset-2",
        "preset-3",
        "preset-4",
        "preset-5",
      ];
      styles.forEach((style) => {
        const id = uuidv4();
        const uri = `memory://frame/${id}`;
        const rec = {
          videoId,
          variantId: id,
          style,
          gcsUri: uri,
          visionFeatures: null,
          ctrScore: null,
          imageData: null,
        };
        store.thumbnails.set(id, rec);
        if (firestoreEnabled) saveThumbnail(rec);
      });
      addRun(videoId, "generating_thumbnails", "completed", t2, t2 + 50);
      setTimeout(() => {
        const t2b = Date.now();
        const listForVision = Array.from(store.thumbnails.values()).filter(
          (x) => x.videoId === videoId
        );
        Promise.all(
          listForVision.map(async (t) => {
            const vf = await analyzeUri(t.gcsUri);
            const updated = { ...t, visionFeatures: vf };
            store.thumbnails.set(t.variantId, updated);
            if (firestoreEnabled) saveThumbnail(updated);
          })
        ).then(() => {
          addRun(videoId, "vision_analysis", "completed", t2b, t2b + 50);
          const t3 = Date.now();
          const video = store.videos.get(videoId) || { title: "" };
          const list = Array.from(store.thumbnails.values()).filter(
            (x) => x.videoId === videoId
          );
          const scored = list
            .map((t) => {
              const ctr = scoreThumbnail(t.style || "custom", video.title, []);
              const updated = { ...t, ctrScore: ctr };
              store.thumbnails.set(t.variantId, updated);
              if (firestoreEnabled) updateThumbnailCtr(t.variantId, ctr);
              return updated;
            })
            .sort((a, b) => (b.ctrScore || 0) - (a.ctrScore || 0));
          const winner = scored[0];
          if (winner && firestoreEnabled)
            updateVideoRecommended(videoId, winner.variantId);
          addRun(videoId, "scoring", "completed", t3, t3 + 50);
          setTimeout(() => {
            const t4 = Date.now();
            const v = store.videos.get(videoId);
            const updated = { ...v, status: "ready" };
            store.videos.set(videoId, updated);
            if (firestoreEnabled) saveVideo(updated);
            addRun(videoId, "ready_to_review", "completed", t4, t4 + 50);
          }, 150);
        });
      }, 150);
    }, 150);
  }, 150);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {});
