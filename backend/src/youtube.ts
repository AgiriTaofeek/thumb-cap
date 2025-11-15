import { google } from 'googleapis'
const enabled = String(process.env.YOUTUBE_OAUTH_ENABLED || '').toLowerCase() === 'true'
const clientId = process.env.GOOGLE_CLIENT_ID || null
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || null
const redirectUri = process.env.OAUTH_REDIRECT_URL || null
let oauth2: any = null
let yt: any = null
if (enabled && clientId && clientSecret && redirectUri) {
  oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  yt = google.youtube({ version: 'v3', auth: oauth2 })
}
export { enabled }
export function getAuthUrl(scopes?: string[]) { if (!oauth2) return null; return oauth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes || ['https://www.googleapis.com/auth/youtube'] }) }
export async function exchangeCode(code: string) { if (!oauth2) return null; const { tokens } = await oauth2.getToken(code); oauth2.setCredentials(tokens); return tokens }
export function setTokens(tokens: any) { if (!oauth2) return false; oauth2.setCredentials(tokens); return true }
export async function updateVideoMetadata({ youtubeVideoId, title, description }: { youtubeVideoId: string, title?: string, description?: string }) { if (!yt || !oauth2) return false; await yt.videos.update({ part: ['snippet'], requestBody: { id: youtubeVideoId, snippet: { title, description } } }); return true }
export async function uploadThumbnail({ youtubeVideoId, buffer, mimeType }: { youtubeVideoId: string, buffer: Buffer, mimeType?: string }) { if (!yt || !oauth2) return false; await yt.thumbnails.set({ videoId: youtubeVideoId, media: { mimeType: mimeType || 'image/png', body: buffer } }); return true }

