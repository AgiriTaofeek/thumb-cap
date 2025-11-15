# Overview

- Backend is an Express app that exposes endpoints for upload, orchestration, analysis, generation, scoring, recommendations, captions, and YouTube publishing.
- It runs a simulated end-to-end pipeline by default using in-memory storage and mock URIs; real GCP integrations are feature-gated via environment variables.
- Core entrypoint and route mounting live in backend/src/app.ts:20-48; the HTTP server bootstraps from backend/src/server.ts (agent survey).

## Entrypoint & Middleware

- Express setup and router mounting: backend/src/app.ts:20-48
- Middleware:
  - JSON body limit 10MB: backend/src/app.ts:21
  - CORS: backend/src/app.ts:22
  - HTTP logging (morgan): backend/src/app.ts:23
  - Request ID injection: backend/src/app.ts:24-30 calls attachRequestId from backend/src/logger.ts:6-11
  - Health check: GET /health logs and returns status: backend/src/app.ts:32-35
  - 404 handler and error handler: backend/src/app.ts:50-67

## Routers & Endpoints

- Mounted routers: backend/src/app.ts:37-48
  - GET /videos/ and GET /videos/:videoId/summary: backend/src/features/videos/videos.router.ts:6-24
  - GET /frames/:videoId, POST /frames/:videoId/extract: backend/src/features/frames/frames.router.ts:7-37
  - POST /vision/:videoId/analyze: backend/src/features/vision/vision.router.ts:8-25
  - GET /thumbnails/:videoId, POST /thumbnails/:videoId/generate, POST /thumbnails/:videoId/score: backend/src/features/thumbnails/thumbnails.router.ts:11-68
  - POST /captions/:videoId/generate, POST /captions/:videoId/score, GET /captions/:videoId, POST /captions/translate/:videoId, POST /captions/transcribe/:videoId, GET /captions/transcript/:videoId: backend/src/features/captions/captions.router.ts:11-105
  - GET /recommendations/:videoId: backend/src/features/recommendations/recommendations.router.ts:6-16
  - POST /safety/:videoId/check: backend/src/features/safety/safety.router.ts:24-28
  - OAuth: GET /oauth/url, GET /oauth/callback: backend/src/features/publish/oauth.router.ts:7-25
  - YouTube publishing: POST /youtube/publish, POST /youtube/thumbnail: backend/src/features/publish/youtube.router.ts:7-21, backend/src/features/publish/youtube.router.ts:37-58
  - Orchestration: GET /budget/:videoId, POST /process, GET /status/:videoId, GET /status/:videoId/stream: backend/src/features/orchestration/orchestration.router.ts:12-15, backend/src/features/orchestration/orchestration.router.ts:17-35, backend/src/features/orchestration/orchestration.router.ts:37-44, backend/src/features/orchestration/orchestration.router.ts:46-65
  - Upload signed URL (mock): POST /upload-url: backend/src/shared/upload.router.ts:6-12

## Data Model (In-Memory Store)

- videos, thumbnails, captions, workflowRuns, frames, transcripts, tokens: backend/src/store.ts:1-14
- These Maps simulate Firestore collections and are used across endpoints.

## Pipeline Flow (End-to-End)

- Trigger: POST /process creates a videos record and an initial workflow run; optionally publishes a Pub/Sub message and starts the pipeline: backend/src/features/orchestration/orchestration.router.ts:17-35
- Pub/Sub hook: POST /hooks/pubsub validates token, decodes message, and starts pipeline on video_uploaded: backend/src/features/orchestration/hooks.router.ts:7-28
- Orchestrated steps (simulated timers): backend/src/features/orchestration/pipeline.service.ts:26-91
  - Mark extracting_frames done: pipeline.service.ts:27-33
  - Extract frames (5 mock frames): pipeline.service.ts:35-43
  - Transcribing audio (completed run): pipeline.service.ts:44-46
  - Generate 5 thumbnail styles: pipeline.service.ts:47-55
  - Vision analysis per thumbnail: pipeline.service.ts:56-67 calls analyzeUri
  - Scoring thumbnails and pick winner: pipeline.service.ts:67-79 uses scoreThumbnail
  - Set video ready and mark ready_to_review: pipeline.service.ts:80-86
