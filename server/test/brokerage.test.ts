import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from './msw';
import { fetchAccount, fetchPositions, fetchOrders, placeOrder, cancelOrder } from '../src/brokerage';

const BASE = 'https://paper-api.alpaca.markets';
const KEY = 'k';
const SECRET = 's';

describe('brokerage (Alpaca paper API)', () => {
  it('fetchAccount returns account data and forwards the API key headers', async () => {
    let seenKey: string | null = null;
    mswServer.use(http.get(`${BASE}/v2/account`, ({ request }) => {
      seenKey = request.headers.get('APCA-API-KEY-ID');
      return HttpResponse.json({ id: 'acc', buying_power: '10000', status: 'ACTIVE' });
    }));
    const acc = await fetchAccount(KEY, SECRET);
    expect(acc.buying_power).toBe('10000');
    expect(seenKey).toBe(KEY);
  });

  it('fetchPositions returns the positions array', async () => {
    mswServer.use(http.get(`${BASE}/v2/positions`, () => HttpResponse.json([{ symbol: 'AAPL', qty: '10' }])));
    const positions = await fetchPositions(KEY, SECRET);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('AAPL');
  });

  it('fetchOrders requests all orders, newest first', async () => {
    let params: URLSearchParams | null = null;
    mswServer.use(http.get(`${BASE}/v2/orders`, ({ request }) => {
      params = new URL(request.url).searchParams;
      return HttpResponse.json([]);
    }));
    await fetchOrders(KEY, SECRET);
    expect(params!.get('status')).toBe('all');
    expect(params!.get('limit')).toBe('20');
    expect(params!.get('direction')).toBe('desc');
  });

  it('placeOrder posts a market order without a limit price', async () => {
    let body: any = null;
    mswServer.use(http.post(`${BASE}/v2/orders`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 'o1', status: 'accepted', symbol: body.symbol });
    }));
    const order = await placeOrder(KEY, SECRET, { symbol: 'NVDA', qty: 5, side: 'buy', type: 'market', time_in_force: 'day' });
    expect(order.id).toBe('o1');
    expect(body).toMatchObject({ symbol: 'NVDA', qty: 5, side: 'buy', type: 'market', time_in_force: 'day' });
    expect(body.limit_price).toBeUndefined();
  });

  it('placeOrder includes a 2-decimal limit_price for limit orders', async () => {
    let body: any = null;
    mswServer.use(http.post(`${BASE}/v2/orders`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 'o2', status: 'accepted' });
    }));
    await placeOrder(KEY, SECRET, { symbol: 'AMD', qty: 2, side: 'sell', type: 'limit', time_in_force: 'gtc', limit_price: 150.1 });
    expect(body.limit_price).toBe('150.10');
  });

  it('cancelOrder issues a DELETE for the order id', async () => {
    let called = false;
    mswServer.use(http.delete(`${BASE}/v2/orders/o9`, () => { called = true; return new HttpResponse(null, { status: 204 }); }));
    await expect(cancelOrder(KEY, SECRET, 'o9')).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it('propagates an error when the broker returns a failure status', async () => {
    mswServer.use(http.get(`${BASE}/v2/account`, () => HttpResponse.json({ message: 'forbidden' }, { status: 403 })));
    await expect(fetchAccount(KEY, SECRET)).rejects.toBeTruthy();
  });
});
