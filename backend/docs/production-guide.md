# ThumbCap AI — Production Guide

## Overview
This guide itemizes all steps and decisions required to deploy ThumbCap AI as a real managed system on Google Cloud. It covers environment setup, services, security, observability, CI/CD, and operational runbooks.

## Prerequisites
- Google Cloud organization/project access with billing enabled
- Domain ownership (optional, for custom domain on Cloud Run)
- Basic experience with Docker, Cloud Run, Workflows, Pub/Sub, Firestore
- OAuth client for YouTube Data API v3 (for publish flows)

## Project Setup
1. Create a new GCP project and select primary region (e.g., `us-central1`).
2. Enable APIs:
   - `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`
   - `workflows.googleapis.com`, `pubsub.googleapis.com`
   - `firestore.googleapis.com`, `storage.googleapis.com`
   - `vision.googleapis.com`, `aiplatform.googleapis.com` (Vertex)
   - `speech.googleapis.com`, `translate.googleapis.com`
   - `iam.googleapis.com`, `secretmanager.googleapis.com`, `logging.googleapis.com`, `monitoring.googleapis.com`
   - `youtube.googleapis.com`
3. Set project budgets and alerts (daily, monthly) via Cloud Billing Budgets.

## IAM & Service Accounts
Create service accounts with least privilege:
- `backend-sa` (Cloud Run backend)
  - Roles: `roles/run.invoker`, `roles/storage.objectAdmin`, `roles/pubsub.publisher`, `roles/firestore.user`, `roles/secretmanager.secretAccessor`, `roles/logging.logWriter`
- `ffmpeg-sa` (Cloud Run frames extraction)
  - Roles: `roles/storage.objectAdmin`, `roles/logging.logWriter`
- `workflows-sa` (Cloud Workflows orchestration)
  - Roles: `roles/workflows.invoker`, `roles/run.invoker`, `roles/pubsub.subscriber`, `roles/firestore.user`
- `vertex-sa` (CTR prediction via Vertex)
  - Roles: `roles/aiplatform.user`

## Secrets Management
Store sensitive values in Secret Manager:
- `oauth-client-secret` (YouTube)
- `oauth-refresh-tokens/<userId>` (per-user if storing refresh tokens)
- `vertex-endpoint-key` (if applicable)
- Any third-party keys required

## Storage Buckets
Create buckets with proper policies:
- `gs://thumbcap-uploads` — raw video uploads (resumable)
- `gs://thumbcap-frames` — extracted frames (private)
- `gs://thumbcap-assets` — generated thumbnails and exports
Configure lifecycle rules:
- Auto-delete frames and intermediate assets after `RETENTION_DAYS` (default 30)
- Optionally use storage classes for cost optimization (Nearline/Coldline)

## Firestore
Choose Native mode. Collections:
- `videos` — { id, userId, status, gcsUri, title, language, createdAt, youtubeVideoId?, recommendedThumbnailId? }
- `thumbnails` — { videoId, variantId, style, gcsUri, visionFeatures, ctrScore, createdAt }
- `captions` — { videoId, variantId, type, text, seoScore, engagementScore, translations }
- `workflowRuns` — { runId, videoId, step, status, startedAt, completedAt }
Indexes:
- `workflowRuns` filter `videoId`
- `thumbnails` filter `videoId`

## Pub/Sub
- Topic: `video-uploads`
- Push subscription to backend `POST /hooks/pubsub` with attribute token; set `PUBSUB_TOKEN` env and header `x-pubsub-token`.
- Consider dead-letter topic and max delivery attempts.

## Cloud Workflows (Orchestration)
Define a workflow that:
- Ingests Pub/Sub payload `{ type: 'video_uploaded', videoId, gcsUri, title }`
- Steps:
  1. Frames extraction (Cloud Run FFmpeg): write frames to `gs://thumbcap-frames/<videoId>/<frameId>.png`
  2. Vision analysis: annotate frames/thumbnails with faces, dominant colors, SafeSearch
  3. Thumbnail generation: call Vertex Imagen or custom generator (cap at 5 styles)
  4. CTR prediction: call Vertex endpoint (AutoML Regression) or heuristic fallback
  5. Transcription: Cloud Speech-to-Text long-running
  6. Caption generation: 3 variants; score for SEO/engagement
  7. Update Firestore at each step; record `workflowRuns`
- Error handling: retries with exponential backoff; surface failures to logs and status

## Cloud Run — Backend API
- Containerize the Node/TypeScript app and deploy to Cloud Run.
- Recommended settings:
  - Concurrency: 80–200
  - Min instances: 1–2 (reduce cold starts)
  - CPU allocation: during requests
