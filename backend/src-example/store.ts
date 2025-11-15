export type Video = { id: string; userId: string | null; status: string; gcsUri: string; title: string; language: string; createdAt: number; youtubeVideoId?: string | null };
export type Thumbnail = { videoId: string; variantId: string; style: string; gcsUri: string; visionFeatures: any; ctrScore: number | null; imageData: string | null; createdAt?: number };
export type Caption = { videoId: string; variantId: string; type: string; text: string; seoScore: number | null; engagementScore: number | null; translations: Record<string,string> | null };
export type WorkflowRun = { runId: string; videoId: string; step: string; status: string; startedAt: number; completedAt: number | null };

export const store = {
  videos: new Map<string, Video>(),
  thumbnails: new Map<string, Thumbnail>(),
  captions: new Map<string, Caption>(),
  workflowRuns: new Map<string, WorkflowRun>(),
  tokens: new Map<string, any>(),
  frames: new Map<string, { frameId: string; videoId: string; gcsUri: string; createdAt: number }>(),
  transcripts: new Map<string, { videoId: string; text: string; createdAt: number }>(),
};

