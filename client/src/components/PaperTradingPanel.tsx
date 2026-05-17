import React, { useState, useEffect, useCallback } from 'react';
import { getBrokerageAccount, getBrokeragePositions, cancelBrokerageOrder } from '../api';
import { AlpacaAccount, AlpacaPosition, AlpacaOrder } from '../types';

interface Props {
  visible: boolean;
  onClose?: () => void;
  session?: unknown;
}

function fmt(val: string, decimals = 2): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDollar(val: string): string {
  return `$${fmt(val)}`;
}

function fmtPct(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

function plColor(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return 'text-gray-400';
  return n > 0 ? 'text-emerald-400' : 'text-red-400';
}

function statusBadge(status: string): JSX.Element {
  const configs: Record<string, { cls: string; label: string }> = {
    filled: { cls: 'bg-emerald-900/50 border-emerald-700/40 text-emerald-400', label: 'Filled' },
    partially_filled: { cls: 'bg-emerald-900/30 border-emerald-700/30 text-emerald-500', label: 'Partial' },
    pending_new: { cls: 'bg-amber-900/50 border-amber-700/40 text-amber-400', label: 'Pending' },
    new: { cls: 'bg-amber-900/50 border-amber-700/40 text-amber-400', label: 'Open' },
    accepted: { cls: 'bg-amber-900/50 border-amber-700/40 text-amber-400', label: 'Open' },
    cancelled: { cls: 'bg-gray-800/60 border-gray-700/40 text-gray-500', label: 'Cancelled' },
    canceled: { cls: 'bg-gray-800/60 border-gray-700/40 text-gray-500', label: 'Cancelled' },
    rejected: { cls: 'bg-red-900/50 border-red-700/40 text-red-400', label: 'Rejected' },
    expired: { cls: 'bg-gray-800/60 border-gray-700/40 text-gray-500', label: 'Expired' },
  };
  const cfg = configs[status] ?? { cls: 'bg-gray-800/60 border-gray-700/40 text-gray-400', label: status };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>
  );
}

export default function PaperTradingPanel({ visible, onClose }: Props) {
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [orders, setOrders] = useState<AlpacaOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [acctData, posData] = await Promise.all([
        getBrokerageAccount(),
        getBrokeragePositions(),
      ]);
      setAccount(acctData.account);
      setPositions(posData.positions);
      setOrders(posData.orders);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load account data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      await cancelBrokerageOrder(orderId);
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'cancelled' } : o));
    } catch {
      // silently ignore
    } finally {
      setCancellingId(null);
    }
  };

  if (!visible) return null;

  const equity = account ? parseFloat(account.equity) : 0;
  const portfolioValue = account ? parseFloat(account.portfolio_value) : 0;
  const todayPL = equity - portfolioValue;

  return (
    <div className="bg-[#141415] border border-[#222225] rounded-2xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#222225]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <h3 className="text-sm font-bold text-white">Paper Account</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 hover:bg-[#1e1e20] transition-all"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? 'spin-slow' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 hover:bg-[#1e1e20] transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-950/30 border border-red-900/40 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="px-4 py-4 space-y-5">
        {/* Account summary — 2x2 grid */}
        {account && (
          <div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Account Summary</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#111112] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-gray-600 mb-0.5">Equity</div>
                <div className="mono text-sm font-bold text-white">{fmtDollar(account.equity)}</div>
              </div>
              <div className="bg-[#111112] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-gray-600 mb-0.5">Cash</div>
                <div className="mono text-sm font-bold text-white">{fmtDollar(account.cash)}</div>
              </div>
              <div className="bg-[#111112] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-gray-600 mb-0.5">Buying Power</div>
                <div className="mono text-sm font-bold text-amber-400">{fmtDollar(account.buying_power)}</div>
              </div>
              <div className="bg-[#111112] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-gray-600 mb-0.5">Today P&L</div>
                <div className={`mono text-sm font-bold ${todayPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {todayPL >= 0 ? '+' : ''}${Math.abs(todayPL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Open Positions */}
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">
            Open Positions {positions.length > 0 && <span className="text-gray-500">({positions.length})</span>}
          </div>
          {positions.length === 0 ? (
            <div className="text-center py-6 text-gray-600 text-sm">
              No open positions. Execute a trade from the scan results.
            </div>
          ) : (
            <div className="space-y-1.5">
              {positions.map((pos) => {
                const isLong = pos.side === 'long';
                const pl = parseFloat(pos.unrealized_pl);
                return (
                  <div key={pos.symbol} className="bg-[#111112] rounded-lg px-3 py-2.5 border border-[#222225]">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="mono font-bold text-white text-sm">{pos.symbol}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          isLong ? 'bg-emerald-900/50 border-emerald-700/40 text-emerald-400' : 'bg-red-900/50 border-red-700/40 text-red-400'
                        }`}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                        <span className="mono text-xs text-gray-500">{pos.qty} shares</span>
                      </div>
                      <span className={`mono text-sm font-bold ${plColor(pos.unrealized_pl)}`}>
                        {pl >= 0 ? '+' : ''}{fmtDollar(pos.unrealized_pl)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs mono text-gray-500">
                      <span>Avg {fmtDollar(pos.avg_entry_price)}</span>
                      <span>Now {fmtDollar(pos.current_price)}</span>
                      <span className={plColor(pos.unrealized_plpc)}>{fmtPct(pos.unrealized_plpc)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        {orders.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Recent Orders</div>
            <div className="space-y-1.5">
              {orders.slice(0, 10).map((order) => {
                const canCancel = ['new', 'accepted', 'pending_new'].includes(order.status);
                const submittedAt = new Date(order.submitted_at).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div key={order.id} className="bg-[#111112] rounded-lg px-3 py-2 border border-[#222225]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="mono font-bold text-white text-sm">{order.symbol}</span>
                        <span className={`text-[10px] font-semibold ${order.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {order.side.toUpperCase()}
                        </span>
                        <span className="mono text-xs text-gray-500">{order.qty}</span>
                        {statusBadge(order.status)}
                      </div>
                      <div className="flex items-center gap-2">
                        {order.filled_avg_price && (
                          <span className="mono text-xs text-gray-400">{fmtDollar(order.filled_avg_price)}</span>
                        )}
                        <span className="text-[10px] text-gray-600">{submittedAt}</span>
                        {canCancel && (
                          <button
                            onClick={() => handleCancel(order.id)}
                            disabled={cancellingId === order.id}
                            className="text-[10px] text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
