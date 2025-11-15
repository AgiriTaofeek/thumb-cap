let enabled = String(process.env.FIRESTORE_ENABLED || "").toLowerCase() === "true";
let db = null;
let adminRef = null;
try {
  const admin = require("firebase-admin");
  adminRef = admin;
  if (enabled && !admin.apps.length) admin.initializeApp();
  if (enabled) db = admin.firestore();
} catch (e) {
  enabled = false;
  db = null;
}

async function saveVideo(video) {
  if (!enabled) return;
  try { await db.collection("videos").doc(String(video.id)).set(video, { merge: true }); } catch (e) {}
}

async function saveThumbnail(t) {
  if (!enabled) return;
  try { await db.collection("thumbnails").doc(String(t.variantId)).set(t, { merge: true }); } catch (e) {}
}

async function updateThumbnailCtr(variantId, ctrScore) {
  if (!enabled) return;
  try { await db.collection("thumbnails").doc(String(variantId)).set({ ctrScore }, { merge: true }); } catch (e) {}
}

async function saveCaption(c) {
  if (!enabled) return;
  try { await db.collection("captions").doc(String(c.variantId)).set(c, { merge: true }); } catch (e) {}
}

async function saveWorkflowRun(run) {
  if (!enabled) return;
  try { await db.collection("workflowRuns").doc(String(run.runId)).set(run, { merge: true }); } catch (e) {}
}

async function updateVideoRecommended(videoId, recommendedThumbnailId) {
  if (!enabled) return;
  try { await db.collection("videos").doc(String(videoId)).set({ recommendedThumbnailId }, { merge: true }); } catch (e) {}
}

module.exports = {
  enabled,
  saveVideo,
  saveThumbnail,
  updateThumbnailCtr,
  saveCaption,
  saveWorkflowRun,
  updateVideoRecommended,
};
