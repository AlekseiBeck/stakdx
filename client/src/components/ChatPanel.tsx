import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ChatCircleDots, Plus, List, X, PaperPlaneTilt, Flask, CaretRight, CaretDown,
  ChartLineUp, Check,
} from '@phosphor-icons/react';
import { TradeRecommendation, NewsItem, Position } from '../types';
import {
  chatStream,
  NewsAPIResult,
  ChatSession,
  ChartRange,
  listChatSessions,
  createChatSession,
  deleteChatSession,
  loadSessionMessages,
  saveSessionMessages,
  updateChatSessionResearch,
  fetchWatchlist,
} from '../api';
import StockChart from './StockChart';

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
  content: "Hey! I'm your Stakdx AI. Ask me about scan results, your positions, or any setup you're watching.",
};

const SUGGESTIONS = [
  "What's moving the market today?",
  'Analyze my open positions',
  'Best setups from the latest scan',
  'Should I hold NVDA through earnings?',
];

// ─── Ticker + timeframe detection for research mode ──────────────────────────

// All-caps words that look like tickers but almost never are one in chat
const TICKER_BLACKLIST = new Set([
  'I', 'A', 'AI', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'IF', 'IN', 'IS', 'IT',
  'ME', 'MY', 'NO', 'OF', 'OK', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE', 'ALL', 'AND',
  'ANY', 'ARE', 'BUY', 'CAN', 'CEO', 'CFO', 'CPI', 'DAY', 'DD', 'EPS', 'ETF', 'FED',
  'FOR', 'GDP', 'HAS', 'HOW', 'IPO', 'LOW', 'NEW', 'NOT', 'NOW', 'OUT', 'PE', 'PUT',
  'RSI', 'SEC', 'THE', 'TOP', 'USA', 'WHO', 'WHY', 'YOY', 'YTD', 'CALL', 'HIGH', 'HOLD',
  'LONG', 'NEWS', 'OPEN', 'RISK', 'SELL', 'STOP', 'VWAP', 'WHAT', 'WHEN', 'GOOD',
]);

// Company names → tickers for casual mentions ("how is nvidia doing")
const NAME_TO_TICKER: Record<string, string> = {
  nvidia: 'NVDA', tesla: 'TSLA', apple: 'AAPL', microsoft: 'MSFT', amazon: 'AMZN',
  google: 'GOOGL', alphabet: 'GOOGL', meta: 'META', facebook: 'META', netflix: 'NFLX',
  intel: 'INTC', palantir: 'PLTR', coinbase: 'COIN', broadcom: 'AVGO', micron: 'MU',
  salesforce: 'CRM', uber: 'UBER', boeing: 'BA', disney: 'DIS', amd: 'AMD',
};

// Lowercase ticker mentions that are unambiguous (not English words)
const POPULAR_LOWER = new Set([
  'nvda', 'tsla', 'aapl', 'amd', 'msft', 'amzn', 'googl', 'goog', 'meta', 'nflx',
  'pltr', 'smci', 'avgo', 'intc', 'qqq', 'spy', 'sofi', 'hood', 'mstr', 'arm',
]);

function detectTicker(text: string, watchlist: string[]): string | null {
  const dollar = text.match(/\$([A-Za-z]{1,5})\b/);
  if (dollar) return dollar[1].toUpperCase();

  const wl = new Set(watchlist);
  for (const tok of text.match(/\b[A-Z]{2,5}\b/g) ?? []) {
    if (!TICKER_BLACKLIST.has(tok) && wl.has(tok)) return tok;
  }

  const lower = text.toLowerCase();
  for (const [name, tick] of Object.entries(NAME_TO_TICKER)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return tick;
  }
  for (const w of lower.match(/\b[a-z]{3,5}\b/g) ?? []) {
    if (POPULAR_LOWER.has(w)) return w.toUpperCase();
  }
  return null;
}

