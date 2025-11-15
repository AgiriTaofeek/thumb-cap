## High-Level Flow

- Upload URL is requested, the client uploads the file, then the pipeline is kicked off via a process endpoint and runs simulated steps to reach “Ready to Review”.
- Progress can be polled or streamed. Thumbnails and captions are generated/scored via endpoints. Recommendations are surfaced. Safety checks and cost guardrails run. OAuth enables final publish to YouTube.

## Upload

- Request signed URL: POST /upload-url returns a mock upload URL and object name for the client to use with resumable upload UI.
  - Code: backend/src/shared/upload.router.ts:6-12
  - Response example includes uploadUrl: "memory://uploads/\<uuid>\_\<fileName>", resumable: false.
  - Client uploads the video to the returned URL (mocked in-memory in current setup).

## Pipeline Trigger

- After upload completes, the frontend starts orchestration:
  - Trigger: POST /process with gcsUri, title, optional language.
    - Code: backend/src/features/orchestration/orchestration.router.ts:17-35
    - Effect:
      - Creates/updates videos record in-memory and seeds initial workflowRuns.
      - Optionally publishes a Pub/Sub video_uploaded message if PUBSUB_ENABLED is set: backend/src/features/orchestration/orchestration.router.ts:27-33, publisher: backend/src/pubsub.ts:1-16
      - Starts the pipeline immediately via startPipeline(videoId).

## Alternative Trigger (Pub/Sub)

- If Cloud Storage completion emits Pub/Sub, and your infra routes it to the backend:
  - Hook: POST /hooks/pubsub validates token, decodes payload, and starts pipeline when type === "video_uploaded".
    - Code: backend/src/features/orchestration/hooks.router.ts:7-28

## Alternative Trigger (Eventarc → Workflows)

- Use Eventarc to route Cloud Storage direct events to Workflows, eliminating the custom Pub/Sub push to the backend.
  - When an object is finalized in `gs://thumbcap-uploads`, Eventarc triggers the workflow and passes the CloudEvent payload as runtime arguments.
- Prerequisites:
  - Enable APIs: `eventarc.googleapis.com`, `eventarcpublishing.googleapis.com`, `workflows.googleapis.com`, `workflowexecutions.googleapis.com`, `storage.googleapis.com`.
  - Create a service account for invoking Workflows and grant `roles/workflows.invoker`.
  - Grant `roles/pubsub.publisher` to the Cloud Storage service agent (usually `service-PROJECT_NUMBER@gs-project-accounts.iam.gserviceaccount.com`).
- Create trigger (locations must match the bucket’s region):
  - `gcloud eventarc triggers create storage-to-workflow --location=us-central1 --destination-workflow=<WORKFLOW_NAME> --event-filters="type=google.cloud.storage.object.v1.finalized" --event-filters="bucket=thumbcap-uploads" --service-account=<SA_EMAIL>`
- Notes:
  - CloudEvents payload is delivered to Workflows and available to steps as JSON arguments.
  - Ensure event size stays within Workflows argument limits.
  - Bucket region must match trigger location (single/dual/multi-region support per Eventarc).
- Flow:
  - Upload → Cloud Storage emits finalize → Eventarc triggers Workflows → Workflow calls backend endpoints (extract, vision, thumbnails, captions) per `backend/workflows/thumbcap.yaml`.

## Orchestration & Status

- Pipeline steps (simulated timers) move the video through states and record runs:
  - Extracting frames (mark completed), generate frames, transcribing audio, generating thumbnails, vision analysis, CTR scoring, mark ready.
  - Code: backend/src/features/orchestration/pipeline.service.ts:26-91
- Get status:
  - Poll: GET /status/:videoId returns video and runs.
    - Code: backend/src/features/orchestration/orchestration.router.ts:37-44
  - Stream: GET /status/:videoId/stream (SSE) emits status snapshots every second.
    - Code: backend/src/features/orchestration/orchestration.router.ts:46-65
- Budget status:
  - GET /budget/:videoId shows per-video/daily spend and limits.
    - Code: backend/src/features/orchestration/orchestration.router.ts:12-15, backend/src/cost.ts:1-12

## Frames (FFmpeg step placeholder)

- List extracted frames: GET /frames/:videoId
  - Code: backend/src/features/frames/frames.router.ts:7-15
- Manually extract frames (configurable frequency): POST /frames/:videoId/extract
  - Code: backend/src/features/frames/frames.router.ts:17-37

## Vision Analysis

- Analyze frames/thumbnails using Vision (FACE_DETECTION, IMAGE_PROPERTIES, SAFE_SEARCH_DETECTION) and attach features to thumbnails:
  - POST /vision/:videoId/analyze runs analysis over all thumbnails for the video and persists results.
    - Code: backend/src/features/vision/vision.router.ts:8-25, client wrapper: backend/src/vision.ts:1-28
- Note: Vision calls are feature-gated. Without VISION_ENABLED, it returns safe defaults.

## Thumbnails

- List variants: GET /thumbnails/:videoId
  - Code: backend/src/features/thumbnails/thumbnails.router.ts:11-17
