let enabled = String(process.env.FIRESTORE_ENABLED || '').toLowerCase() === 'true';
let db = null;
try {
    const admin = require('firebase-admin');
    if (enabled && !admin.apps.length)
        admin.initializeApp();
    if (enabled)
        db = admin.firestore();
}
catch {
    enabled = false;
    db = null;
}
export { enabled };
export async function saveVideo(video) { if (!enabled)
    return; try {
    await db.collection('videos').doc(String(video.id)).set(video, { merge: true });
}
catch { } }
export async function saveThumbnail(t) { if (!enabled)
    return; try {
    await db.collection('thumbnails').doc(String(t.variantId)).set(t, { merge: true });
}
catch { } }
export async function updateThumbnailCtr(variantId, ctrScore) { if (!enabled)
    return; try {
    await db.collection('thumbnails').doc(String(variantId)).set({ ctrScore }, { merge: true });
}
catch { } }
export async function saveCaption(c) { if (!enabled)
    return; try {
    await db.collection('captions').doc(String(c.variantId)).set(c, { merge: true });
}
catch { } }
export async function saveWorkflowRun(run) { if (!enabled)
    return; try {
    await db.collection('workflowRuns').doc(String(run.runId)).set(run, { merge: true });
}
catch { } }
export async function updateVideoRecommended(videoId, recommendedThumbnailId) { if (!enabled)
    return; try {
    await db.collection('videos').doc(String(videoId)).set({ recommendedThumbnailId }, { merge: true });
}
catch { } }
