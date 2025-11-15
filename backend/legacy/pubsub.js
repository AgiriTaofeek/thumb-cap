let enabled = String(process.env.PUBSUB_ENABLED || "").toLowerCase() === "true";
let client = null;
let topicName = process.env.PUBSUB_TOPIC || null;
try {
  const { PubSub } = require("@google-cloud/pubsub");
  if (enabled) client = new PubSub();
} catch (e) {
  enabled = false;
  client = null;
}

async function publishMessage(data) {
  if (!enabled || !client || !topicName) return false;
  try {
    const msgId = await client.topic(topicName).publishMessage({ json: data });
    return !!msgId;
  } catch (e) {
    return false;
  }
}

module.exports = { enabled, publishMessage };
