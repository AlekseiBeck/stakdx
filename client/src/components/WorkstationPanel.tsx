import React, { useState } from 'react';
import { Plus, X, SquaresFour, Paperclip, CaretDown, ArrowSquareOut, CircleNotch } from '@phosphor-icons/react';
import { ChartRange, WorkstationArticle, fetchLinkPreview } from '../api';
import StockChart from './StockChart';

interface WorkstationPanelProps {
  tickers: string[];
  onAddTicker: (ticker: string) => void;
  onRemoveTicker: (ticker: string) => void;
  articles: WorkstationArticle[];
  onAddArticle: (article: WorkstationArticle) => void;
  onRemoveArticle: (url: string) => void;
}

// One grid tile: a chart for a single ticker with its own independent range.
function WorkstationChart({ ticker, onRemove }: { ticker: string; onRemove: () => void }) {
  const [range, setRange] = useState<ChartRange>('1y');
  return (
    <div className="group relative flex flex-col min-h-0 bg-bg border border-border rounded-lg overflow-hidden">
      <button
        onClick={onRemove}
        title={`Remove ${ticker}`}
        className="absolute top-1.5 right-1.5 z-20 w-6 h-6 flex items-center justify-center rounded-md bg-surface/90 text-faint opacity-0 group-hover:opacity-100 hover:text-red-700 dark:hover:text-red-400 hover:bg-surface-2 transition-all"
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

// Collapsible footer menu for saving research article links to the workstation.
function WorkstationArticles({ articles, onAdd, onRemove }: {
  articles: WorkstationArticle[];
  onAdd: (a: WorkstationArticle) => void;
  onRemove: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    setAdding(true);
    try {
      const meta = await fetchLinkPreview(u);
      onAdd({ url: u, title: meta.title, source: meta.source, addedAt: new Date().toISOString() });
      setUrl('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 h-9 text-muted hover:text-fg transition-colors"
        title={open ? 'Hide articles' : 'Show articles'}
      >
        <Paperclip size={14} weight="duotone" className="text-amber-500/80 flex-shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Articles</span>
        {articles.length > 0 && <span className="text-[10px] text-dim mono">{articles.length}</span>}
        <div className="flex-1" />
        <CaretDown size={13} weight="bold" className={`text-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 max-h-48 overflow-y-auto">
          <form onSubmit={submit} className="flex items-center gap-1 mb-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste an article link…"
              className="flex-1 min-w-0 bg-surface border border-border rounded-md px-2 py-1 text-[11px] text-fg placeholder-dim focus:outline-none focus:border-amber-500/50"
            />
            <button
              type="submit"
              disabled={!url.trim() || adding}
              title="Attach link"
              className="w-6 h-6 flex items-center justify-center rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {adding ? <CircleNotch size={13} weight="bold" className="spin-slow" /> : <Plus size={13} weight="bold" />}
            </button>
          </form>

          {articles.length === 0 ? (
            <p className="text-[11px] text-dim px-1 py-1">No articles attached. Paste a news link to save it here.</p>
          ) : (
            <div className="space-y-0.5">
              {articles.map(a => (
                <div key={a.url} className="group/article flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface transition-colors">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted truncate leading-tight group-hover/article:text-fg transition-colors">{a.title}</p>
                      {a.source && <p className="text-[9px] text-dim mt-0.5 truncate">{a.source}</p>}
                    </div>
                    <ArrowSquareOut size={12} weight="bold" className="text-dim flex-shrink-0" />
                  </a>
                  <button
                    onClick={() => onRemove(a.url)}
                    title="Remove article"
                    className="opacity-0 group-hover/article:opacity-100 w-5 h-5 flex items-center justify-center text-dim hover:text-red-700 dark:hover:text-red-400 transition-all flex-shrink-0"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkstationPanel({
  tickers, onAddTicker, onRemoveTicker, articles, onAddArticle, onRemoveArticle,
}: WorkstationPanelProps) {
  const [input, setInput] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim().toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6);
    if (!t) return;
    onAddTicker(t);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg">
      {/* Add-ticker bar */}
      <div className="flex items-center gap-2 px-3 h-10 flex-shrink-0">
        <SquaresFour size={15} weight="duotone" className="text-amber-500/80 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider flex-shrink-0">Workstation</span>
        {tickers.length > 0 && (
          <span className="text-[10px] text-dim mono flex-shrink-0">{tickers.length} loaded</span>
        )}
        <div className="flex-1" />
        <form onSubmit={submit} className="flex items-center gap-1 flex-shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6))}
            placeholder="Add ticker"
            className="w-24 bg-surface border border-border rounded-md px-2 py-1 mono text-[11px] text-fg placeholder-dim focus:outline-none focus:border-amber-500/50"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            title="Add chart"
            className="w-6 h-6 flex items-center justify-center rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={13} weight="bold" />
          </button>
        </form>
      </div>

      {/* Chart grid */}
      {tickers.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6">
          <SquaresFour size={30} weight="duotone" className="text-dim mb-2" />
          <p className="text-sm text-faint">No charts loaded yet.</p>
          <p className="text-xs text-dim mt-1">Add tickers to compare them side by side — the chat sees whatever's loaded.</p>
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

      {/* Saved research articles */}
      <WorkstationArticles articles={articles} onAdd={onAddArticle} onRemove={onRemoveArticle} />
    </div>
  );
}