- Status:
  - Poll: GET /status/:videoId returns video and runs: backend/src/features/orchestration/orchestration.router.ts:37-44
  - Stream: GET /status/:videoId/stream uses SSE to emit status every second: backend/src/features/orchestration/orchestration.router.ts:46-65

## Functional Requirement Mapping

- Video Upload & Storage
  - Signed upload URL (mock memory provider): backend/src/shared/upload.router.ts:6-12; currently returns memory://uploads/.... Real GCS signed URLs are not wired in src (legacy exists).
- Orchestration Trigger
  - On /process, optionally publishes Pub/Sub video_uploaded: backend/src/features/orchestration/orchestration.router.ts:27-33 via publishMessage (feature-gated): backend/src/pubsub.ts:1-16
  - Pipeline starts either from /process or Pub/Sub hook: backend/src/features/orchestration/orchestration.router.ts:34-35, backend/src/features/orchestration/hooks.router.ts:25-27
- Status & Progress
  - Workflow runs recorded in store.workflowRuns: backend/src/store.ts:4, updated via addRun/updateRun: backend/src/features/orchestration/pipeline.service.ts:6-24
  - Status polling and SSE endpoint: backend/src/features/orchestration/orchestration.router.ts:37-44, backend/src/features/orchestration/orchestration.router.ts:46-65
- Frame Extraction
  - Simulated frames; POST /frames/:videoId/extract accepts frequencySec and mode: backend/src/features/frames/frames.router.ts:17-37
  - Frames listed via GET /frames/:videoId: backend/src/features/frames/frames.router.ts:7-15
- Vision Analysis
  - POST /vision/:videoId/analyze iterates thumbnails and annotates: backend/src/features/vision/vision.router.ts:8-25
  - Vision client (feature-gated) returning faces, dominant colors, safe search: backend/src/vision.ts:1-28
- Thumbnail Generation
  - POST /thumbnails/:videoId/generate produces 5 preset styles and records data: backend/src/features/thumbnails/thumbnails.router.ts:19-37
  - Styles are placeholders; images reference memory:// URIs.
- CTR Prediction
  - POST /thumbnails/:videoId/score computes CTR either via Vertex or heuristic: backend/src/features/thumbnails/thumbnails.router.ts:39-68
  - Vertex prediction client (feature-gated): backend/src/prediction.ts:1-25; heuristic fallback heuristicCTR: backend/src/prediction.ts:5-12
- Transcription
  - POST /captions/transcribe/:videoId triggers Speech-to-Text if enabled, otherwise mock transcript: backend/src/features/captions/captions.router.ts:82-98
  - Speech client (feature-gated): backend/src/speech.ts:1-16
- Caption Generation
  - POST /captions/:videoId/generate creates SEO/Hook/Friendly variants and scores them: backend/src/features/captions/captions.router.ts:11-38
  - Caption scoring heuristics: backend/src/shared/utils/scoring.ts:3-28
- SEO Scoring
  - Re-score captions with keywords: backend/src/features/captions/captions.router.ts:40-53
- Edit Interface (Backend Handling)
  - Backend accepts edited image data as a data URL for YouTube thumbnail publishing via POST /youtube/thumbnail: backend/src/features/publish/youtube.router.ts:37-58
  - There is no dedicated /edit storage endpoint; edited PNG is expected from the frontend.
- Smart Remix
  - Recommendations endpoint returns best thumbnail and captions: backend/src/features/recommendations/recommendations.router.ts:6-16
- Publish to YouTube
  - OAuth URL and callback: backend/src/features/publish/oauth.router.ts:7-25
  - Update title/description: backend/src/features/publish/youtube.router.ts:7-21 calls updateVideoMetadata: backend/src/youtube.ts:16
  - Upload thumbnail: backend/src/features/publish/youtube.router.ts:37-58 calls uploadThumbnail: backend/src/youtube.ts:17
  - OAuth client & API wiring (feature-gated): backend/src/youtube.ts:1-17
- Localization
  Translation API (feature-gated) via POST /captions/translate/:videoId: backend/src/features/captions/captions.router.ts:64-80, client: backend/src/translation.ts:1-13
