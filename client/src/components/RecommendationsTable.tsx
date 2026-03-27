import React, { useState } from 'react';
import { TradeRecommendation } from '../types';

interface Props {
  recommendations: TradeRecommendation[];
  prices: Record<string, number>;
  onAddPosition: (rec: TradeRecommendation) => void;
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 80 ? 'bg-emerald-500' :
    value >= 65 ? 'bg-blue-500' :
    value >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#1a2442] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="mono text-xs font-semibold text-gray-300 w-8 text-right">{value}%</span>
    </div>
  );
}

export default function RecommendationsTable({ recommendations, prices, onAddPosition }: Props) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (ticker: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  if (recommendations.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-[#1a2442] flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
          </svg>
        </div>
        <p className="text-gray-400 font-medium">No scan results yet</p>
        <p className="text-gray-600 text-sm mt-1">Click "Run Daily Scan" to analyze the market</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a2442]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-10">#</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ticker</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Direction</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider min-w-[140px]">Confidence</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Entry Zone</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Stop Loss</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Target</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Timeframe</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Last Price</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pattern</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((rec, idx) => {
              const isExpanded = expandedRows.has(rec.ticker);
              return (
                <React.Fragment key={rec.ticker}>
                  <tr
                    className={`border-b border-[#1a2442]/60 hover:bg-[#141d35] transition-colors cursor-pointer group ${isExpanded ? 'bg-[#141d35]' : ''}`}
                    onClick={() => toggleRow(rec.ticker)}
                  >
                    <td className="px-4 py-3.5">
                      <span className="mono text-sm font-bold text-gray-600">{idx + 1}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="mono font-bold text-base text-white">{rec.ticker}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {rec.direction === 'LONG' ? (
                        <span className="badge-long">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                          </svg>
                          LONG
                        </span>
                      ) : (
                        <span className="badge-short">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
                          </svg>
                          SHORT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 min-w-[140px]">
                      <ConfidenceBar value={rec.confidence} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="mono text-sm text-cyan-400 font-medium">{rec.entryZone}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="mono text-sm text-red-400 font-medium">{rec.stopLoss}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="mono text-sm text-emerald-400 font-medium">{rec.target}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-400">{rec.timeframe}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {prices[rec.ticker] ? (
                        <span className="mono text-sm font-semibold text-white">${prices[rec.ticker].toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-gray-400 bg-[#1a2442] px-2 py-0.5 rounded">{rec.pattern}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <svg
                        className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-[#0d1424]">
                      <td colSpan={10} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                              </svg>
                              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">AI Rationale</span>
                            </div>
                            <p className="text-sm text-gray-300 leading-relaxed">{rec.rationale}</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddPosition(rec);
                            }}
                            className="btn-ghost flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Track Position
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
