import React, { useState } from 'react';
import { TradeRecommendation } from '../types';
import ExecuteTradeModal from './ExecuteTradeModal';

interface Props {
  rec: TradeRecommendation;
  index: number;
  price?: number;
  onAddPosition: (rec: TradeRecommendation) => void;
  brokerageConnected?: boolean;
  currentPrice?: number;
  session?: unknown;
  onTradeExecuted?: (rec: TradeRecommendation, price: number) => void;
}

function DirectionBadge({ direction }: { direction: TradeRecommendation['direction'] }) {
  const configs = {
    LONG: { cls: 'badge-long', label: 'LONG', up: true },
    SHORT: { cls: 'badge-short', label: 'SHORT', up: false },
    CALL: { cls: 'badge-call', label: 'CALL', up: true },
    PUT: { cls: 'badge-put', label: 'PUT', up: false },
  };
  const cfg = configs[direction];
  return (
    <span className={cfg.cls}>
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        {cfg.up
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
        }
      </svg>
      {cfg.label}
    </span>
  );
}

function ConfidenceScore({ value }: { value: number }) {
  const color =
    value >= 80 ? 'text-emerald-400 border-emerald-700/50 bg-emerald-900/30' :
    value >= 65 ? 'text-yellow-400 border-yellow-700/50 bg-yellow-900/20' :
    'text-orange-400 border-orange-700/50 bg-orange-900/20';

  return (
    <span className={`mono text-sm font-bold px-2 py-0.5 rounded border ${color}`}>
      {value}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment?: TradeRecommendation['socialSentiment'] }) {
  if (!sentiment) return <span className="text-xs text-gray-600 mono">&#9898; No social data</span>;
  const configs = {
    bullish: { dot: '🟢', cls: 'text-emerald-400', label: 'Bullish social' },
    bearish: { dot: '🔴', cls: 'text-red-400', label: 'Bearish social' },
    neutral: { dot: '⚪', cls: 'text-gray-400', label: 'Neutral social' },
  };
  const cfg = configs[sentiment.sentiment];
  return (
    <span className={`text-xs ${cfg.cls}`}>
      {cfg.dot} {cfg.label}
    </span>
  );
}

function calcRR(rec: TradeRecommendation): string | null {
  const entry = parseFloat(rec.entryZone.replace(/[^0-9.]/g, ''));
  const stop = parseFloat(rec.stopLoss.replace(/[^0-9.]/g, ''));
  const target = parseFloat(rec.target.replace(/[^0-9.]/g, ''));
  if (!entry || !stop || !target) return null;

  const isShort = rec.direction === 'SHORT' || rec.direction === 'PUT';
  const reward = isShort ? entry - target : target - entry;
  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;
  return (reward / risk).toFixed(1);
}

function calcPct(entry: string, price: string, isShort: boolean): string | null {
  const e = parseFloat(entry.replace(/[^0-9.]/g, ''));
  const p = parseFloat(price.replace(/[^0-9.]/g, ''));
  if (!e || !p) return null;
  const pct = (((p - e) / e) * 100 * (isShort ? -1 : 1)).toFixed(1);
  return `~${pct}%`;
}

export default function RecommendationCard({ rec, index, price, onAddPosition, brokerageConnected, currentPrice, session, onTradeExecuted }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const rr = calcRR(rec);
  const isShort = rec.direction === 'SHORT' || rec.direction === 'PUT';

  return (
    <div
      className={`card-elevated fade-in-up cursor-pointer transition-all duration-200 hover:border-[#2a3a5e] ${expanded ? 'border-[#2a3a5e]' : ''}`}
      style={{ animationDelay: `${Math.min(index * 60, 400)}ms`, opacity: 0 }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-3">
        {/* Top row: ticker + direction + confidence */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="mono text-xl font-bold text-white tracking-tight">{rec.ticker}</span>
            <DirectionBadge direction={rec.direction} />
            {price && (
              <span className="mono text-sm text-gray-400 font-medium">${price.toFixed(2)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceScore value={rec.confidence} />
            <svg
              className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>

        {/* Middle: entry / stop / target grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#0a0e1a] rounded-lg px-3 py-2">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-0.5">Entry</div>
            <div className="mono text-sm font-bold text-cyan-400">{rec.entryZone}</div>
          </div>
          <div className="bg-red-950/30 rounded-lg px-3 py-2">
            <div className="text-[10px] text-red-700 uppercase tracking-wider font-semibold mb-0.5">Stop</div>
            <div className="mono text-sm font-bold text-red-400">{rec.stopLoss}</div>
          </div>
          <div className="bg-emerald-950/30 rounded-lg px-3 py-2">
            <div className="text-[10px] text-emerald-700 uppercase tracking-wider font-semibold mb-0.5">Target</div>
            <div className="mono text-sm font-bold text-emerald-400">{rec.target}</div>
          </div>
        </div>

        {/* Bottom row: pattern + timeframe + R/R + sentiment */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 bg-[#0d1830] px-2 py-0.5 rounded border border-[#1a2442]">
              {rec.pattern}
            </span>
            <span className="text-xs text-gray-600">{rec.timeframe}</span>
            {rr && (
              <span className="text-xs mono font-semibold text-blue-400">{rr}:1 R/R</span>
            )}
          </div>
          <SentimentBadge sentiment={rec.socialSentiment} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="border-t border-[#16213a] px-4 py-4 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Position sizing detail */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Position Size</div>
              <div className="text-sm text-gray-300 mono">{rec.positionSize || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-red-700 uppercase tracking-wider mb-1">Max Risk</div>
              <div className="text-sm text-red-400 mono font-semibold">{rec.maxRisk || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-emerald-700 uppercase tracking-wider mb-1">Potential Gain</div>
              <div className="text-sm text-emerald-400 mono font-semibold">{rec.potentialGain || '—'}</div>
            </div>
          </div>

          {/* Gain/loss % detail */}
          <div className="grid grid-cols-2 gap-2 text-xs mono text-gray-500">
            <div>
              Potential: {calcPct(rec.entryZone, rec.target, isShort) ?? '—'} if target hit
            </div>
            <div>
              Risk: {calcPct(rec.entryZone, rec.stopLoss, !isShort) ?? '—'} if stopped
            </div>
          </div>

          {/* AI Rationale */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">AI Rationale</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{rec.rationale}</p>
          </div>

          {/* Social sentiment expanded */}
          {rec.socialSentiment && (
            <div className="bg-[#0a0e1a] rounded-lg px-3 py-2.5 border border-[#16213a]">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Social Sentiment</div>
              <div className="flex items-center gap-2">
                <SentimentBadge sentiment={rec.socialSentiment} />
                <span className="text-xs text-gray-400">— {rec.socialSentiment.signal}</span>
              </div>
            </div>
          )}

          {/* Track Position button */}
          <div className="pt-1 space-y-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddPosition(rec);
              }}
              className="btn-primary text-sm w-full justify-center py-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Track Position
            </button>
            {brokerageConnected && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTradeModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-cyan-700/60 text-cyan-400 hover:bg-cyan-950/40 hover:border-cyan-600 text-sm font-semibold transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                Execute Paper Trade
              </button>
            )}
          </div>
        </div>
      )}
      {showTradeModal && (
        <ExecuteTradeModal
          isOpen={showTradeModal}
          onClose={() => setShowTradeModal(false)}
          recommendation={rec}
          currentPrice={currentPrice ?? price ?? 0}
          session={session}
          onSuccess={() => {
            setShowTradeModal(false);
            onTradeExecuted?.(rec, currentPrice ?? price ?? 0);
          }}
        />
      )}
    </div>
  );
}