- Observability & Logs
  - Structured logs via log(level, event, meta): backend/src/logger.ts:2-5
  - Request IDs for tracing: backend/src/logger.ts:6-11
- Error Handling & Retries
  - Global 404 and error middleware: backend/src/app.ts:50-67
  - Exponential backoff utility: backend/src/retry.ts:1-16 (used for Pub/Sub publish): backend/src/features/orchestration/orchestration.router.ts:28-32

## Budget & Cost Guardrails

- Guardrail checks on generation/prediction/vision/captions: backend/src/cost.ts:1-12
  - Per-video Imagen limit MAX_IMAGEN_PER_VIDEO, per-video and daily budgets.
  - Endpoint usage examples: thumbnails generate check/commit: backend/src/features/thumbnails/thumbnails.router.ts:25-36; prediction check/commit: backend/src/features/thumbnails/thumbnails.router.ts:46-67; vision check/commit: backend/src/features/vision/vision.router.ts:13-24; caption generation check/commit: backend/src/features/captions/captions.router.ts:17-37
  - Budget status endpoint: GET /budget/:videoId: backend/src/features/orchestration/orchestration.router.ts:12-15

## Security & Safety

- Pub/Sub hook token checks via env or header: backend/src/features/orchestration/hooks.router.ts:9-12
- Safety check endpoint uses SafeSearch and simple keyword policy: backend/src/features/safety/safety.router.ts:6-22, backend/src/features/safety/safety.router.ts:24-28
- YouTube OAuth requires stored tokens keyed by userId: backend/src/features/publish/youtube.router.ts:11-14, backend/src/features/publish/youtube.router.ts:41-44

## Firestore (Prepared, Not Wired)

- Firestore helpers exist but are not currently called by routes: backend/src/firestore.ts:1-17
- If FIRESTORE_ENABLED=true, you could persist videos, thumbnails, captions, workflowRuns, and recommended winners via these functions.

## Environment Feature Gates

- Pub/Sub: PUBSUB_ENABLED, PUBSUB_TOPIC: backend/src/pubsub.ts:1-16
- Vision: VISION_ENABLED: backend/src/vision.ts:1-9
- Speech-to-Text: SPEECH_ENABLED: backend/src/speech.ts:1-9
- Translation: TRANSLATE_ENABLED: backend/src/translation.ts:1-9
- Vertex AI Prediction: VERTEX_ENABLED, VERTEX_PREDICTION_URL: backend/src/prediction.ts:1-3
- YouTube OAuth: YOUTUBE_OAUTH_ENABLED, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URL: backend/src/youtube.ts:2-11
- Cost Guardrails: COST_GUARDRAILS_ENABLED, MAX_IMAGEN_PER_VIDEO, VIDEO_BUDGET_USD, DAILY_BUDGET_USD, per-call costs: backend/src/cost.ts:1-12

## How It Lines Up With The PRD

- Time-to-first-results: The pipeline simulates frames, thumbnails, vision, and scoring via timers, enabling quick UI demo flow. Real services toggle on via env.
- 3–5 thumbnails and CTR scoring: Generated in generate and scored in score endpoints; winner chosen and surfaced in recommendations.
- 3 caption styles and SEO/Engagement: Generated and scored; optional translation supported.
- Status/progress: Stored runs and SSE stream expose orchestration state for UI progress bars.
- Publishing: OAuth, metadata update, and thumbnail upload are wired; edited image data is accepted as data URL for upload.
- Safety and cost guardrails: Budget checks across expensive steps and a simple safety gate using Vision SafeSearch and keywords.

## Notable Gaps vs. PRD

- Real GCS signed upload URLs and resumable uploads are mocked (memory://); a GCS Storage client is not wired in src.
- Cloud Workflows is not present; orchestration is handled inside the app via timers and helper functions.
- Firestore persistence prepared but not invoked; current persistence uses in-memory store.
- FFmpeg frame extraction is simulated; Vision analysis expects gs:// URIs and falls back to mock features otherwise.

If you want, I can wire Firestore writes into the relevant endpoints, swap the upload URL generator to real GCS signed URLs, and make frame extraction use FFmpeg in Cloud Run behind a feature gate, so the backend fully matches the PRD operationally.
