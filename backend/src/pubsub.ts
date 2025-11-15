import { PubSub } from "@google-cloud/pubsub";

const enabled =
  String(process.env.PUBSUB_ENABLED || "").toLowerCase() === "true";
const topicName = process.env.PUBSUB_TOPIC || null;
let client: any = null;
try {
  if (enabled) client = new PubSub();
} catch {}
export { enabled };
export async function publishMessage(
  data: any,
  attributes?: Record<string, string>
) {
  if (!enabled || !client || !topicName) return false;
  try {
    const payload: any = { json: data };
    if (attributes && typeof attributes === "object")
      payload.attributes = attributes;
    const msgId = await client.topic(topicName).publishMessage(payload);
    return !!msgId;
  } catch {
    return false;
  }
}
