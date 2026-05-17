import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import RecommendationsTable from './components/RecommendationsTable';
import PositionsPanel from './components/PositionsPanel';
import NewsPanel from './components/NewsPanel';
import ChatPanel from './components/ChatPanel';
import AddPositionModal from './components/AddPositionModal';
import ConnectBrokerageModal from './components/ConnectBrokerageModal';
import PaperTradingPanel from './components/PaperTradingPanel';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { useAuth } from './AuthContext';
import { TradeRecommendation, NewsItem, Position, ScanMode, BrokerageStatus, AlpacaPosition } from './types';
import { scanStream, runScan, fetchNews, addPosition, fetchPositions, getBrokerageStatus, getBrokeragePositions, fetchLivePrices, fetchChatContext, NewsAPIResult } from './api';

type SidePanel = 'scan' | 'positions' | 'news';

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  const isResetPage = window.location.pathname === '/reset-password' ||
    window.location.hash.includes('type=recovery');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0c0c0d] flex items-center justify-center">
        <svg className="w-8 h-8 text-amber-500 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
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
  const [sidebarPanel, setSidebarPanel] = useState<SidePanel>('scan');
  const [mobileTab, setMobileTab] = useState<'chat' | SidePanel>('chat');
  const [addPositionPrefill, setAddPositionPrefill] = useState<TradeRecommendation | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showPaperPanel, setShowPaperPanel] = useState(false);

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
        <div className="flex items-center gap-3 px-4 py-3 bg-red-950/30 border border-red-900/40 rounded-xl text-sm text-red-400">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {scanError}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">
            Scan Results
            {recommendations.length > 0 && (
              <span className="text-xs font-normal text-gray-500 ml-2">{recommendations.length} setups</span>
            )}
          </h2>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {mode === 'both' ? 'All directions' : mode === 'long' ? 'Long / Call bias' : 'Short / Put bias'} · 1–3 day holds
          </p>
        </div>
        {isMockData && recommendations.length > 0 && (
          <span className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/40 px-2.5 py-1 rounded-lg">Demo</span>
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

  const panelContent = (panel: SidePanel) => {
    if (panel === 'scan') return scanContent;
    if (panel === 'positions') return positionsContent;
    return <NewsPanel news={news} />;
  };

  const pillBadge = (tab: SidePanel) => {
    if (tab === 'scan') return recommendations.length;
    if (tab === 'positions') return positions.length + paperPositions.length;
    return news.length;
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0c0d] overflow-hidden">
      <Header
        lastScanTime={lastScanTime}
        isMockData={isMockData}
        userEmail={userEmail}
        onSignOut={signOut}
        mode={mode}
        onModeChange={setMode}
        buyingPower={buyingPower}
        onBuyingPowerChange={setBuyingPower}
        onScan={handleScan}
        isScanning={isScanning}
        brokerageConnected={brokerageStatus.connected}
        onOpenConnectModal={() => setShowConnectModal(true)}
        onOpenPaperPanel={() => setShowPaperPanel(true)}
      />

      {/* ── Desktop (≥1024px): chat left + sidebar right ─────────────────────── */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Chat — 2/3 */}
        <div className="flex-[2] min-w-0 flex flex-col overflow-hidden border-r border-[#222225]">
          <ChatPanel positions={positions} scanResults={recommendations} news={news} prices={prices} candleSummaries={candleSummaries} tickerNews={tickerNews} newsAPIArticles={newsAPIArticles} />
        </div>

        {/* Right sidebar — 1/3 */}
        <div className="flex-[1] min-w-0 flex flex-col overflow-hidden">
          {/* Pill tabs */}
          <div className="flex items-center gap-1.5 px-4 h-12 border-b border-[#222225] flex-shrink-0">
            {(['scan', 'positions', 'news'] as SidePanel[]).map((tab) => {
              const badge = pillBadge(tab);
              return (
                <button
                  key={tab}
                  onClick={() => setSidebarPanel(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    sidebarPanel === tab
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#141415] border border-[#222225] text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {badge > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 rounded-full ${
                      sidebarPanel === tab ? 'bg-black/20 text-black' : 'bg-[#222225] text-gray-600'
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
        <div
          className="flex-shrink-0 flex items-stretch border-t border-[#222225] bg-[#0c0c0d]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {([
            { id: 'chat', label: 'Chat', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /> },
            { id: 'scan', label: 'Scan', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" /> },
            { id: 'positions', label: 'Positions', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /> },
            { id: 'news', label: 'News', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5" /> },
          ] as { id: 'chat' | SidePanel; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => {
            const active = mobileTab === id;
            const badge = id !== 'chat' ? pillBadge(id as SidePanel) : 0;
            return (
              <button
                key={id}
                onClick={() => setMobileTab(id)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  active ? 'text-amber-500' : 'text-gray-600'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  {icon}
                </svg>
                <span className="text-[10px] font-semibold leading-none">{label}</span>
                {badge > 0 && (
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    active ? 'bg-amber-500/20 text-amber-400' : 'bg-[#1e1e20] text-gray-600'
                  }`}>{badge}</span>
                )}
              </button>
            );
          })}
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

      <ConnectBrokerageModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnected={() => { setShowConnectModal(false); loadBrokerageData(); }}
      />

      {showPaperPanel && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0 pt-20 sm:pt-0"
          onClick={() => setShowPaperPanel(false)}
        >
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <PaperTradingPanel visible={showPaperPanel} onClose={() => setShowPaperPanel(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
