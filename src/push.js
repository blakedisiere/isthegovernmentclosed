const webpush = require('web-push');

// VAPID keys should be set as environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@isthegovernmentclosed.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// In-memory subscription store
// For production at scale, migrate to DynamoDB or S3
const subscriptions = new Map();

function addSubscription(subscription) {
  const key = subscription.endpoint;
  subscriptions.set(key, subscription);
}

function removeSubscription(endpoint) {
  subscriptions.delete(endpoint);
}

function getSubscriptionCount() {
  return subscriptions.size;
}

async function sendNotificationToAll(payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, skipping push notifications');
    return { sent: 0, failed: 0 };
  }

  const message = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  const promises = Array.from(subscriptions.entries()).map(async ([endpoint, sub]) => {
    try {
      await webpush.sendNotification(sub, message);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription expired or unsubscribed
        subscriptions.delete(endpoint);
      }
    }
  });

  await Promise.all(promises);
  return { sent, failed };
}

module.exports = {
  addSubscription,
  removeSubscription,
  getSubscriptionCount,
  sendNotificationToAll,
  VAPID_PUBLIC_KEY,
};
