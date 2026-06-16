import React, { useState, useEffect, useCallback } from 'react';
import { ChatCircleDots, RadioButton, Briefcase, Newspaper, CircleNotch, CaretLeft, CaretRight } from '@phosphor-icons/react';
import Header from './components/Header';
import ModeSwitcher from './components/ModeSwitcher';
import RecommendationsTable from './components/RecommendationsTable';
import PositionsPanel from './components/PositionsPanel';
import NewsPanel from './components/NewsPanel';
import ChatPanel from './components/ChatPanel';
import AddPositionModal from './components/AddPositionModal';
import AccountSettingsModal from './components/AccountSettingsModal';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { useAuth } from './AuthContext';
import { TradeRecommendation, NewsItem, Position, ScanMode, BrokerageStatus, AlpacaPosition } from './types';
import { scanStream, runScan, fetchNews, searchNewsArticles, addPosition, fetchPositions, getBrokerageStatus, getBrokeragePositions, fetchLivePrices, fetchChatContext, NewsAPIResult } from './api';

type SidePanel = 'scan' | 'positions' | 'news';

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  const isResetPage = window.location.pathname === '/reset-password' ||
    window.location.hash.includes('type=recovery');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <CircleNotch size={32} weight="bold" className="text-amber-500 spin-slow" />
      </div>
    );
  }

  if (isResetPage) return <ResetPasswordPage />;
  if (!user) return <AuthPage />;

  return <Dashboard signOut={signOut} userEmail={user.email ?? ''} />;
}

