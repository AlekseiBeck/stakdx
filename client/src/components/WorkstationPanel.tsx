import React, { useState } from 'react';
import { Plus, X, SquaresFour } from '@phosphor-icons/react';
import { ChartRange } from '../api';
import StockChart from './StockChart';

interface WorkstationPanelProps {
  tickers: string[];
  onAddTicker: (ticker: string) => void;
  onRemoveTicker: (ticker: string) => void;
}

// One grid tile: a chart for a single ticker with its own independent range.
function WorkstationChart({ ticker, onRemove }: { ticker: string; onRemove: () => void }) {
  const [range, setRange] = useState<ChartRange>('1y');
  return (
    <div className="group relative flex flex-col min-h-0 bg-[#0e0e0f] border border-[#222225] rounded-lg overflow-hidden">
      <button
        onClick={onRemove}
        title={`Remove ${ticker}`}
        className="absolute top-1.5 right-1.5 z-20 w-6 h-6 flex items-center justify-center rounded-md bg-[#141415]/90 text-gray-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-[#1e1e20] transition-all"
      >
        <X size={13} weight="bold" />
      </button>
      <StockChart
        ticker={ticker}
        range={range}
        onRangeChange={setRange}
        fill
        compact
        collapsed={false}
        onToggleCollapse={() => {}}
        showCollapse={false}
      />
    </div>
  );
}

export default function WorkstationPanel({ tickers, onAddTicker, onRemoveTicker }: WorkstationPanelProps) {
  const [input, setInput] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim().toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6);
    if (!t) return;
    onAddTicker(t);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0e0e0f]">
      {/* Add-ticker bar */}
      <div className="flex items-center gap-2 px-3 h-10 flex-shrink-0">
        <SquaresFour size={15} weight="duotone" className="text-amber-500/80 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">Workstation</span>
        {tickers.length > 0 && (
          <span className="text-[10px] text-gray-600 mono flex-shrink-0">{tickers.length} loaded</span>
        )}
        <div className="flex-1" />
        <form onSubmit={submit} className="flex items-center gap-1 flex-shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6))}
            placeholder="Add ticker"
            className="w-24 bg-[#141415] border border-[#222225] rounded-md px-2 py-1 mono text-[11px] text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            title="Add chart"
            className="w-6 h-6 flex items-center justify-center rounded-md text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={13} weight="bold" />
          </button>
        </form>
      </div>

      {/* Chart grid */}
      {tickers.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6">
          <SquaresFour size={30} weight="duotone" className="text-gray-700 mb-2" />
          <p className="text-sm text-gray-500">No charts loaded yet.</p>
          <p className="text-xs text-gray-600 mt-1">Add tickers to compare them side by side — the chat sees whatever's loaded.</p>
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-y-auto p-2 grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gridAutoRows: 'minmax(220px, 1fr)' }}
        >
          {tickers.map(t => (
            <WorkstationChart key={t} ticker={t} onRemove={() => onRemoveTicker(t)} />
          ))}
        </div>
      )}
    </div>
  );
}
