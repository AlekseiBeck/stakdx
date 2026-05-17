import React, { useState } from 'react';
import { TradeRecommendation } from '../types';
import { placeOrder } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  recommendation: TradeRecommendation;
  currentPrice: number;
  onSuccess: () => void;
  session?: unknown;
}

function parseQty(positionSize: string, fallbackPrice?: number, buyingPower?: number): number {
  const match = positionSize.match(/\d+/);
  if (match) return parseInt(match[0], 10);
  if (fallbackPrice && buyingPower) return Math.floor(buyingPower / fallbackPrice);
  return 1;
}

export default function ExecuteTradeModal({ isOpen, onClose, recommendation, currentPrice, onSuccess, session: _session }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const { ticker, direction, positionSize, maxRisk, stopLoss } = recommendation;
  const qty = parseQty(positionSize);
  const side: 'buy' | 'sell' = (direction === 'LONG' || direction === 'CALL') ? 'buy' : 'sell';
  const estimatedCost = (qty * currentPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleConfirm = async () => {
    setLoading(true);
    setResult('idle');
    setErrorMsg('');
    try {
      await placeOrder({ symbol: ticker, qty, side, type: 'market' });
      setResult('success');
      setTimeout(() => {
        onSuccess();
        onClose();
        setResult('idle');
      }, 1800);
    } catch (err: any) {
      setResult('error');
      setErrorMsg(err?.message ?? 'Order failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setResult('idle');
    setErrorMsg('');
    onClose();
  };

  const directionColor = side === 'buy' ? 'text-emerald-400' : 'text-red-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm bg-[#141415] border border-[#222225] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#222225]">
          <h2 className={`text-lg font-bold mono ${directionColor}`}>
            {side.toUpperCase()} {ticker}
          </h2>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 hover:bg-[#1e1e20] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Paper trade warning */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1c] border border-[#2a2a2c] rounded-lg">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-gray-400 font-medium">This is a paper trade — no real money involved</p>
          </div>

          {/* Order details */}
          <div className="bg-[#111112] rounded-lg border border-[#222225] divide-y divide-[#222225]">
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-xs text-gray-500">Order Type</span>
              <span className="text-xs mono text-gray-300 font-semibold">Market</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-xs text-gray-500">Quantity</span>
              <span className="text-xs mono text-white font-bold">{qty} shares</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-xs text-gray-500">Current Price</span>
              <span className="text-xs mono text-white font-bold">${currentPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-xs text-gray-500">Est. Cost</span>
              <span className={`text-xs mono font-bold ${directionColor}`}>${estimatedCost}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-xs text-gray-500">Max Risk</span>
              <span className="text-xs mono text-red-400 font-semibold">{maxRisk || '—'}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-xs text-gray-500">Stop Loss</span>
              <span className="text-xs mono text-red-400 font-semibold">{stopLoss}</span>
            </div>
          </div>

          {/* Error */}
          {result === 'error' && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/30 border border-red-900/40 rounded-lg">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-400">{errorMsg}</p>
            </div>
          )}

          {/* Success */}
          {result === 'success' && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-950/30 border border-emerald-900/40 rounded-lg">
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-emerald-400 font-semibold">Order submitted</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-lg border border-[#222225] text-gray-400 hover:text-white hover:border-[#333336] text-sm font-semibold transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || result === 'success'}
              className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Placing...
                </>
              ) : (
                'Confirm Trade'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
