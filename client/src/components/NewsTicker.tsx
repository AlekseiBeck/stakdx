import React from 'react';
import { NewsItem } from '../types';

interface Props {
  news: NewsItem[];
}

function formatAge(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export default function NewsTicker({ news }: Props) {
  if (news.length === 0) return null;

  const items = [...news, ...news]; // duplicate for seamless loop

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#111112]/95 border-t border-[#222225] backdrop-blur-sm z-40">
      <div className="flex items-stretch overflow-hidden">
        {/* Label */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-600 text-black">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">Market News</span>
        </div>

        {/* Scrolling track */}
        <div className="flex-1 overflow-hidden py-2">
          <div className="ticker-track">
            {items.map((item, idx) => (
              <span key={`${item.id}-${idx}`} className="inline-flex items-center gap-3 px-6">
                <span className="flex items-center gap-1.5">
                  {item.symbols.slice(0, 3).map((s) => (
                    <span key={s} className="mono text-[10px] font-bold text-gray-400 bg-[#222225] px-1.5 py-0.5 rounded">
                      {s}
                    </span>
                  ))}
                </span>
                <span className="text-sm text-gray-300">{item.headline}</span>
                <span className="text-[10px] text-gray-600 whitespace-nowrap">{formatAge(item.createdAt)} · {item.source}</span>
                <span className="text-gray-700 mx-2">◆</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
