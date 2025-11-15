const enabled = String(process.env.PUBSUB_ENABLED || '').toLowerCase() === 'true';
const topicName = process.env.PUBSUB_TOPIC || null;
let client = null;
try {
    const { PubSub } = require('@google-cloud/pubsub');
    if (enabled)
        client = new PubSub();
}
catch { }
export { enabled };
export async function publishMessage(data) {
    if (!enabled || !client || !topicName)
        return false;
    try {
        const msgId = await client.topic(topicName).publishMessage({ json: data });
        return !!msgId;
    }
    catch {
        return false;
    }
}