- Generate 5 style presets from a source frame:
  - POST /thumbnails/:videoId/generate accepts sourceFrameUri (optional), enforces cost guardrails, and creates variants.
    - Code: backend/src/features/thumbnails/thumbnails.router.ts:19-37
- Score CTR and pick winner:
  - POST /thumbnails/:videoId/score computes CTR via Vertex prediction if VERTEX_ENABLED else heuristic; sorts and returns winner.
    - Code: backend/src/features/thumbnails/thumbnails.router.ts:39-68, prediction client: backend/src/prediction.ts:1-25

## Captions

- Transcribe audio (long-running Speech-to-Text if enabled; otherwise mock):
  - POST /captions/transcribe/:videoId with gcsUri and languageCode (optional) saves transcript.
    - Code: backend/src/features/captions/captions.router.ts:82-98, speech client: backend/src/speech.ts:1-16
- Generate variants:
  - POST /captions/:videoId/generate with transcript and keywords creates SEO, Hook, Friendly variants and scores them.
  - Code: backend/src/features/captions/captions.router.ts:11-38, scoring: backend/src/shared/utils/scoring.ts:3-28
- Re-score with keywords:
  - POST /captions/:videoId/score recalculates SEO/Engagement for existing variants.
  - Code: backend/src/features/captions/captions.router.ts:40-53
- Translate:
  - POST /captions/translate/:videoId adds translations when TRANSLATE_ENABLED.
  - Code: backend/src/features/captions/captions.router.ts:64-80, client: backend/src/translation.ts:1-13
- Fetch transcript or variants:
  - GET /captions/transcript/:videoId, GET /captions/:videoId
  - Code: backend/src/features/captions/captions.router.ts:100-105, backend/src/features/captions/captions.router.ts:56-62

## Recommendations & Safety

- Recommendations:
  - GET /recommendations/:videoId returns best thumbnail (by CTR) and best SEO/Engagement captions.
  - Code: backend/src/features/recommendations/recommendations.router.ts:6-16
- Safety:
  - POST /safety/:videoId/check performs simple policy check plus SafeSearch signals.
  - Code: backend/src/features/safety/safety.router.ts:24-28

## Publish to YouTube

- OAuth:
  - Get URL: GET /oauth/url returns consent URL when YOUTUBE_OAUTH_ENABLED and creds are configured.
    - Code: backend/src/features/publish/oauth.router.ts:7-11, OAuth setup: backend/src/youtube.ts:2-13
  - Callback: GET /oauth/callback?code=<...>&userId=<...> exchanges code and stores tokens keyed by userId.
    - Code: backend/src/features/publish/oauth.router.ts:13-25
- Update metadata:
  - POST /youtube/publish with userId, youtubeVideoId, title, description updates snippet.
  - Code: backend/src/features/publish/youtube.router.ts:7-21, API call: backend/src/youtube.ts:16
- Upload thumbnail:
  - POST /youtube/thumbnail with userId, youtubeVideoId, imageData or variantId (that has imageData) uploads PNG/JPEG.
  - Code: backend/src/features/publish/youtube.router.ts:37-58, API call: backend/src/youtube.ts:17
  - imageData is a data URL (data:<mime>;base64,<...>); backend converts to buffer: backend/src/features/publish/youtube.router.ts:23-35

## Progress & Final Result

- While pipeline runs, the UI uses:
  - GET /status/:videoId or GET /status/:videoId/stream to display states like Uploading, Extracting, Transcribing, Generating, Scoring, Ready to Review.
- Once scoring completes:
  - Thumbnails and captions are available; recommendations highlight the current winner.
  - The video record is marked ready: backend/src/features/orchestration/pipeline.service.ts:80-86
- Final publish:
  - After editing in the browser editor, the client sends the edited PNG as imageData and updates title/description via the publish endpoints.
  - Success means YouTube thumbnail and metadata are set; in-memory store and optionally Firestore (if you wire it) hold artifacts and statuses.

## Cost Guardrails

- Before expensive operations (Imagen-like generation, Vision, Prediction, caption generation), budget checks run; if exceeded, endpoints return 429 with details.
  - Examples: backend/src/features/thumbnails/thumbnails.router.ts:25-36, backend/src/features/vision/vision.router.ts:13-24, backend/src/features/thumbnails/thumbnails.router.ts:46-67, backend/src/features/captions/captions.router.ts:17-37
  - Guardrail logic: backend/src/cost.ts:1-12

## Data Access

- Summary view:
  - GET /videos/:videoId/summary returns video, frames, thumbnails, captions, workflow runs, and recommended thumbnail.
  - Code: backend/src/features/videos/videos.router.ts:13-24
- Firestore helpers exist (feature-gated) to persist videos, thumbnails, captions, workflowRuns, and recommended winners if you enable them and invoke in routes.
  - Code: backend/src/firestore.ts:1-17

If you want me to align this with production GCP (real signed GCS uploads, Pub/Sub finalize trigger, Firestore writes at each step, and FFmpeg in Cloud Run), I can wire those pieces next so the flow matches the PRD end-to-end operationally.
