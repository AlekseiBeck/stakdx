import React, { useState, useRef, useEffect } from 'react';
import { TradeRecommendation, NewsItem, Position } from '../types';
import { chatStream, NewsAPIResult } from '../api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  positions: Position[];
  scanResults: TradeRecommendation[];
  news: NewsItem[];
  prices: Record<string, number>;
  candleSummaries: Record<string, string>;
  tickerNews: Record<string, string[]>;
  newsAPIArticles: NewsAPIResult[];
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your Stakd AI. Ask me about scan results, your positions, or any setup you're watching.",
};

function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatPanel({ positions, scanResults, news, prices, candleSummaries, tickerNews, newsAPIArticles }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setInput('');

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const asstId = `a-${Date.now()}`;

    setMessages(prev => [...prev, userMsg, { id: asstId, role: 'assistant', content: '' }]);
    setIsStreaming(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      await chatStream(history, { positions, scanResults, news, prices, candleSummaries, tickerNews, newsAPIArticles }, (chunk) => {
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: m.content + chunk } : m));
      });
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, content: "Couldn't reach the server. Check your connection." } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0d]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-[11px] font-bold text-black flex-shrink-0 mt-0.5 shadow-lg shadow-amber-900/40">
                S
              </div>
            )}
            <div className={`max-w-[82%] text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#222225] text-white px-4 py-2.5 rounded-2xl rounded-br-sm shadow-lg'
                : 'text-gray-200'
            }`}>
              {msg.content === '' && isStreaming ? (
                <span className="flex gap-1.5 items-center h-5">
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              ) : (
                <span className="whitespace-pre-wrap">{renderContent(msg.content)}</span>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-[#1e1e20] border border-[#2a2a2c] flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0 mt-0.5">
                U
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[#222225]">
        <div className="flex items-end gap-2 bg-[#141415] border border-[#222225] rounded-xl px-3.5 py-2.5 focus-within:border-amber-500/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            placeholder="Ask about setups, positions, or market conditions..."
            rows={1}
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 resize-none focus:outline-none leading-relaxed py-0"
            style={{ maxHeight: '120px', scrollbarWidth: 'none' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-lg bg-amber-500 text-black flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400 transition-colors mb-0.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="hidden sm:block text-[10px] text-gray-700 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
