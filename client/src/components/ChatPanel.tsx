import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ChatCircleDots, Plus, List, X, PaperPlaneTilt, Flask, CaretRight,
  CaretLeft, ChartLineUp, Check, PencilSimple, Layout, SquaresFour,
} from '@phosphor-icons/react';
import { TradeRecommendation, NewsItem, Position } from '../types';
import {
  chatStream,
  NewsAPIResult,
  ChatSession,
  WorkstationArticle,
  ChartRange,
  listChatSessions,
  createChatSession,
  deleteChatSession,
  loadSessionMessages,
  saveSessionMessages,
  renameChatSession,
  updateChatSessionResearch,
  updateChatSessionWorkstation,
  fetchChatContext,
  fetchWatchlist,
} from '../api';
import StockChart from './StockChart';
import WorkstationPanel from './WorkstationPanel';

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

// ─── Research-mode chart/chat layout ─────────────────────────────────────────
// One flex-direction drives all four arrangements (chart is always the first child).
type ChartLayout = 'col' | 'col-reverse' | 'row' | 'row-reverse';

const LAYOUT_FLEX: Record<ChartLayout, string> = {
  col: 'flex-col', 'col-reverse': 'flex-col-reverse', row: 'flex-row', 'row-reverse': 'flex-row-reverse',
};
// Divider between the chart panel and the conversation (chart side facing the chat)
const LAYOUT_DIVIDER: Record<ChartLayout, string> = {
  col: 'border-b', 'col-reverse': 'border-t', row: 'border-r', 'row-reverse': 'border-l',
};
const LAYOUT_OPTIONS: { key: ChartLayout; label: string }[] = [
  { key: 'col', label: 'Chart on top' },
  { key: 'col-reverse', label: 'Chart on bottom' },
  { key: 'row', label: 'Chart on left' },
  { key: 'row-reverse', label: 'Chart on right' },
];

const isChartLayout = (v: unknown): v is ChartLayout =>
  v === 'col' || v === 'col-reverse' || v === 'row' || v === 'row-reverse';

