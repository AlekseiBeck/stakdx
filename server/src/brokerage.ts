import axios from 'axios';

const PAPER_ENDPOINT = process.env.ALPACA_PAPER_ENDPOINT || 'https://paper-api.alpaca.markets';

function headers(apiKey: string, secretKey: string) {
  return { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': secretKey };
}

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  cash: string;
  buying_power: string;
  equity: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  shorting_enabled: boolean;
  options_approved_level: number;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: string;
  type: string;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
  limit_price: string | null;
}

export async function fetchAccount(apiKey: string, secretKey: string): Promise<AlpacaAccount> {
  const res = await axios.get(`${PAPER_ENDPOINT}/v2/account`, { headers: headers(apiKey, secretKey), timeout: 5000 });
  return res.data;
}

export async function fetchPositions(apiKey: string, secretKey: string): Promise<AlpacaPosition[]> {
  const res = await axios.get(`${PAPER_ENDPOINT}/v2/positions`, { headers: headers(apiKey, secretKey), timeout: 5000 });
  return res.data;
}

export async function fetchOrders(apiKey: string, secretKey: string): Promise<AlpacaOrder[]> {
  const res = await axios.get(`${PAPER_ENDPOINT}/v2/orders`, {
    headers: headers(apiKey, secretKey),
    params: { status: 'all', limit: 20, direction: 'desc' },
    timeout: 5000,
  });
  return res.data;
}

export async function placeOrder(
  apiKey: string,
  secretKey: string,
  order: { symbol: string; qty: number; side: 'buy' | 'sell'; type: 'market' | 'limit'; time_in_force: 'day' | 'gtc'; limit_price?: number }
): Promise<AlpacaOrder> {
  const body: Record<string, unknown> = {
    symbol: order.symbol,
    qty: order.qty,
    side: order.side,
    type: order.type,
    time_in_force: order.time_in_force,
  };
  if (order.limit_price) body.limit_price = order.limit_price.toFixed(2);
  const res = await axios.post(`${PAPER_ENDPOINT}/v2/orders`, body, { headers: headers(apiKey, secretKey), timeout: 5000 });
  return res.data;
}

export async function cancelOrder(apiKey: string, secretKey: string, orderId: string): Promise<void> {
  await axios.delete(`${PAPER_ENDPOINT}/v2/orders/${orderId}`, { headers: headers(apiKey, secretKey), timeout: 5000 });
}
