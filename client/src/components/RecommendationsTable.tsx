import React, { useState } from 'react';
import { TradeRecommendation } from '../types';
import RecommendationCard from './RecommendationCard';

interface Props {
  recommendations: TradeRecommendation[];
  prices: Record<string, number>;
  onAddPosition: (rec: TradeRecommendation) => void;
  isStreaming?: boolean;
  streamPhase?: 'idle' | 'batch1' | 'batch2' | 'done';
  brokerageConnected?: boolean;
  onTradeExecuted?: (rec: TradeRecommendation, price: number) => void;
}

function SkeletonCard() {
  return (
    <div className="card-elevated p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="skeleton w-16 h-6 rounded" />
          <div className="skeleton w-12 h-5 rounded-full" />
        </div>
        <div className="skeleton w-10 h-6 rounded" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="skeleton h-12 rounded-lg" />
        <div className="skeleton h-12 rounded-lg" />
        <div className="skeleton h-12 rounded-lg" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton w-32 h-5 rounded" />
        <div className="skeleton w-16 h-5 rounded" />
      </div>
    </div>
  );
}

export default function RecommendationsTable({
  recommendations,
  prices,
  onAddPosition,
  isStreaming = false,
  streamPhase = 'idle',
  brokerageConnected = false,
  onTradeExecuted,
}: Props) {
  const [dirFilter, setDirFilter] = useState<Set<string>>(new Set(['LONG', 'SHORT', 'CALL', 'PUT']));

  const toggleDir = (d: string) => {
    setDirFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) {
        if (next.size === 1) return prev;
        next.delete(d);
      } else {
        next.add(d);
      }
      return next;
    });
  };

  const filtered = recommendations.filter((r) => dirFilter.has(r.direction));

  // Show skeletons while streaming
  if (isStreaming && recommendations.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-amber-500">
          <svg className="w-4 h-4 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Analyzing batch 1...
        </div>
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (!isStreaming && recommendations.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <span className="absolute inset-0 rounded-full border border-amber-500/40 radar-ping" />
          <span className="absolute inset-0 rounded-full border border-amber-500/25 radar-ping [animation-delay:1.2s]" />
          <div className="relative w-16 h-16 rounded-full bg-surface-2 border border-border-strong flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
            </svg>
          </div>
        </div>
        <p className="text-muted font-medium">No scan results yet</p>
        <p className="text-dim text-sm mt-1">Run a scan to analyze the market</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Streaming status */}
      {isStreaming && (
        <div className="flex items-center gap-2 text-sm text-amber-500">
          <svg className="w-4 h-4 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {streamPhase === 'batch1' ? 'Analyzing batch 1... more results coming' : 'Analyzing batch 2...'}
        </div>
      )}

      {/* Direction filter pills */}
      {recommendations.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-dim font-medium">Filter:</span>
          {(['LONG', 'SHORT', 'CALL', 'PUT'] as const).map((d) => {
            const colorMap = {
              LONG: 'border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40',
              SHORT: 'border-red-300 dark:border-red-600 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/40',
              CALL: 'border-amber-300 dark:border-amber-600 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40',
              PUT: 'border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/40',
            };
            const count = recommendations.filter(r => r.direction === d).length;
            if (count === 0) return null;
            return (
              <button
                key={d}
                onClick={() => toggleDir(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  dirFilter.has(d)
                    ? colorMap[d]
                    : 'border-border text-dim hover:text-muted'
                }`}
              >
                {d} <span className="opacity-60 font-normal">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-1 xl:grid-cols-1 gap-3">
        {filtered.map((rec, idx) => (
          <RecommendationCard
            key={rec.ticker}
            rec={rec}
            index={idx}
            price={prices[rec.ticker]}
            onAddPosition={onAddPosition}
            brokerageConnected={brokerageConnected}
            currentPrice={prices[rec.ticker]}
            onTradeExecuted={onTradeExecuted}
          />
        ))}
      </div>
    </div>
  );
}
