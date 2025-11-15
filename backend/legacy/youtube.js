const { google } = require("googleapis");

const enabled = String(process.env.YOUTUBE_OAUTH_ENABLED || "").toLowerCase() === "true";
const clientId = process.env.GOOGLE_CLIENT_ID || null;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || null;
const redirectUri = process.env.OAUTH_REDIRECT_URL || null;

let oauth2 = null;
let youtube = null;
if (enabled && clientId && clientSecret && redirectUri) {
  oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  youtube = google.youtube({ version: "v3", auth: oauth2 });
}

function getAuthUrl(scopes) {
  if (!oauth2) return null;
  return oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: scopes || ["https://www.googleapis.com/auth/youtube"] });
}

async function exchangeCode(code) {
  if (!oauth2) return null;
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  return tokens;
}

function setTokens(tokens) {
  if (!oauth2) return false;
  oauth2.setCredentials(tokens);
  return true;
}

async function updateVideoMetadata({ youtubeVideoId, title, description }) {
  if (!youtube || !oauth2) return false;
  await youtube.videos.update({ part: ["snippet"], requestBody: { id: youtubeVideoId, snippet: { title, description } } });
  return true;
}

async function uploadThumbnail({ youtubeVideoId, buffer, mimeType }) {
  if (!youtube || !oauth2) return false;
  await youtube.thumbnails.set({
    videoId: youtubeVideoId,
    media: { mimeType: mimeType || "image/png", body: buffer },
  });
  return true;
}

module.exports = { enabled, getAuthUrl, exchangeCode, setTokens, updateVideoMetadata, uploadThumbnail };