- Attach `backend-sa`. Configure env vars:
  - `PORT`
  - `GCS_BUCKET`, `RETENTION_DAYS`
  - `FIRESTORE_ENABLED=true`
  - `PUBSUB_ENABLED=true`, `PUBSUB_TOPIC=video-uploads`, `PUBSUB_TOKEN=<secret>`
  - `VISION_ENABLED=true`
  - `VERTEX_ENABLED=true`, `VERTEX_PREDICTION_URL=https://...`
  - `SPEECH_ENABLED=true`, `TRANSLATE_ENABLED=true`
  - `YOUTUBE_OAUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URL`
  - `COST_GUARDRAILS_ENABLED=true` and cost budgets (`VIDEO_BUDGET_USD`, `DAILY_BUDGET_USD`, per-call costs)

## Cloud Run — FFmpeg Frames Extraction
- Implement a service that accepts `videoId`, `gcsUri`, and extraction mode/interval.
- Use FFmpeg to extract frames to `gs://thumbcap-frames/<videoId>/<frameId>.png`.
- Emit structured logs; enforce timeouts and retries.
- Attach `ffmpeg-sa` with storage write permissions.

## Vertex AI — CTR Prediction
- Host or configure a Vertex endpoint. Feature schema:
  - `style` (categorical), `titleTokens` (text tokens), `faces` (numeric), `dominantColors` (encoded categorical)
- Response normalized to 0–100.
- Define quotas and timeouts; fallback to heuristic scoring on errors.

## Vision API
- Use `FACE_DETECTION`, `IMAGE_PROPERTIES`, `SAFE_SEARCH_DETECTION` on `gs://` inputs.
- Persist annotations in `thumbnails.visionFeatures`.
- Enforce SafeSearch gating before publish.

## Speech-to-Text & Audio Extraction
- Use long-running recognize for videos; set `languageCode`.
- If needed, extract audio via FFmpeg before submitting to Speech.
- Store transcript in `transcripts` (or `videos` with a subfield).

## Translation (Optional)
- Enable for caption variants; supported languages: `es`, `fr`, `pt`, `de` etc.
- Present translations in UI with language selection.

## YouTube Integration
- OAuth setup: consent screen, required scopes (`youtube`, `youtube.upload`).
- Client credentials in Secret Manager; tokens stored securely (Firestore + CMEK or Secret Manager).
- Endpoints:
  - `videos.update` (title/description)
  - `thumbnails.set` (PNG/JPG format requirements)
- App verification may be needed; prepare privacy policy, terms, and data handling disclosures.

## Frontend Integration
- Uploads:
  - Request signed URL (`POST /upload-url`); perform resumable client upload to Cloud Storage.
- Status:
  - Poll `GET /status/:videoId` or subscribe with SSE `GET /status/:videoId/stream`.
- Review:
  - `GET /videos/:videoId/summary` to display thumbnails with CTR, captions with SEO/Engagement badges, and recommended winner.
- Publish:
  - OAuth flow (`/oauth/url`, `/oauth/callback`), then set metadata and thumbnail.

## Cost Guardrails
- Enable `COST_GUARDRAILS_ENABLED=true`; configure budgets:
  - `MAX_IMAGEN_PER_VIDEO` (default 5)
  - `VIDEO_BUDGET_USD` (default 10), `DAILY_BUDGET_USD` (default 50)
  - Per-call costs: `COST_IMAGEN_USD`, `COST_VISION_USD`, `COST_PREDICT_USD`, `COST_CAPTION_USD`
- Enforced on generation, vision analysis, CTR scoring, and caption generation.

## Observability & Alerts
- Structured JSON logs with request IDs and event names.
- Monitoring dashboards:
  - Pipeline timings (upload → ready), success/failure rates per step
  - Pub/Sub backlog and DLQ
  - API quotas and latency histograms
- Alerts:
  - Error spikes in backend/FFmpeg/Workflows
  - Budget threshold crossing (daily/project)
  - OAuth refresh failures

## Security & Compliance
- IAM least privilege for all service accounts.
- Secret Manager for credentials; rotate on schedule.
- Enforce HTTPS; set HSTS.
- Content safety: Vision SafeSearch and Vertex safety settings for generation.
- Data retention:
  - `POST /admin/cleanup` respects `RETENTION_DAYS`; set bucket lifecycle rules.
- Legal/compliance:
  - DMCA process, user content policies, privacy policy, terms, GDPR/CCPA deletion support.