// Map natural-language time references to a chart range
function detectRange(text: string): ChartRange | null {
  const t = text.toLowerCase();
  if (/\b(right now|live price|at the moment)\b/.test(t)) return 'now';
  if (/\b(today|intraday|this morning|premarket|pre-market|after hours)\b/.test(t)) return '1d';
  if (/\b(this week|past week|last week|past few days|recent days)\b/.test(t)) return '1w';
  if (/\b(this month|past month|last month|past 30 days|recently|lately)\b/.test(t)) return '1m';
  if (/\b(ytd|year to date|this year|since january)\b/.test(t)) return 'ytd';
  if (/\b(past year|last year|past 12 months|one year|1 year)\b/.test(t)) return '1y';
  if (/\b(all time|all-time|max|entire history|long term|long-term|past 5 years|decade|since ipo)\b/.test(t)) return 'max';
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────

function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatPanel({ positions, scanResults, news, prices, candleSummaries, tickerNews, newsAPIArticles }: ChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  // Research mode
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [researchPending, setResearchPending] = useState(false); // toggle before a session exists
  const [chartRange, setChartRange] = useState<ChartRange>('2y');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [tickerInput, setTickerInput] = useState('');
  const [showTickerInput, setShowTickerInput] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Pending messages to save once streaming completes (user + assistant pair)
  const pendingSave = useRef<{ sessionId: string; msgs: Array<{ role: 'user' | 'assistant'; content: string }> } | null>(null);

  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );
  const isResearch = activeSession ? !!activeSession.is_research : researchPending;
  const researchTicker = activeSession?.is_research ? activeSession.ticker ?? null : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load sessions + ticker universe on mount
  useEffect(() => {
    listChatSessions().then(setSessions);
    fetchWatchlist().then(setWatchlist);
  }, []);

  const patchSessionLocal = useCallback((updated: ChatSession) => {
    setSessions(prev => {
      const next = prev.map(s => (s.id === updated.id ? { ...s, ...updated } : s));
      return next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });
  }, []);

  // Persist a research patch; if the server can't (e.g. DB migration not run yet),
  // apply it locally so the feature still works for this browser session.
  const applyResearchPatch = useCallback(async (
    session: ChatSession,
    fields: { is_research?: boolean; ticker?: string | null }
  ): Promise<ChatSession> => {
    const updated = await updateChatSessionResearch(session.id, fields);
    if (updated) return updated;
    const local: ChatSession = { ...session };
    if (fields.is_research !== undefined) local.is_research = fields.is_research;
    if (fields.ticker !== undefined) local.ticker = fields.ticker;
    if (fields.is_research === false) {
      local.ticker = null;
      local.updated_at = new Date().toISOString();
    }
    return local;
  }, []);

  const switchSession = useCallback(async (session: ChatSession) => {
    if (loadingSession || session.id === activeSessionId) {
      setSidebarOpen(false);
      return;
    }
    setLoadingSession(true);
    setActiveSessionId(session.id);
    setSidebarOpen(false);
    setChartRange('2y');
    setShowTickerInput(false);
    const stored = await loadSessionMessages(session.id);
    if (stored.length === 0) {
      setMessages([WELCOME]);
    } else {
      setMessages(stored.map(m => ({ id: m.id, role: m.role, content: m.content })));
    }
    setLoadingSession(false);
  }, [activeSessionId, loadingSession]);

  const startNewChat = useCallback(async () => {
    setSidebarOpen(false);
    setActiveSessionId(null);
    setMessages([WELCOME]);
    setInput('');
    setResearchPending(false);
    setChartRange('2y');
    setShowTickerInput(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, []);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteChatSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([WELCOME]);
    }
  }, [activeSessionId]);

  // Toggle research mode for the current chat (or pre-toggle for a new chat)
  const toggleResearch = useCallback(async () => {
    if (!activeSession) {
      setResearchPending(p => !p);
      return;
    }
    const marking = !activeSession.is_research;
    // Detect ticker from existing conversation when marking
    let ticker: string | null = null;
    if (marking) {
      for (const m of messages) {
        if (m.role !== 'user') continue;
        ticker = detectTicker(m.content, watchlist);
        if (ticker) break;
      }
    }
    const updated = await applyResearchPatch(activeSession, {
      is_research: marking,
      ...(marking && ticker ? { ticker } : {}),
    });
    patchSessionLocal(updated);
    if (marking && !updated.ticker) setShowTickerInput(true);
    if (!marking) setShowTickerInput(false);
  }, [activeSession, messages, watchlist, patchSessionLocal, applyResearchPatch]);

  const submitTicker = useCallback(async () => {
    const t = tickerInput.trim().toUpperCase();
    if (!t || !activeSession) return;
    const updated = await applyResearchPatch(activeSession, { ticker: t });
    patchSessionLocal(updated);
    setShowTickerInput(false);
    setTickerInput('');
  }, [tickerInput, activeSession, patchSessionLocal, applyResearchPatch]);

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || isStreaming) return;

    if (inputRef.current) inputRef.current.style.height = 'auto';
    setInput('');

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const asstId = `a-${Date.now()}`;

    setMessages(prev => [...prev, userMsg, { id: asstId, role: 'assistant', content: '' }]);
    setIsStreaming(true);

    // Research-mode reactions to this message
    const detectedRange = detectRange(text);
    if (detectedRange && (isResearch || researchPending)) setChartRange(detectedRange);

    // Ensure a session exists before we stream (so we can save messages after)
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const session = await createChatSession(truncate(text, 60));
        sessionId = session.id;
        setActiveSessionId(session.id);
        let stored: ChatSession = session;
        // Apply pending research mode + auto-detected ticker to the new session
        if (researchPending) {
          const ticker = detectTicker(text, watchlist);
          stored = await applyResearchPatch(session, {
            is_research: true,
            ...(ticker ? { ticker } : {}),
          });
          setResearchPending(false);
          if (!stored.ticker) setShowTickerInput(true);
        }
        setSessions(prev => [stored, ...prev]);
      } catch {
        // No DB — chat still works, just no persistence
      }
    } else if (activeSession?.is_research && !activeSession.ticker) {
      // Research chat without a tag yet — try to tag from this message
      const ticker = detectTicker(text, watchlist);
      if (ticker) {
        const updated = await applyResearchPatch(activeSession, { ticker });
        patchSessionLocal(updated);
        setShowTickerInput(false);
      }
    }

    try {
      const history = [...messages, userMsg]
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      let finalContent = '';
      await chatStream(history, { positions, scanResults, news, prices, candleSummaries, tickerNews, newsAPIArticles }, (chunk) => {
        finalContent += chunk;
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: m.content + chunk } : m));
      });

      // Save to DB after streaming completes
      if (sessionId) {
        pendingSave.current = {
          sessionId,
          msgs: [
            { role: 'user', content: text },
            { role: 'assistant', content: finalContent },
          ],
        };
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, content: "Couldn't reach the server. Check your connection." } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  // Save messages after streaming ends (isStreaming → false)
  useEffect(() => {
    if (!isStreaming && pendingSave.current) {
      const { sessionId, msgs } = pendingSave.current;
      pendingSave.current = null;
      saveSessionMessages(sessionId, msgs);
      // Update session updated_at in local list
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === sessionId);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], updated_at: new Date().toISOString() };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    }
  }, [isStreaming]);

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

  const toggleFolder = (key: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Sidebar grouping: research sessions foldered by ticker, then regular chats
  const { researchFolders, regularSessions } = useMemo(() => {
    const folders: Record<string, ChatSession[]> = {};
    const regular: ChatSession[] = [];
    for (const s of sessions) {
      if (s.is_research) {
        const key = s.ticker || 'Untagged';
        (folders[key] ??= []).push(s);
      } else {
        regular.push(s);
      }
    }
    const orderedKeys = Object.keys(folders).sort((a, b) => {
      if (a === 'Untagged') return 1;
      if (b === 'Untagged') return -1;
      return a.localeCompare(b);
    });
    return {
      researchFolders: orderedKeys.map(k => ({ ticker: k, sessions: folders[k] })),
      regularSessions: regular,
    };
  }, [sessions]);

  const sessionRow = (session: ChatSession, indent = false) => (
    <div
      key={session.id}
      onClick={() => switchSession(session)}
      className={`group flex items-center gap-2 py-2 pr-2 cursor-pointer transition-colors ${indent ? 'pl-7' : 'pl-3'} ${
        session.id === activeSessionId
          ? 'bg-[#1a1a1c] text-white'
          : 'text-gray-400 hover:bg-[#141415] hover:text-white'
      }`}
    >
      {session.is_research
        ? <Flask size={13} weight="duotone" className="flex-shrink-0 text-amber-500/80" />
        : <ChatCircleDots size={13} weight="duotone" className="flex-shrink-0 text-gray-600" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate leading-tight">{session.title}</p>
        <p className="text-[10px] text-gray-600 mt-0.5">{formatDate(session.updated_at)}</p>
      </div>
      <button
        onClick={(e) => handleDeleteSession(e, session.id)}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
      >
        <X size={13} weight="bold" />
      </button>
    </div>
  );

  return (
    <div className="flex h-full bg-[#0c0c0d] overflow-hidden">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 bg-black/60 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Session sidebar */}
      <div className={`
        absolute lg:relative z-20 flex flex-col bg-[#0e0e0f] border-r border-[#1e1e20]
        w-64 h-full transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-3 h-12 border-b border-[#222225]">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</span>
          <button
            onClick={startNewChat}
            title="New chat"
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-[#222225] transition-colors"
          >
            <Plus size={15} weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-600 px-3 py-3">No saved chats yet.</p>
          ) : (
            <>
              {/* Research folders */}
              {researchFolders.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-amber-500/70 uppercase tracking-widest flex items-center gap-1.5">
                    <Flask size={11} weight="duotone" /> Research
                  </p>
                  {researchFolders.map(({ ticker, sessions: folderSessions }) => {
                    const collapsed = collapsedFolders.has(ticker);
                    return (
                      <div key={ticker}>
                        <button
                          onClick={() => toggleFolder(ticker)}
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white transition-colors"
                        >
                          {collapsed
                            ? <CaretRight size={11} weight="bold" className="text-gray-600" />
                            : <CaretDown size={11} weight="bold" className="text-gray-600" />}
                          <span className="mono text-[11px] font-bold tracking-wide">{ticker}</span>
                          <span className="text-[10px] text-gray-600 ml-auto">{folderSessions.length}</span>
                        </button>
                        {!collapsed && folderSessions.map(s => sessionRow(s, true))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Regular chats */}
              {regularSessions.length > 0 && (
                <div>
                  {researchFolders.length > 0 && (
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                      <ChatCircleDots size={11} weight="duotone" /> Chats
                    </p>
                  )}
                  {regularSessions.map(s => sessionRow(s))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Top bar with sidebar toggle + research toggle */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 h-12 border-b border-[#222225]">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-[#1e1e20] transition-colors"
          >
            <List size={16} weight="bold" />
          </button>
          {researchTicker && (
            <span className="mono text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded px-1.5 py-0.5 flex-shrink-0">
              {researchTicker}
            </span>
          )}
          <span className="text-xs text-gray-500 truncate">
            {activeSession ? activeSession.title : 'New Chat'}
          </span>

          <div className="flex-1" />

          {/* Manual ticker tag input (research chat without a detected ticker) */}
          {isResearch && activeSession && !researchTicker && showTickerInput && (
            <form
              onSubmit={(e) => { e.preventDefault(); submitTicker(); }}
              className="flex items-center gap-1"
            >
              <input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6))}
                placeholder="TICKER"
                className="w-20 bg-[#141415] border border-[#2a2a2c] rounded-md px-2 py-1 mono text-[11px] text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/50"
              />
              <button type="submit" className="w-6 h-6 flex items-center justify-center rounded-md text-amber-400 hover:bg-amber-500/10" title="Set ticker">
                <Check size={13} weight="bold" />
              </button>
            </form>
          )}

          <button
            onClick={toggleResearch}
            title={isResearch ? 'Unmark as research (chat moves to today)' : 'Mark as research'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all flex-shrink-0 ${
              isResearch
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-[#141415] text-gray-500 border border-[#222225] hover:text-gray-300 hover:border-[#2e2e32]'
            }`}
          >
            <Flask size={13} weight={isResearch ? 'fill' : 'duotone'} />
            Research
          </button>

          {activeSessionId && (
            <button
              onClick={startNewChat}
              className="text-[10px] text-gray-600 hover:text-amber-400 transition-colors flex-shrink-0"
            >
              + New
            </button>
          )}
        </div>

        {/* Research stock chart */}
        {researchTicker && (
          <StockChart ticker={researchTicker} range={chartRange} onRangeChange={setChartRange} />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {loadingSession ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          ) : messages.length === 1 && messages[0].id === 'welcome' ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 fade-in-up">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xl font-bold text-black shadow-[0_0_40px_-8px_rgba(245,158,11,0.55)] mb-5">
                S
              </div>
              <h2 className="font-display text-xl font-bold text-white mb-1.5">Stakdx AI</h2>
              <p className="text-sm text-gray-500 max-w-sm mb-4 leading-relaxed">
                Ask about scan results, your positions, or any setup you're watching.
              </p>
              {researchPending && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-5">
                  <ChartLineUp size={13} weight="duotone" />
                  Research mode — mention a ticker and I'll pin its chart
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs text-gray-400 glass rounded-xl px-3.5 py-3 hover:border-amber-500/40 hover:text-gray-200 transition-all duration-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-[11px] font-bold text-black flex-shrink-0 mt-0.5 shadow-lg shadow-amber-900/40">
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
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-t border-[#222225]" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-2 bg-[#141415] border border-[#222225] rounded-xl px-3.5 py-2.5 focus-within:border-amber-500/40 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.08)] transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder={isResearch ? 'Ask about a stock — its chart pins above…' : 'Ask about setups, positions, or market conditions...'}
              rows={1}
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 resize-none focus:outline-none leading-relaxed py-0"
              style={{ maxHeight: '120px', scrollbarWidth: 'none' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || isStreaming}
              className="w-8 h-8 rounded-lg bg-amber-500 text-black flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400 transition-colors"
            >
              <PaperPlaneTilt size={15} weight="fill" />
            </button>
          </div>
          <p className="hidden sm:block text-[10px] text-gray-700 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>
    </div>
  );
}
