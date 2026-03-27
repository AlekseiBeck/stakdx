import React, { useState, useEffect } from 'react';
import { TradeRecommendation } from '../types';

interface Props {
  prefill: TradeRecommendation | null;
  onClose: () => void;
  onAdd: (ticker: string, entryPrice: number, direction: 'long' | 'short') => Promise<void>;
}

export default function AddPositionModal({ prefill, onClose, onAdd }: Props) {
  const [ticker, setTicker] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (prefill) {
      setTicker(prefill.ticker);
      setDirection(prefill.direction === 'LONG' ? 'long' : 'short');
      // Parse the low end of the entry zone as default price
      const match = prefill.entryZone.match(/\$([0-9.]+)/);
      if (match) setEntryPrice(match[1]);
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
    setLoading(true);
    try {
      await onAdd(ticker.toUpperCase(), price, direction);
      onClose();
    } catch {
      setError('Failed to add position. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

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
              className="w-full bg-[#141d35] border border-[#1a2442] rounded-lg px-3 py-2.5 text-white mono font-bold text-base focus:outline-none focus:border-blue-500 transition-colors"
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
                className="w-full bg-[#141d35] border border-[#1a2442] rounded-lg pl-7 pr-3 py-2.5 text-white mono focus:outline-none focus:border-blue-500 transition-colors"
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
                    : 'bg-[#141d35] border border-[#1a2442] text-gray-400 hover:border-emerald-700/50'
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
                    : 'bg-[#141d35] border border-[#1a2442] text-gray-400 hover:border-red-700/50'
                }`}
              >
                SHORT
              </button>
            </div>
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