## CI/CD
- Container build and deploy via Cloud Build:
  - Build steps: install, lint, test, compile, push to Artifact Registry
  - Deploy to Cloud Run backend (`thumbcap-backend`) and FFmpeg service
- Git triggers on main branch; use canary or blue/green deployment if needed.

## Testing Strategy
- Unit tests: scoring, safety gating, budget checks
- Integration tests: pipeline orchestration with mock services
- E2E staging runs: limited quotas, synthetic videos, golden outputs

## Deployment Checklist
- APIs enabled
- Buckets created with lifecycle policies
- Firestore initialized and indexes set
- Service accounts created and assigned
- Secrets stored
- Backend and FFmpeg images built and deployed
- Pub/Sub topic and push subscription configured
- Workflows deployed and bound to Pub/Sub
- Vertex endpoint configured (if enabled)
- OAuth client configured; consent screen verified
- Monitoring dashboards and alerts created
- Cost guardrails enabled and tested

## Environment Variables Matrix
- Core: `PORT`, `RETENTION_DAYS`
- Storage: `GCS_BUCKET`
- Firestore: `FIRESTORE_ENABLED`
- Pub/Sub: `PUBSUB_ENABLED`, `PUBSUB_TOPIC`, `PUBSUB_TOKEN`
- Vision: `VISION_ENABLED`
- Vertex: `VERTEX_ENABLED`, `VERTEX_PREDICTION_URL`
- Speech: `SPEECH_ENABLED`
- Translation: `TRANSLATE_ENABLED`
- YouTube: `YOUTUBE_OAUTH_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URL`
- Guardrails: `COST_GUARDRAILS_ENABLED`, `MAX_IMAGEN_PER_VIDEO`, `VIDEO_BUDGET_USD`, `DAILY_BUDGET_USD`, `COST_IMAGEN_USD`, `COST_VISION_USD`, `COST_PREDICT_USD`, `COST_CAPTION_USD`

## Example Cloud Workflows Skeleton (HTTP Orchestration)
```yaml
main:
  params: [event]
  steps:
  - init:
      assign:
      - videoId: ${event.videoId}
      - gcsUri: ${event.gcsUri}
  - extractFrames:
      call: http.post
      args:
        url: ${"https://<BACKEND_URL>/frames/" + videoId + "/extract"}
        body: { frequencySec: 5 }
  - visionAnalyze:
      call: http.post
      args:
        url: ${"https://<BACKEND_URL>/vision/" + videoId + "/analyze"}
  - generateThumbnails:
      call: http.post
      args:
        url: ${"https://<BACKEND_URL>/thumbnails/" + videoId + "/generate"}
        body: {}
  - scoreThumbnails:
      call: http.post
      args:
        url: ${"https://<BACKEND_URL>/thumbnails/" + videoId + "/score"}
        body: { title: "<Title>", keywords: ["thumbnail","CTR"] }
  - transcribe:
      call: http.post
      args:
        url: ${"https://<BACKEND_URL>/transcribe/" + videoId}
        body: {}
  - captions:
      call: http.post
      args:
        url: ${"https://<BACKEND_URL>/captions/" + videoId + "/generate"}
        body: { transcript: "<Transcript>", keywords: ["thumbnail","CTR"] }
```

## Example Cloud Build (Backend)
```yaml
steps:
- name: gcr.io/cloud-builders/npm
  args: ["ci"]
- name: gcr.io/cloud-builders/npm
  args: ["run","build"]
- name: gcr.io/cloud-builders/docker
  args: ["build","-t","us-central1-docker.pkg.dev/$PROJECT_ID/thumbcap-repo/backend:$SHORT_SHA","."]
- name: gcr.io/cloud-builders/docker
  args: ["push","us-central1-docker.pkg.dev/$PROJECT_ID/thumbcap-repo/backend:$SHORT_SHA"]
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  args: ["run","deploy","thumbcap-backend","--image","us-central1-docker.pkg.dev/$PROJECT_ID/thumbcap-repo/backend:$SHORT_SHA","--region","us-central1","--service-account","backend-sa","--allow-unauthenticated"]
```

## Operational Runbooks
- Incident: triage errors via Error Reporting, check Pub/Sub backlog, examine Workflows execution history.
- Rollback: redeploy previous image tag to Cloud Run; disable failing workflow step.
- Token issues: refresh via OAuth; rotate client secrets in Secret Manager.
- Budget: increase or lower quotas; adjust cost guardrails; pause generation to control spend.

## Notes
- App verification for YouTube may require privacy policy/terms and manual review.
- Cold-starts: set min instances on Cloud Run and consider regional choices for latency.
- Data deletion: ensure user-initiated delete cascades to Firestore and Storage assets.

