const base = import.meta.env.VITE_API_URL || "";

async function j(method: string, path: string, body?: any) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function getUploadUrl(fileName: string) {
  return j("POST", "/upload-url", { fileName });
}

export function uploadFile(
  url: string,
  file: File,
  onProgress?: (p: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(String(xhr.status)));
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

export function startProcess(payload: {
  gcsUri: string;
  title: string;
  language?: string;
  videoId?: string;
}) {
  return j("POST", "/process", payload);
}

export function getStatus(videoId: string) {
  return j("GET", `/status/${videoId}`);
}

export function getVideoSummary(videoId: string) {
  return j("GET", `/videos/${videoId}/summary`);
}

export function listThumbnails(videoId: string) {
  return j("GET", `/thumbnails/${videoId}`);
}

export function generateThumbnails(videoId: string, sourceFrameUri?: string) {
  return j("POST", `/thumbnails/${videoId}/generate`, { sourceFrameUri });
}

export function analyzeVision(videoId: string) {
  return j("POST", `/vision/${videoId}/analyze`);
}

export function scoreThumbnails(
  videoId: string,
  title: string,
  keywords?: string[]
) {
  return j("POST", `/thumbnails/${videoId}/score`, { title, keywords });
}

export function listFrames(videoId: string) {
  return j("GET", `/frames/${videoId}`);
}

export function extractFrames(
  videoId: string,
  frequencySec?: number,
  mode?: string
) {
  return j("POST", `/frames/${videoId}/extract`, { frequencySec, mode });
}

export function transcribe(
  videoId: string,
  gcsUri?: string,
  languageCode?: string
) {
  return j("POST", `/captions/transcribe/${videoId}`, { gcsUri, languageCode });
}

export function getTranscript(videoId: string) {
  return j("GET", `/captions/transcript/${videoId}`);
}

export function generateCaptions(
  videoId: string,
  transcript: string,
  keywords?: string[]
) {
  return j("POST", `/captions/${videoId}/generate`, { transcript, keywords });
}

export function listCaptions(videoId: string) {
  return j("GET", `/captions/${videoId}`);
}

export function scoreCaptions(videoId: string, keywords?: string[]) {
  return j("POST", `/captions/${videoId}/score`, { keywords });
}

export function getOAuthUrl() {
  return j("GET", "/oauth/url");
}

export function exchangeOAuthCode(code: string, userId: string) {
  const params = new URLSearchParams({ code, userId });
  return j("GET", `/oauth/callback?${params.toString()}`);
}

export function publishYouTube(payload: {
  userId?: string;
  youtubeVideoId: string;
  title?: string;
  description?: string;
}) {
  return j("POST", "/youtube/publish", payload);
}

export function uploadYouTubeThumbnail(payload: {
  userId?: string;
  youtubeVideoId: string;
  variantId?: string;
  imageData?: string;
}) {
  return j("POST", "/youtube/thumbnail", payload);
}
