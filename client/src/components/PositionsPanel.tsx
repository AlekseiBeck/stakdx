import React, { useState } from 'react';
import { Position, PositionUpdate } from '../types';
import { getPositionUpdate, deletePosition } from '../api';

interface Props {
  positions: Position[];
  onPositionClosed: (id: string) => void;
  onAddClick: () => void;
}

function formatTimeHeld(entryTime: string): string {
  const diff = Date.now() - new Date(entryTime).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

interface UpdateState {
  loading: boolean;
  data: PositionUpdate | null;
  mock: boolean;
}

export default function PositionsPanel({ positions, onPositionClosed, onAddClick }: Props) {
  const [updates, setUpdates] = useState<Record<string, UpdateState>>({});

  const handleGetUpdate = async (ticker: string) => {
    setUpdates((prev) => ({
      ...prev,
      [ticker]: { loading: true, data: null, mock: false },
    }));
    try {
      const result = await getPositionUpdate(ticker);
      setUpdates((prev) => ({
        ...prev,
        [ticker]: { loading: false, data: result.update, mock: result.mock },
      }));
    } catch (err) {
      setUpdates((prev) => ({
        ...prev,
        [ticker]: { loading: false, data: null, mock: false },
      }));
    }
  };

  const handleClose = async (id: string) => {
    try {
      await deletePosition(id);
      onPositionClosed(id);
    } catch {}
  };

  const verdictConfig = {
    HOLD: { label: 'HOLD', class: 'badge-hold', icon: '⏸' },
    SELL: { label: 'SELL', class: 'badge-sell', icon: '⚡' },
    CAUTION: { label: 'CAUTION', class: 'badge-caution', icon: '⚠' },
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2442]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
          </svg>
          <h2 className="font-bold text-white">Active Positions</h2>
          {positions.length > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{positions.length}</span>
          )}
        </div>
        <button onClick={onAddClick} className="btn-ghost text-xs py-1.5 px-3">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Position
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#1a2442] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No active positions</p>
          <p className="text-gray-600 text-xs mt-1">Add a position to track it with AI</p>
        </div>
      ) : (
        <div className="divide-y divide-[#1a2442]/60">
          {positions.map((pos) => {
            const update = updates[pos.ticker];
            const cfg = update?.data ? verdictConfig[update.data.verdict] : null;

            return (
              <div key={pos.id} className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono font-bold text-lg text-white">{pos.ticker}</span>
                        {pos.direction === 'long' ? (
                          <span className="badge-long text-xs">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                            </svg>
                            LONG
                          </span>
                        ) : (
                          <span className="badge-short text-xs">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
                            </svg>
                            SHORT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500">Entry: <span className="mono text-gray-300">${pos.entryPrice.toFixed(2)}</span></span>
                        <span className="text-xs text-gray-600">•</span>
                        <span className="text-xs text-gray-500">Held: <span className="text-gray-300">{formatTimeHeld(pos.entryTime)}</span></span>
                        {update?.data && (
                          <>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="mono text-xs text-gray-300">{update.data.currentPrice}</span>
                            <span className={`mono text-xs font-semibold ${update.data.priceChange.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                              {update.data.priceChange}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleGetUpdate(pos.ticker)}
                      disabled={update?.loading}
                      className="btn-ghost text-xs py-1.5 px-3"
                    >
                      {update?.loading ? (
                        <>
                          <svg className="w-3 h-3 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                          </svg>
                          Get Update
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleClose(pos.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-all"
                      title="Close position"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {update?.data && cfg && (
                  <div className={`rounded-lg p-3 mt-2 border ${
                    update.data.verdict === 'HOLD' ? 'bg-blue-900/10 border-blue-800/30' :
                    update.data.verdict === 'SELL' ? 'bg-red-900/10 border-red-800/30' :
                    'bg-amber-900/10 border-amber-800/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cfg.class}>{cfg.icon} {cfg.label}</span>
                      {update.mock && (
                        <span className="text-[10px] text-gray-600 bg-gray-800/50 px-1.5 py-0.5 rounded">demo</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{update.data.reasoning}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
