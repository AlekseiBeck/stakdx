import React, { useState, useEffect } from 'react';
import { TradeRecommendation } from '../types';

interface Props {
  prefill: TradeRecommendation | null;
  onClose: () => void;
  onAdd: (ticker: string, entryPrice: number, direction: 'long' | 'short', stopLoss?: number, target?: number) => Promise<void>;
}

function parseDollarAmount(str: string): string {
  // Extract first dollar amount from strings like "$178.20" or "$875.00 - $880.00"
  const match = str.match(/\$([0-9,.]+)/);
  return match ? match[1].replace(',', '') : '';
}

export default function AddPositionModal({ prefill, onClose, onAdd }: Props) {
  const [ticker, setTicker] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (prefill) {
      setTicker(prefill.ticker);
      setDirection(prefill.direction === 'LONG' || prefill.direction === 'CALL' ? 'long' : 'short');
      const entryMatch = prefill.entryZone.match(/\$([0-9,.]+)/);
      if (entryMatch) setEntryPrice(entryMatch[1].replace(',', ''));
      setStopLoss(parseDollarAmount(prefill.stopLoss));
      setTarget(parseDollarAmount(prefill.target));
    }
  }, [prefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const price = parseFloat(entryPrice);
    if (!ticker || isNaN(price) || price <= 0) {
      setError('Please fill in all fields correctly.');
      return;
    }
    const stopNum = stopLoss ? parseFloat(stopLoss) : undefined;
    const targetNum = target ? parseFloat(target) : undefined;
    if (stopLoss && isNaN(stopNum!)) {
      setError('Stop loss must be a valid number.');
      return;
    }
    if (target && isNaN(targetNum!)) {
      setError('Target must be a valid number.');
      return;
    }
    setLoading(true);
    try {
      await onAdd(ticker.toUpperCase(), price, direction, stopNum, targetNum);
      onClose();
    } catch {
      setError('Failed to add position. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const hasAlerts = stopLoss || target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Track Position</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Ticker Symbol</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. NVDA"
              className="w-full bg-[#141415] border border-[#222225] rounded-lg px-3 py-2.5 text-white mono font-bold text-base focus:outline-none focus:border-amber-500/60 transition-colors"
              maxLength={6}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Entry Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 mono">$</span>
              <input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                className="w-full bg-[#141415] border border-[#222225] rounded-lg pl-7 pr-3 py-2.5 text-white mono focus:outline-none focus:border-amber-500/60 transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Direction</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('long')}
                className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  direction === 'long'
                    ? 'bg-emerald-900/60 border border-emerald-600 text-emerald-400'
                    : 'bg-[#141415] border border-[#222225] text-gray-400 hover:border-emerald-700/50'
                }`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setDirection('short')}
                className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  direction === 'short'
                    ? 'bg-red-900/60 border border-red-600 text-red-400'
                    : 'bg-[#141415] border border-[#222225] text-gray-400 hover:border-red-700/50'
                }`}
              >
                SHORT
              </button>
            </div>
          </div>

          {/* Stop loss + target — for push alerts */}
          <div className="rounded-xl border border-[#222225] bg-[#0d0d0e]/60 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-0.5">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <span className="text-xs font-semibold text-amber-400">Alert Levels</span>
              <span className="text-[10px] text-gray-600 ml-auto">Optional — triggers push notification</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Stop Loss <span className="text-red-500/70">▼</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 mono text-sm">$</span>
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    className="w-full bg-[#141415] border border-[#222225] rounded-lg pl-6 pr-2 py-2 text-red-400 mono text-sm focus:outline-none focus:border-red-600/50 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Target <span className="text-emerald-500/70">▲</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 mono text-sm">$</span>
                  <input
                    type="number"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    className="w-full bg-[#141415] border border-[#222225] rounded-lg pl-6 pr-2 py-2 text-emerald-400 mono text-sm focus:outline-none focus:border-emerald-600/50 transition-colors"
                  />
                </div>
              </div>
            </div>

            {hasAlerts && (
              <p className="text-[10px] text-gray-500 leading-relaxed">
                You'll receive a push notification when the price crosses these levels — even with the app closed.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-ghost justify-center">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 btn-primary justify-center">
              {loading ? 'Adding...' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