// The three chat modes. 'research' pins one ticker's chart; 'workstation' loads several
// side by side. Both are persisted as flags on the chat session (mutually exclusive).
type ChatMode = 'chat' | 'research' | 'workstation';
const MODE_OPTIONS: { key: ChatMode; label: string; Icon: typeof Flask }[] = [
  { key: 'chat', label: 'Chat', Icon: ChatCircleDots },
  { key: 'research', label: 'Research', Icon: Flask },
  { key: 'workstation', label: 'Workstation', Icon: SquaresFour },
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

export function detectTicker(text: string, watchlist: string[]): string | null {
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
export function detectRange(text: string): ChartRange | null {
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
      return <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>;
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
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  // Research mode
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [researchPending, setResearchPending] = useState(false); // toggle before a session exists
  const [workstationPending, setWorkstationPending] = useState(false); // workstation toggle before a session exists
  const [chartRange, setChartRange] = useState<ChartRange>('2y');
  // Candle/news context for the workstation's loaded tickers, so the chat is aware of them
  const [workstationCtx, setWorkstationCtx] = useState<{
    candleSummaries: Record<string, string>;
    tickerNews: Record<string, string[]>;
    newsAPIArticles: NewsAPIResult[];
  }>({ candleSummaries: {}, tickerNews: {}, newsAPIArticles: [] });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [tickerInput, setTickerInput] = useState('');
  const [showTickerInput, setShowTickerInput] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [renamingWorkstation, setRenamingWorkstation] = useState<string | null>(null);
  const [workstationRenameValue, setWorkstationRenameValue] = useState('');
  const [chartLayout, setChartLayout] = useState<ChartLayout>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('stakdx-chart-layout') : null;
    return saved === 'col' || saved === 'col-reverse' || saved === 'row' || saved === 'row-reverse' ? saved : 'col';
  });
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [chartCollapsed, setChartCollapsed] = useState(false);
  // Chart panel size as a fraction of the split, kept separately for vertical/horizontal layouts
  const [chartFraction, setChartFraction] = useState<{ v: number; h: number }>(() => {
    try {
      const s = JSON.parse((typeof window !== 'undefined' && window.localStorage.getItem('stakdx-chart-fraction')) || 'null');
      if (s && typeof s.v === 'number' && typeof s.h === 'number') return s;
    } catch { /* ignore */ }
    return { v: 0.4, h: 0.5 };
  });
  const [dragging, setDragging] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const layoutContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const isHorizontal = chartLayout === 'row' || chartLayout === 'row-reverse';

  // Pending messages to save once streaming completes (user + assistant pair)
  const pendingSave = useRef<{ sessionId: string; msgs: Array<{ role: 'user' | 'assistant'; content: string }> } | null>(null);

  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );
  const mode: ChatMode = activeSession
    ? (activeSession.is_workstation ? 'workstation' : activeSession.is_research ? 'research' : 'chat')
    : (workstationPending ? 'workstation' : researchPending ? 'research' : 'chat');
  const isResearch = mode === 'research';
  const researchTicker = activeSession?.is_research ? activeSession.ticker ?? null : null;
  const workstationTickers = activeSession?.is_workstation ? (activeSession.tickers ?? []) : [];
  const workstationArticles = activeSession?.is_workstation ? (activeSession.articles ?? []) : [];
  const showChartPanel = !!researchTicker || mode === 'workstation';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load sessions + ticker universe on mount
  useEffect(() => {
    listChatSessions().then(setSessions);
    fetchWatchlist().then(setWatchlist);
  }, []);

  // Persist the chart/chat layout preference
  useEffect(() => {
    try { window.localStorage.setItem('stakdx-chart-layout', chartLayout); } catch { /* ignore */ }
  }, [chartLayout]);

  // Persist the chart/chat split sizes
  useEffect(() => {
    try { window.localStorage.setItem('stakdx-chart-fraction', JSON.stringify(chartFraction)); } catch { /* ignore */ }
  }, [chartFraction]);

  // Collapse-to-header only applies to vertical layouts; auto-expand in side-by-side
  useEffect(() => {
    if (isHorizontal && chartCollapsed) setChartCollapsed(false);
  }, [isHorizontal, chartCollapsed]);

  // Load candle/news context for the workstation's loaded tickers so the chat can reason
  // over them (reuses the same endpoint that feeds position tickers into chat context).
  const workstationKey = workstationTickers.join(',');
  useEffect(() => {
    if (mode !== 'workstation' || workstationTickers.length === 0) {
      setWorkstationCtx({ candleSummaries: {}, tickerNews: {}, newsAPIArticles: [] });
      return;
    }
    let cancelled = false;
    fetchChatContext(workstationTickers)
      .then(ctx => { if (!cancelled) setWorkstationCtx(ctx); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, workstationKey]);

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
    if (fields.is_research !== undefined) {
      local.is_research = fields.is_research;
      if (fields.is_research) { local.is_workstation = false; local.tickers = []; }
    }
    if (fields.ticker !== undefined) local.ticker = fields.ticker;
    if (fields.is_research === false) {
      local.ticker = null;
      local.updated_at = new Date().toISOString();
    }
    return local;
  }, []);

  // Workstation equivalent of applyResearchPatch — persists, falling back to a local-only
  // patch when the server can't (e.g. the workstation migration hasn't been run yet).
  const applyWorkstationPatch = useCallback(async (
    session: ChatSession,
    fields: { is_workstation?: boolean; tickers?: string[]; layout?: string | null; articles?: WorkstationArticle[] }
  ): Promise<ChatSession> => {
    const updated = await updateChatSessionWorkstation(session.id, fields);
    if (updated) return updated;
    const local: ChatSession = { ...session };
    if (fields.is_workstation !== undefined) {
      local.is_workstation = fields.is_workstation;
      if (fields.is_workstation) {
        local.is_research = false;
        local.ticker = null;
      } else {
        local.tickers = [];
        local.layout = null;
        local.articles = [];
        local.updated_at = new Date().toISOString();
      }
    }
    if (fields.tickers !== undefined && fields.is_workstation !== false) local.tickers = fields.tickers;
    if (fields.layout !== undefined && fields.is_workstation !== false) local.layout = fields.layout;
    if (fields.articles !== undefined && fields.is_workstation !== false) local.articles = fields.articles;
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
    setResearchPending(false);
    setWorkstationPending(false);
    if (session.is_workstation && isChartLayout(session.layout)) setChartLayout(session.layout);
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
    setWorkstationPending(false);
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

  // Switch the active chat between the three modes (or pre-select for a new chat).
  const setMode = useCallback(async (target: ChatMode) => {
    if (target === mode) return;
    setLayoutMenuOpen(false);
    if (!activeSession) {
      setResearchPending(target === 'research');
      setWorkstationPending(target === 'workstation');
      setShowTickerInput(false);
      return;
    }
    if (target === 'chat') {
      const updated = activeSession.is_workstation
        ? await applyWorkstationPatch(activeSession, { is_workstation: false })
        : await applyResearchPatch(activeSession, { is_research: false });
      patchSessionLocal(updated);
      setShowTickerInput(false);
    } else if (target === 'research') {
      // Detect a ticker from the existing conversation when marking research
      let ticker: string | null = null;
      for (const m of messages) {
        if (m.role !== 'user') continue;
        ticker = detectTicker(m.content, watchlist);
        if (ticker) break;
      }
      const updated = await applyResearchPatch(activeSession, {
        is_research: true,
        ...(ticker ? { ticker } : {}),
      });
      patchSessionLocal(updated);
      if (!updated.ticker) setShowTickerInput(true);
    } else {
      const updated = await applyWorkstationPatch(activeSession, { is_workstation: true });
      patchSessionLocal(updated);
      setShowTickerInput(false);
    }
  }, [mode, activeSession, messages, watchlist, patchSessionLocal, applyResearchPatch, applyWorkstationPatch]);

  // Create-or-return the active session as a workstation (so tickers added before the
  // first message still persist), mirroring the lazy session creation in send().
  const ensureWorkstationSession = useCallback(async (): Promise<ChatSession | null> => {
    if (activeSession) return activeSession;
    try {
      const session = await createChatSession('Workstation');
      const ws = await applyWorkstationPatch(session, { is_workstation: true });
      setActiveSessionId(ws.id);
      setSessions(prev => [ws, ...prev]);
      setWorkstationPending(false);
      return ws;
    } catch {
      return null;
    }
  }, [activeSession, applyWorkstationPatch]);

  const addWorkstationTicker = useCallback(async (t: string) => {
    const session = await ensureWorkstationSession();
    if (!session) return;
    const current = session.tickers ?? [];
    if (current.includes(t) || current.length >= 12) return;
    const updated = await applyWorkstationPatch(session, { tickers: [...current, t] });
    patchSessionLocal(updated);
  }, [ensureWorkstationSession, applyWorkstationPatch, patchSessionLocal]);

  const removeWorkstationTicker = useCallback(async (t: string) => {
    if (!activeSession) return;
    const current = activeSession.tickers ?? [];
    const updated = await applyWorkstationPatch(activeSession, { tickers: current.filter(x => x !== t) });
    patchSessionLocal(updated);
  }, [activeSession, applyWorkstationPatch, patchSessionLocal]);

  const addWorkstationArticle = useCallback(async (article: WorkstationArticle) => {
    const session = await ensureWorkstationSession();
    if (!session) return;
    const current = session.articles ?? [];
    if (current.some(a => a.url === article.url) || current.length >= 30) return;
    const updated = await applyWorkstationPatch(session, { articles: [...current, article] });
    patchSessionLocal(updated);
  }, [ensureWorkstationSession, applyWorkstationPatch, patchSessionLocal]);

  const removeWorkstationArticle = useCallback(async (url: string) => {
    if (!activeSession) return;
    const current = activeSession.articles ?? [];
    const updated = await applyWorkstationPatch(activeSession, { articles: current.filter(a => a.url !== url) });
    patchSessionLocal(updated);
  }, [activeSession, applyWorkstationPatch, patchSessionLocal]);

  // Pick a chart/chat split layout; persist it on the workstation session.
  const chooseLayout = useCallback((key: ChartLayout) => {
    setChartLayout(key);
    setLayoutMenuOpen(false);
    if (activeSession?.is_workstation) {
      applyWorkstationPatch(activeSession, { layout: key }).then(patchSessionLocal);
    }
  }, [activeSession, applyWorkstationPatch, patchSessionLocal]);

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
        } else if (workstationPending) {
          stored = await applyWorkstationPatch(session, { is_workstation: true });
          setWorkstationPending(false);
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

      // In workstation mode, fold the loaded tickers' candle/news context in and tell
      // the model which tickers are on screen so it can reason over "these" / "them".
      const baseCtx = { positions, scanResults, news, prices, candleSummaries, tickerNews, newsAPIArticles };
      const ctx = mode === 'workstation' && workstationTickers.length > 0
        ? {
            ...baseCtx,
            candleSummaries: { ...candleSummaries, ...workstationCtx.candleSummaries },
            tickerNews: { ...tickerNews, ...workstationCtx.tickerNews },
            newsAPIArticles: [...newsAPIArticles, ...workstationCtx.newsAPIArticles],
            workstationTickers,
          }
        : baseCtx;

      let finalContent = '';
      await chatStream(history, ctx, (chunk) => {
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

  // ── Drag-to-resize the chart/chat split ──────────────────────────────────────
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !layoutContainerRef.current) return;
    const rect = layoutContainerRef.current.getBoundingClientRect();
    let frac: number;
    if (chartLayout === 'row') frac = (e.clientX - rect.left) / rect.width;
    else if (chartLayout === 'row-reverse') frac = (rect.right - e.clientX) / rect.width;
    else if (chartLayout === 'col') frac = (e.clientY - rect.top) / rect.height;
    else frac = (rect.bottom - e.clientY) / rect.height; // col-reverse
    frac = Math.min(0.85, Math.max(0.15, frac));
    setChartFraction(prev => ({ ...prev, [isHorizontal ? 'h' : 'v']: frac }));
  };
  const endResize = (e: React.PointerEvent) => {
    draggingRef.current = false;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const toggleFolder = (key: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startRenameFolder = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setFolderRenameValue(key === 'Untagged' ? '' : key);
    setRenamingFolder(key);
  };

  // Rename a folder = retag every research chat in it to the new ticker symbol.
  const renameFolder = useCallback(async (key: string, folderSessions: ChatSession[]) => {
    const t = folderRenameValue.trim().toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6);
    setRenamingFolder(null);
    setFolderRenameValue('');
    if (!t || t === key) return;
    for (const s of folderSessions) {
      const updated = await applyResearchPatch(s, { ticker: t });
      patchSessionLocal(updated);
    }
  }, [folderRenameValue, applyResearchPatch, patchSessionLocal]);

  const startRenameWorkstation = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    setWorkstationRenameValue(session.title);
    setRenamingWorkstation(session.id);
  };

  // Rename a workstation = set its session title (each workstation is its own saved instance).
  const renameWorkstation = useCallback(async (session: ChatSession) => {
    const title = workstationRenameValue.trim().slice(0, 100);
    setRenamingWorkstation(null);
    setWorkstationRenameValue('');
    if (!title || title === session.title) return;
    await renameChatSession(session.id, title);
    patchSessionLocal({ ...session, title });
  }, [workstationRenameValue, patchSessionLocal]);

  // ── Sidebar grouping: workstations, then research sessions foldered by ticker, then chats
  const { workstationSessions, researchFolders, regularSessions } = useMemo(() => {
    const folders: Record<string, ChatSession[]> = {};
    const regular: ChatSession[] = [];
    const workstations: ChatSession[] = [];
    for (const s of sessions) {
      if (s.is_workstation) {
        workstations.push(s);
      } else if (s.is_research) {
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
      workstationSessions: workstations,
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
          ? 'bg-surface-2 text-fg'
          : 'text-muted hover:bg-surface hover:text-fg'
      }`}
    >
      {session.is_workstation
        ? <SquaresFour size={13} weight="duotone" className="flex-shrink-0 text-amber-500/80" />
        : session.is_research
          ? <Flask size={13} weight="duotone" className="flex-shrink-0 text-amber-500/80" />
          : <ChatCircleDots size={13} weight="duotone" className="flex-shrink-0 text-dim" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate leading-tight">{session.title}</p>
        <p className="text-[10px] text-dim mt-0.5">{formatDate(session.updated_at)}</p>
      </div>
      <button
        onClick={(e) => handleDeleteSession(e, session.id)}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-dim hover:text-red-700 dark:hover:text-red-400 transition-all flex-shrink-0"
      >
        <X size={13} weight="bold" />
      </button>
    </div>
  );

  // Workstation rows are renamable saved instances (like research folders), so they get
  // their own row with an inline rename form + a rename pencil alongside delete.
  const workstationRow = (session: ChatSession) => {
    if (renamingWorkstation === session.id) {
      return (
        <form
          key={session.id}
          onSubmit={(e) => { e.preventDefault(); renameWorkstation(session); }}
          className="flex items-center gap-1 px-3 py-1.5"
        >
          <SquaresFour size={13} weight="duotone" className="flex-shrink-0 text-amber-500/80" />
          <input
            autoFocus
            value={workstationRenameValue}
            onChange={(e) => setWorkstationRenameValue(e.target.value.slice(0, 100))}
            onKeyDown={(e) => { if (e.key === 'Escape') { setRenamingWorkstation(null); setWorkstationRenameValue(''); } }}
            placeholder="Workstation name"
            className="flex-1 min-w-0 bg-surface border border-amber-500/40 rounded px-1.5 py-0.5 text-[11px] text-fg placeholder-dim focus:outline-none"
          />
          <button type="submit" className="w-5 h-5 flex items-center justify-center rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" title="Rename workstation">
            <Check size={12} weight="bold" />
          </button>
        </form>
      );
    }
    return (
      <div
        key={session.id}
        onClick={() => switchSession(session)}
        className={`group flex items-center gap-2 py-2 pr-2 pl-3 cursor-pointer transition-colors ${
          session.id === activeSessionId
            ? 'bg-surface-2 text-fg'
            : 'text-muted hover:bg-surface hover:text-fg'
        }`}
      >
        <SquaresFour size={13} weight="duotone" className="flex-shrink-0 text-amber-500/80" />
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate leading-tight">{session.title}</p>
          <p className="text-[10px] text-dim mt-0.5">{formatDate(session.updated_at)}</p>
        </div>
        <button
          onClick={(e) => startRenameWorkstation(e, session)}
          title="Rename workstation"
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-dim hover:text-amber-600 dark:hover:text-amber-400 transition-all flex-shrink-0"
        >
          <PencilSimple size={12} weight="bold" />
        </button>
        <button
          onClick={(e) => handleDeleteSession(e, session.id)}
          title="Delete workstation"
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-dim hover:text-red-700 dark:hover:text-red-400 transition-all flex-shrink-0"
        >
          <X size={13} weight="bold" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-bg overflow-hidden">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 bg-black/60 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Session sidebar — collapses fully (width 0) on desktop; off-canvas overlay on mobile */}
      <div className={`
        absolute lg:relative z-20 flex flex-shrink-0 bg-bg overflow-hidden
        w-64 h-full transition-all duration-200 ease-in-out border-r border-border
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${historyCollapsed ? 'lg:w-0 lg:border-r-0' : 'lg:w-64'}
      `}>
        {/* Full history content — fixed width so it clips/slides instead of reflowing */}
        <div className={`w-64 h-full flex flex-col flex-shrink-0 ${historyCollapsed ? 'lg:pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between px-3 h-12 border-b border-border">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">History</span>
          <button
            onClick={startNewChat}
            title="New chat"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-surface-3 transition-colors"
          >
            <Plus size={15} weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-dim px-3 py-3">No saved chats yet.</p>
          ) : (
            <>
              {/* Workstations */}
              {workstationSessions.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-amber-500/70 uppercase tracking-widest flex items-center gap-1.5">
                    <SquaresFour size={11} weight="duotone" /> Workstations
                  </p>
                  {workstationSessions.map(s => workstationRow(s))}
                </div>
              )}

              {/* Research folders */}
              {researchFolders.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-amber-500/70 uppercase tracking-widest flex items-center gap-1.5">
                    <Flask size={11} weight="duotone" /> Research
                  </p>
                  {researchFolders.map(({ ticker, sessions: folderSessions }) => {
                    const collapsed = collapsedFolders.has(ticker);
                    const renaming = renamingFolder === ticker;
                    return (
                      <div key={ticker}>
                        {renaming ? (
                          <form
                            onSubmit={(e) => { e.preventDefault(); renameFolder(ticker, folderSessions); }}
                            className="flex items-center gap-1 px-3 py-1.5"
                          >
                            <input
                              autoFocus
                              value={folderRenameValue}
                              onChange={(e) => setFolderRenameValue(e.target.value.toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6))}
                              onKeyDown={(e) => { if (e.key === 'Escape') { setRenamingFolder(null); setFolderRenameValue(''); } }}
                              placeholder="TICKER"
                              className="w-20 bg-surface border border-amber-500/40 rounded px-1.5 py-0.5 mono text-[11px] font-bold text-fg placeholder-dim focus:outline-none"
                            />
                            <button type="submit" className="w-5 h-5 flex items-center justify-center rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" title="Rename folder">
                              <Check size={12} weight="bold" />
                            </button>
                          </form>
                        ) : (
                          <div className="group/folder flex items-center gap-1.5 px-3 py-1.5 text-muted hover:text-fg transition-colors">
                            <button onClick={() => toggleFolder(ticker)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                              <CaretRight size={11} weight="bold" className={`text-dim flex-shrink-0 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`} />
                              <span className="mono text-[11px] font-bold tracking-wide truncate">{ticker}</span>
                            </button>
                            <button
                              onClick={(e) => startRenameFolder(e, ticker)}
                              title="Rename folder"
                              className="opacity-0 group-hover/folder:opacity-100 w-5 h-5 flex items-center justify-center rounded text-faint hover:text-amber-600 dark:hover:text-amber-400 transition-all flex-shrink-0"
                            >
                              <PencilSimple size={12} weight="bold" />
                            </button>
                            <span className="text-[10px] text-dim flex-shrink-0">{folderSessions.length}</span>
                          </div>
                        )}
                        <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
                          <div className="overflow-hidden">
                            {folderSessions.map(s => sessionRow(s, true))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Regular chats */}
              {regularSessions.length > 0 && (
                <div>
                  {(researchFolders.length > 0 || workstationSessions.length > 0) && (
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-dim uppercase tracking-widest flex items-center gap-1.5">
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
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Top bar with sidebar toggle + research toggle */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 h-12 border-b border-border">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title="Toggle history"
            className="lg:hidden w-7 h-7 flex items-center justify-center rounded-md text-faint hover:text-fg hover:bg-surface-2 transition-colors"
          >
            <List size={16} weight="bold" />
          </button>
          <button
            onClick={() => setHistoryCollapsed(c => !c)}
            title={historyCollapsed ? 'Show history' : 'Hide history'}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md text-faint hover:text-fg hover:bg-surface-2 transition-colors flex-shrink-0"
          >
            {historyCollapsed ? <CaretRight size={16} weight="bold" /> : <CaretLeft size={16} weight="bold" />}
          </button>
          {researchTicker && (
            <span className="mono text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded px-1.5 py-0.5 flex-shrink-0">
              {researchTicker}
            </span>
          )}
          <span className="text-xs text-faint truncate">
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
                className="w-20 bg-surface border border-border-strong rounded-md px-2 py-1 mono text-[11px] text-fg placeholder-dim focus:outline-none focus:border-amber-500/50"
              />
              <button type="submit" className="w-6 h-6 flex items-center justify-center rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" title="Set ticker">
                <Check size={13} weight="bold" />
              </button>
            </form>
          )}

          {/* Chart/chat layout picker (research or workstation with charts loaded) */}
          {(researchTicker || (mode === 'workstation' && workstationTickers.length > 0)) && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setLayoutMenuOpen(o => !o)}
                title="Chart layout"
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  layoutMenuOpen ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'text-faint hover:text-fg hover:bg-surface-2'
                }`}
              >
                <Layout size={15} weight="bold" />
              </button>
              {layoutMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLayoutMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-50 p-2 rounded-lg bg-surface border border-border-strong shadow-xl shadow-black/40 grid grid-cols-[auto_auto] gap-2">
                    {LAYOUT_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => chooseLayout(opt.key)}
                        title={opt.label}
                        className={`p-2 rounded-md border transition-colors ${
                          chartLayout === opt.key ? 'border-amber-500/60 bg-amber-500/10' : 'border-border hover:border-border-strong'
                        }`}
                      >
                        <div className={`flex ${LAYOUT_FLEX[opt.key]} gap-1 w-16 h-12`}>
                          <div className="flex-1 flex items-center justify-center rounded bg-surface-2 border border-border-strong" title="Chart">
                            <ChartLineUp size={14} weight="duotone" className="text-muted" />
                          </div>
                          <div className="flex-1 flex items-center justify-center rounded bg-surface-2 border border-border-strong" title="Chat">
                            <ChatCircleDots size={14} weight="duotone" className="text-muted" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mode toggle: Chat / Research / Workstation */}
          <div className="flex items-center bg-surface border border-border rounded-lg p-0.5 gap-0.5 flex-shrink-0">
            {MODE_OPTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                title={
                  key === 'workstation' ? 'Workstation — load multiple charts side by side'
                  : key === 'research' ? 'Research — pin one ticker chart'
                  : 'Regular chat'
                }
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  mode === key
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'text-faint hover:text-muted'
                }`}
              >
                <Icon size={13} weight={mode === key ? 'fill' : 'duotone'} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {activeSessionId && (
            <button
              onClick={startNewChat}
              className="text-[10px] text-dim hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex-shrink-0"
            >
              + New
            </button>
          )}
        </div>

        {/* Chart(s) + conversation, arranged per the selected layout (research / workstation) */}
        <div
          ref={layoutContainerRef}
          className={`flex-1 min-h-0 flex ${showChartPanel ? LAYOUT_FLEX[chartLayout] : 'flex-col'} ${
            dragging ? `select-none ${isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize'}` : ''
          }`}
        >
          {showChartPanel && (
            <div
              className={`flex flex-col min-w-0 min-h-0 flex-shrink-0 ${
                chartCollapsed ? `${LAYOUT_DIVIDER[chartLayout]} border-border` : ''
              }`}
              style={chartCollapsed ? undefined : { flexBasis: `${(isHorizontal ? chartFraction.h : chartFraction.v) * 100}%` }}
            >
              {researchTicker ? (
                <StockChart
                  ticker={researchTicker}
                  range={chartRange}
                  onRangeChange={setChartRange}
                  fill={!chartCollapsed}
                  collapsed={chartCollapsed}
                  onToggleCollapse={() => setChartCollapsed(c => !c)}
                  showCollapse={!isHorizontal}
                />
              ) : (
                <WorkstationPanel
                  tickers={workstationTickers}
                  onAddTicker={addWorkstationTicker}
                  onRemoveTicker={removeWorkstationTicker}
                  articles={workstationArticles}
                  onAddArticle={addWorkstationArticle}
                  onRemoveArticle={removeWorkstationArticle}
                />
              )}
            </div>
          )}

          {/* Drag-to-resize handle between the chart and the conversation */}
          {showChartPanel && !chartCollapsed && (
            <div
              onPointerDown={startResize}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              title="Drag to resize"
              style={{ touchAction: 'none' }}
              className={`flex-shrink-0 transition-colors ${
                isHorizontal ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
              } ${dragging ? 'bg-amber-500/60' : 'bg-surface-3 hover:bg-amber-500/40'}`}
            />
          )}

          {/* Conversation column */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          {loadingSession ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-dim rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-dim rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-dim rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          ) : messages.length === 1 && messages[0].id === 'welcome' ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 fade-in-up">
              <h2 className="font-display text-xl font-bold text-fg mb-1.5">Stakdx AI</h2>
              <p className="text-sm text-faint max-w-sm mb-4 leading-relaxed">
                Ask about scan results, your positions, or any setup you're watching.
              </p>
              {researchPending && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-600/90 dark:text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-5">
                  <ChartLineUp size={13} weight="duotone" />
                  Research mode — mention a ticker and I'll pin its chart
                </p>
              )}
              {mode === 'workstation' && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-600/90 dark:text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-5">
                  <SquaresFour size={13} weight="duotone" />
                  Workstation mode — add tickers to load charts side by side; I'll see what's loaded
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs text-muted glass rounded-xl px-3.5 py-3 hover:border-amber-500/40 hover:text-fg transition-all duration-200"
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
                    ? 'bg-surface-3 text-fg px-4 py-2.5 rounded-2xl rounded-br-sm shadow-lg'
                    : 'text-fg'
                }`}>
                  {msg.content === '' && isStreaming ? (
                    <span className="flex gap-1.5 items-center h-5">
                      <span className="w-1.5 h-1.5 bg-faint rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-faint rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-faint rounded-full animate-bounce [animation-delay:300ms]" />
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{renderContent(msg.content)}</span>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-surface-2 border border-border-strong flex items-center justify-center text-[11px] font-bold text-faint flex-shrink-0 mt-0.5">
                    U
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-t border-border" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3.5 py-2.5 focus-within:border-amber-500/40 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.08)] transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder={
                mode === 'workstation' ? 'Compare the loaded tickers, or ask anything…'
                : isResearch ? 'Ask about a stock — its chart pins above…'
                : 'Ask about setups, positions, or market conditions...'
              }
              rows={1}
              className="flex-1 bg-transparent text-fg text-sm placeholder-dim resize-none focus:outline-none leading-relaxed py-0"
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
          <p className="hidden sm:block text-[10px] text-dim mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
