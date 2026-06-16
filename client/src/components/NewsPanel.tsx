import React, { useState } from 'react';
import { MagnifyingGlass, X, CircleNotch } from '@phosphor-icons/react';
import { NewsItem } from '../types';

interface Props {
  news: NewsItem[];
  onSearch: (query: string) => void;
  onClear: () => void;
  activeQuery: string;
  focus?: string;
  isSearching: boolean;
}

function formatAge(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
}

export default function NewsPanel({ news, onSearch, onClear, activeQuery, focus, isSearching }: Props) {
  const [input, setInput] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (q) onSearch(q);
  };

  const clear = () => {
    setInput('');
    onClear();
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <svg className="w-3.5 h-3.5 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5" />
        </svg>
        <span className="text-xs font-bold text-muted uppercase tracking-wider">
          {activeQuery ? 'News Search' : 'Market News'}
        </span>
        <span className="text-xs text-dim ml-auto">{news.length} stories</span>
      </div>

      {/* Search bar */}
      <form onSubmit={submit} className="px-4 py-3 border-b border-border">
        <div className="relative">
          <MagnifyingGlass size={14} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search news — e.g. nvidia, AI, rate cuts"
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-8 py-2 text-fg text-xs focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.1)] transition-all placeholder-dim"
          />
          {input && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-muted transition-colors"
              title="Clear search"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
      </form>

      {/* Active-query banner */}
      {activeQuery && (
        <div className="px-4 py-2 border-b border-border bg-bg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint">
              Results for <span className="text-amber-600 dark:text-amber-400 font-semibold">"{activeQuery}"</span>
            </span>
            <button onClick={clear} className="text-[11px] text-faint hover:text-muted transition-colors">
              Clear
            </button>
          </div>
          {focus && (
            <p className="text-[11px] text-dim mt-1 leading-snug">
              <span className="text-faint font-semibold">Covering:</span> {focus}
            </p>
          )}
        </div>
      )}

      {/* Body */}
      {isSearching ? (
        <div className="p-8 flex items-center justify-center gap-2 text-dim text-sm">
          <CircleNotch size={16} weight="bold" className="spin-slow" />
          Searching…
        </div>
      ) : news.length === 0 ? (
        <div className="p-6 text-center text-dim text-sm">
          {activeQuery ? `No news found for "${activeQuery}"` : 'No news loaded'}
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {news.slice(0, 20).map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-3 hover:bg-surface-2 transition-colors group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {item.symbols.length > 0 && (
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      {item.symbols.slice(0, 4).map((s) => (
                        <span key={s} className="mono text-[9px] font-bold text-muted bg-surface-3 px-1.5 py-0.5 rounded border border-border-strong">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted leading-snug group-hover:text-fg transition-colors line-clamp-2">
                    {item.headline}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[10px] mono text-dim">{formatAge(item.createdAt)}</div>
                  <div className="text-[9px] text-dim mt-0.5">{item.source}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
