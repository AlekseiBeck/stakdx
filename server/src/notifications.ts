import webpush from 'web-push';
import { StoredPushSubscription } from './types';

// ─── VAPID setup ─────────────────────────────────────────────────────────────
// Generate keys once with: npx web-push generate-vapid-keys
// Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your .env

export function initWebPush(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@stakd.com';

  if (!publicKey || !privateKey) {
    console.warn('[notifications] VAPID keys not set — push notifications disabled.');
    console.warn('  Generate keys: npx web-push generate-vapid-keys');
    console.warn('  Then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to server/.env');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  console.log('[notifications] Web push initialized.');
}

export function hasVapidKeys(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// ─── Send push to a single subscription ─────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function sendPushNotification(
  subscription: StoredPushSubscription,
  payload: PushPayload
): Promise<boolean> {
  if (!hasVapidKeys()) return false;

  const pushSubscription: webpush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return true;
  } catch (err: any) {
    // 410 Gone = subscription expired/unregistered — caller should delete it
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      throw new Error('SUBSCRIPTION_EXPIRED');
    }
    console.error('[notifications] Push send error:', err?.message ?? err);
    return false;
  }
}

// ─── Send to all subscriptions for a user ────────────────────────────────────

export async function sendToUser(
  subscriptions: StoredPushSubscription[],
  payload: PushPayload,
  onExpired: (subId: string) => Promise<void>
): Promise<void> {
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await sendPushNotification(sub, payload);
      } catch (err: any) {
        if (err?.message === 'SUBSCRIPTION_EXPIRED') {
          await onExpired(sub.id);
        }
      }
    })
  );
}
