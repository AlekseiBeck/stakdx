import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock web-push so no real VAPID/network work happens.
const { setVapidDetails, sendNotification } = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock('web-push', () => ({ default: { setVapidDetails, sendNotification } }));

import { initWebPush, hasVapidKeys, sendPushNotification, sendToUser } from '../src/notifications';
import type { StoredPushSubscription } from '../src/types';

const sub = (id: string): StoredPushSubscription => ({
  id, endpoint: `https://push/${id}`, p256dh: 'p', auth: 'a',
} as StoredPushSubscription);

beforeEach(() => {
  setVapidDetails.mockReset();
  sendNotification.mockReset().mockResolvedValue(undefined);
  vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
});
afterEach(() => vi.unstubAllEnvs());

describe('hasVapidKeys / initWebPush', () => {
  it('hasVapidKeys reflects the presence of both keys', () => {
    expect(hasVapidKeys()).toBe(true);
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    expect(hasVapidKeys()).toBe(false);
  });

  it('initWebPush configures web-push when keys are present', () => {
    initWebPush();
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:admin@stakd.com', 'pub', 'priv');
  });

  it('initWebPush no-ops without keys', () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    initWebPush();
    expect(setVapidDetails).not.toHaveBeenCalled();
  });
});

describe('sendPushNotification', () => {
  const payload = { title: 'Alert', body: 'NVDA hit target' };

  it('returns false when VAPID keys are absent', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    expect(await sendPushNotification(sub('1'), payload)).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('returns true and sends the JSON payload on success', async () => {
    expect(await sendPushNotification(sub('1'), payload)).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify(payload),
    );
  });

  it('throws SUBSCRIPTION_EXPIRED on a 410/404 from the push service', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await expect(sendPushNotification(sub('1'), payload)).rejects.toThrow('SUBSCRIPTION_EXPIRED');
  });

  it('returns false on other send errors', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 500, message: 'server' });
    expect(await sendPushNotification(sub('1'), payload)).toBe(false);
  });
});

describe('sendToUser', () => {
  it('calls onExpired for subscriptions that report as expired', async () => {
    sendNotification
      .mockResolvedValueOnce(undefined)            // sub 1 ok
      .mockRejectedValueOnce({ statusCode: 410 }); // sub 2 expired
    const onExpired = vi.fn().mockResolvedValue(undefined);
    await sendToUser([sub('1'), sub('2')], { title: 't', body: 'b' }, onExpired);
    expect(onExpired).toHaveBeenCalledOnce();
    expect(onExpired).toHaveBeenCalledWith('2');
  });
});
