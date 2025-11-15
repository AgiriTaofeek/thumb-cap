const enabled = String(process.env.TRANSLATE_ENABLED || "").toLowerCase() === "true";
let client = null;
try {
  if (enabled) {
    const { Translate } = require("@google-cloud/translate").v2;
    client = new Translate();
  }
} catch (e) {
  client = null;
}

async function translateText(text, target) {
  if (!enabled || !client || !text || !target) return { translatedText: text };
  const [translated] = await client.translate(text, target);
  return { translatedText: translated };
}

module.exports = { enabled, translateText };
