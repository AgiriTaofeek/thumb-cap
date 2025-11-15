const enabled = String(process.env.SPEECH_ENABLED || "").toLowerCase() === "true";
let client = null;
try {
  if (enabled) {
    const speech = require("@google-cloud/speech");
    client = new speech.v1p1beta1.SpeechClient();
  }
} catch (e) {
  client = null;
}

async function transcribeGcsUri(gcsUri, languageCode) {
  if (!enabled || !client || !gcsUri) return { text: "", words: [] };
  const req = {
    audio: { uri: gcsUri },
    config: {
      languageCode: languageCode || "en-US",
      enableAutomaticPunctuation: true,
      model: "video",
    },
  };
  const [op] = await client.longRunningRecognize(req);
  const [resp] = await op.promise();
  const text = (resp.results || []).map((r) => r.alternatives && r.alternatives[0] && r.alternatives[0].transcript || "").join(" ");
  return { text, words: [] };
}

module.exports = { enabled, transcribeGcsUri };