function Dashboard({ signOut, userEmail }: { signOut: () => Promise<void>; userEmail: string }) {
  // ── data ────────────────────────────────────────────────────────────────────
  const [recommendations, setRecommendations] = useState<TradeRecommendation[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsResults, setNewsResults] = useState<NewsItem[] | null>(null);
  const [newsQuery, setNewsQuery] = useState('');
  const [newsFocus, setNewsFocus] = useState('');
  const [isSearchingNews, setIsSearchingNews] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [paperPositions, setPaperPositions] = useState<AlpacaPosition[]>([]);
  const [brokerageStatus, setBrokerageStatus] = useState<BrokerageStatus>({ connected: false });
  const [candleSummaries, setCandleSummaries] = useState<Record<string, string>>({});
  const [tickerNews, setTickerNews] = useState<Record<string, string[]>>({});
  const [newsAPIArticles, setNewsAPIArticles] = useState<NewsAPIResult[]>([]);

  // ── scan ────────────────────────────────────────────────────────────────────
  const [isScanning, setIsScanning] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamPhase, setStreamPhase] = useState<'idle' | 'batch1' | 'batch2' | 'done'>('idle');
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [scanError, setScanError] = useState('');
  const [mode, setMode] = useState<ScanMode>('both');
  const [buyingPower, setBuyingPower] = useState('');

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [sidebarPanel, setSidebarPanel] = useState<SidePanel>('news');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | SidePanel>('chat');
  const [addPositionPrefill, setAddPositionPrefill] = useState<TradeRecommendation | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  // ── effects ─────────────────────────────────────────────────────────────────
  const loadNews = useCallback(async () => {
    try { const r = await fetchNews(); setNews(r.news); } catch {}
  }, []);

  const loadPositions = useCallback(async () => {
    try {
      const posData = await fetchPositions();
      setPositions(posData);
      const tickers = posData.map(p => p.ticker.toUpperCase());
      // Fetch live prices + candle context in parallel
      const [livePrices, ctx] = await Promise.all([
        tickers.length > 0 ? fetchLivePrices(tickers) : Promise.resolve({}),
        fetchChatContext(tickers),
      ]);
      if (tickers.length > 0) setPrices(prev => ({ ...prev, ...livePrices }));
      setCandleSummaries(ctx.candleSummaries);
      setTickerNews(ctx.tickerNews);
      setNewsAPIArticles(ctx.newsAPIArticles);
    } catch {}
  }, []);

  useEffect(() => {
    loadNews();
    loadPositions();
    const iv = setInterval(loadNews, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadNews, loadPositions]);

  const loadBrokerageData = useCallback(async () => {
    try {
      const status = await getBrokerageStatus();
      setBrokerageStatus(status);
      if (status.connected) {
        const { positions: p } = await getBrokeragePositions();
        setPaperPositions(p);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadBrokerageData();
    const iv = setInterval(() => { loadBrokerageData(); loadPositions(); }, 30 * 1000);
    return () => clearInterval(iv);
  }, [loadBrokerageData, loadPositions]);

  // ── handlers ────────────────────────────────────────────────────────────────
  const handleScan = async () => {
    setIsScanning(true);
    setIsStreaming(true);
    setStreamPhase('batch1');
    setScanError('');
    setRecommendations([]);
    setPrices({});
    setIsMockData(false);
    setSidebarPanel('scan');
    setMobileTab('scan');

    const bp = buyingPower ? parseFloat(buyingPower.replace(/,/g, '')) : undefined;
    const directions: string[] = [];
    if (mode === 'long') directions.push('LONG', 'CALL');
    if (mode === 'short') directions.push('SHORT', 'PUT');

    try {
      await scanStream(bp, mode, directions,
        (batchRecs) => {
          setRecommendations(prev => {
            const seen = new Set(prev.map(r => r.ticker));
            return [...prev, ...batchRecs.filter(r => !seen.has(r.ticker))]
              .sort((a, b) => b.confidence - a.confidence);
          });
          setStreamPhase('batch2');
          setLastScanTime(new Date());
        },
        (finalPrices) => {
          setPrices(finalPrices);
          setStreamPhase('done');
          setIsStreaming(false);
          setIsScanning(false);
        }
      );
    } catch {
      try {
        const result = await runScan(bp, directions, mode);
        setRecommendations(result.recommendations);
        setPrices(result.prices ?? {});
        setLastScanTime(new Date());
        setIsMockData(result.mock);
      } catch {
        setScanError('Unable to reach the server. Make sure the backend is running on port 3001.');
      } finally {
        setIsStreaming(false);
        setIsScanning(false);
        setStreamPhase('done');
      }
    }
  };

  const handleAddPosition = async (
    ticker: string, entryPrice: number, direction: 'long' | 'short',
    stopLoss?: number, target?: number
  ) => {
    const newPos = await addPosition(ticker, entryPrice, direction, stopLoss, target);
    setPositions(prev => [...prev, newPos]);
  };

  const handleOpenAddModal = (rec?: TradeRecommendation) => {
    setAddPositionPrefill(rec || null);
    setShowAddModal(true);
  };

  const handleCloseModal = () => { setShowAddModal(false); setAddPositionPrefill(null); };
  const handlePositionClosed = (id: string) => setPositions(prev => prev.filter(p => p.id !== id));

  const handleNewsSearch = useCallback(async (query: string) => {
    setNewsQuery(query);
    setIsSearchingNews(true);
    try {
      const r = await searchNewsArticles(query);
      setNewsResults(r.news);
      setNewsFocus(r.focus ?? '');
    } catch {
      setNewsResults([]);
      setNewsFocus('');
    } finally {
      setIsSearchingNews(false);
    }
  }, []);

  const handleClearNewsSearch = useCallback(() => {
    setNewsQuery('');
    setNewsResults(null);
    setNewsFocus('');
  }, []);

  const onTradeExecuted = (rec: TradeRecommendation, price: number) => {
    const stop = parseFloat(rec.stopLoss.replace(/[^0-9.]/g, '')) || undefined;
    const target = parseFloat(rec.target.replace(/[^0-9.]/g, '')) || undefined;
    const dir = rec.direction === 'LONG' || rec.direction === 'CALL' ? 'long' : 'short';
    handleAddPosition(rec.ticker, price, dir, stop, target);
    loadBrokerageData();
  };

  // ── panel content ────────────────────────────────────────────────────────────
  const scanContent = (
    <div className="space-y-3">
      {scanError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl text-sm text-red-700 dark:text-red-400">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {scanError}
        </div>
      )}
      {/* Scan controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <ModeSwitcher mode={mode} onChange={setMode} />
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim mono text-xs pointer-events-none">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={buyingPower}
            onChange={(e) => setBuyingPower(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="Buying power"
            className="w-32 bg-surface border border-border rounded-lg pl-6 pr-3 py-1.5 text-fg mono text-xs focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.1)] transition-all placeholder-dim"
          />
        </div>
        <button onClick={handleScan} disabled={isScanning} className="btn-primary text-sm py-2">
          {isScanning
            ? <><CircleNotch size={14} weight="bold" className="spin-slow" /> Scanning…</>
            : <><RadioButton size={14} weight="duotone" /> Run Scan</>}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-fg">
            Scan Results
            {recommendations.length > 0 && (
              <span className="text-xs font-normal text-faint ml-2">{recommendations.length} setups</span>
            )}
          </h2>
          <p className="text-[11px] text-dim mt-0.5">
            {mode === 'both' ? 'All directions' : mode === 'long' ? 'Long / Call bias' : 'Short / Put bias'} · 1–3 day holds
            {lastScanTime && <> · last scan {lastScanTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
        </div>
        {isMockData && recommendations.length > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 px-2.5 py-1 rounded-lg">Demo</span>
        )}
      </div>
      <RecommendationsTable
        recommendations={recommendations}
        prices={prices}
        onAddPosition={handleOpenAddModal}
        isStreaming={isStreaming}
        streamPhase={streamPhase}
        brokerageConnected={brokerageStatus.connected}
        onTradeExecuted={onTradeExecuted}
      />
    </div>
  );

  const positionsContent = (
    <PositionsPanel
      positions={positions}
      paperPositions={paperPositions}
      onPositionClosed={handlePositionClosed}
      onAddClick={() => handleOpenAddModal()}
    />
  );

  const newsContent = (
    <NewsPanel
      news={newsResults ?? news}
      onSearch={handleNewsSearch}
      onClear={handleClearNewsSearch}
      activeQuery={newsQuery}
      focus={newsFocus}
      isSearching={isSearchingNews}
    />
  );

  const panelContent = (panel: SidePanel) => {
    if (panel === 'scan') return scanContent;
    if (panel === 'positions') return positionsContent;
    return newsContent;
  };

  const pillBadge = (tab: SidePanel) => {
    if (tab === 'scan') return recommendations.length;
    if (tab === 'positions') return positions.length + paperPositions.length;
    return news.length;
  };

  return (
    <div className="h-full flex flex-col bg-bg overflow-hidden">
      <Header
        isMockData={isMockData}
        userEmail={userEmail}
        onSignOut={signOut}
        onOpenAccount={() => setShowAccount(true)}
      />

      {/* ── Desktop (≥1024px): chat left + sidebar right ─────────────────────── */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Chat — grows to fill whatever the right panel doesn't use */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-border">
          <ChatPanel positions={positions} scanResults={recommendations} news={news} prices={prices} candleSummaries={candleSummaries} tickerNews={tickerNews} newsAPIArticles={newsAPIArticles} />
        </div>

        {/* Right sidebar — collapsible, width-animated to mirror the chat-history collapse.
            The full panel stays mounted at a fixed width so it clips/slides instead of
            reflowing; the icon rail cross-fades in over the left edge when collapsed. */}
        <div className={`relative flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${sidebarCollapsed ? 'w-12' : 'w-1/3'}`}>
          {/* Full panel (fixed width ≈ open width, so it doesn't reflow mid-animation) */}
          <div
            className={`h-full flex flex-col overflow-hidden ${sidebarCollapsed ? 'pointer-events-none' : ''}`}
            style={{ width: '33.333vw' }}
          >
            {/* Pill tabs */}
            <div className="flex items-center gap-1.5 px-4 h-12 border-b border-border flex-shrink-0">
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Collapse panel"
                className="w-7 h-7 flex items-center justify-center rounded-md text-faint hover:text-fg hover:bg-surface-2 transition-colors flex-shrink-0"
              >
                <CaretRight size={16} weight="bold" />
              </button>
              {(['scan', 'positions', 'news'] as SidePanel[]).map((tab) => {
                const badge = pillBadge(tab);
                return (
                  <button
                    key={tab}
                    onClick={() => setSidebarPanel(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      sidebarPanel === tab
                        ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-black shadow-[0_2px_12px_-3px_rgba(245,158,11,0.6)]'
                        : 'bg-surface border border-border text-faint hover:text-muted hover:border-border-strong'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {badge > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 rounded-full ${
                        sidebarPanel === tab ? 'bg-black/20 text-black' : 'bg-surface-3 text-dim'
                      }`}>{badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-4">
              {panelContent(sidebarPanel)}
            </div>
          </div>

          {/* Collapsed icon rail — overlays the left edge, fades in/out with the width animation */}
          <div className={`absolute inset-y-0 left-0 w-12 flex flex-col items-center gap-1 bg-bg py-3 transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="Expand panel"
              className="w-8 h-8 flex items-center justify-center rounded-md text-faint hover:text-fg hover:bg-surface-2 transition-colors"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <div className="w-6 h-px bg-surface-3 my-1.5" />
            {([
              { id: 'scan' as SidePanel, Icon: RadioButton },
              { id: 'positions' as SidePanel, Icon: Briefcase },
              { id: 'news' as SidePanel, Icon: Newspaper },
            ]).map(({ id, Icon }) => {
              const badge = pillBadge(id);
              return (
                <button
                  key={id}
                  onClick={() => { setSidebarPanel(id); setSidebarCollapsed(false); }}
                  title={id.charAt(0).toUpperCase() + id.slice(1)}
                  className={`relative w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                    sidebarPanel === id ? 'text-amber-500 bg-amber-500/10' : 'text-faint hover:text-fg hover:bg-surface-2'
                  }`}
                >
                  <Icon size={18} weight={sidebarPanel === id ? 'duotone' : 'regular'} />
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center text-[8px] font-bold rounded-full bg-amber-500 text-black">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Mobile (<1024px): 4-tab bottom nav ──────────────────────────────── */}
      <div className="lg:hidden flex-1 flex flex-col overflow-hidden">
        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {mobileTab === 'chat' ? (
            <ChatPanel positions={positions} scanResults={recommendations} news={news} prices={prices} candleSummaries={candleSummaries} tickerNews={tickerNews} newsAPIArticles={newsAPIArticles} />
          ) : (
            <div className="h-full overflow-y-auto p-4">
              {panelContent(mobileTab)}
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div className="flex-shrink-0 border-t border-border bg-bg">
          <div className="flex">
          {([
            { id: 'chat', label: 'Chat', Icon: ChatCircleDots },
            { id: 'scan', label: 'Scan', Icon: RadioButton },
            { id: 'positions', label: 'Positions', Icon: Briefcase },
            { id: 'news', label: 'News', Icon: Newspaper },
          ] as { id: 'chat' | SidePanel; label: string; Icon: React.ComponentType<{ size?: number; weight?: any; className?: string }> }[]).map(({ id, label, Icon }) => {
            const active = mobileTab === id;
            const badge = id !== 'chat' ? pillBadge(id as SidePanel) : 0;
            return (
              <button
                key={id}
                onClick={() => setMobileTab(id)}
                className={`relative flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  active ? 'text-amber-500' : 'text-dim'
                }`}
              >
                {active && (
                  <span className="absolute top-0 w-8 h-0.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                )}
                <Icon size={20} weight={active ? 'duotone' : 'regular'} />
                <span className="text-[10px] font-semibold leading-none">{label}</span>
                {badge > 0 && (
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    active ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-surface-2 text-dim'
                  }`}>{badge}</span>
                )}
              </button>
            );
          })}
          </div>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddPositionModal
          prefill={addPositionPrefill}
          onClose={handleCloseModal}
          onAdd={handleAddPosition}
        />
      )}

      {showAccount && (
        <AccountSettingsModal
          userEmail={userEmail}
          brokerageConnected={brokerageStatus.connected}
          onClose={() => setShowAccount(false)}
          onBrokerageChanged={loadBrokerageData}
          onSignOut={signOut}
        />
      )}
    </div>
  );
}
