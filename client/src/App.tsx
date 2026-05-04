import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import RecommendationsTable from './components/RecommendationsTable';
import PositionsPanel from './components/PositionsPanel';
import NewsPanel from './components/NewsPanel';
import AddPositionModal from './components/AddPositionModal';
import ConnectBrokerageModal from './components/ConnectBrokerageModal';
import PaperTradingPanel from './components/PaperTradingPanel';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { useAuth } from './AuthContext';
import { TradeRecommendation, NewsItem, Position, ScanMode, BrokerageStatus, AlpacaPosition } from './types';
import { scanStream, runScan, fetchNews, addPosition, fetchPositions, getBrokerageStatus, getBrokeragePositions } from './api';
import { SP500_TICKERS } from './constants';

type MobileTab = 'scan' | 'positions' | 'news';

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  const isResetPage = window.location.pathname === '/reset-password' ||
    window.location.hash.includes('type=recovery');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <svg className="w-8 h-8 text-blue-500 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
  const [recommendations, setRecommendations] = useState<TradeRecommendation[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamPhase, setStreamPhase] = useState<'idle' | 'batch1' | 'batch2' | 'done'>('idle');
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [scanError, setScanError] = useState('');
  const [addPositionPrefill, setAddPositionPrefill] = useState<TradeRecommendation | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [buyingPower, setBuyingPower] = useState<string>('');
  const [mode, setMode] = useState<ScanMode>('both');
  const [mobileTab, setMobileTab] = useState<MobileTab>('scan');
  const [brokerageStatus, setBrokerageStatus] = useState<BrokerageStatus>({ connected: false });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showPaperPanel, setShowPaperPanel] = useState(false);
  const [paperPositions, setPaperPositions] = useState<AlpacaPosition[]>([]);

  const loadNews = useCallback(async () => {
    try {
      const result = await fetchNews();
      setNews(result.news);
    } catch {}
  }, []);

  const loadPositions = useCallback(async () => {
    try {
      const posData = await fetchPositions();
      setPositions(posData);
    } catch {}
  }, []);

  useEffect(() => {
    loadNews();
    loadPositions();
    const interval = setInterval(loadNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNews, loadPositions]);

  const loadBrokerageData = useCallback(async () => {
    try {
      const status = await getBrokerageStatus();
      setBrokerageStatus(status);
      if (status.connected) {
        const { positions } = await getBrokeragePositions();
        setPaperPositions(positions);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadBrokerageData();
    const interval = setInterval(loadBrokerageData, 30 * 1000);
    return () => clearInterval(interval);
  }, [loadBrokerageData]);

  const handleScan = async () => {
    setIsScanning(true);
    setIsStreaming(true);
    setStreamPhase('batch1');
    setScanError('');
    setRecommendations([]);
    setPrices({});
    setIsMockData(false);

    const bp = buyingPower ? parseFloat(buyingPower.replace(/,/g, '')) : undefined;

    // Build focus directions from mode
    const directions: string[] = [];
    if (mode === 'long') directions.push('LONG', 'CALL');
    if (mode === 'short') directions.push('SHORT', 'PUT');

    try {
      await scanStream(
        bp,
        mode,
        directions,
        (batchRecs) => {
          setRecommendations((prev) => {
            // Merge, deduplicate by ticker
            const seen = new Set(prev.map(r => r.ticker));
            const newRecs = batchRecs.filter(r => !seen.has(r.ticker));
            return [...prev, ...newRecs].sort((a, b) => b.confidence - a.confidence);
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
    } catch (streamErr) {
      // Fallback to regular scan if SSE fails
      console.warn('SSE scan failed, falling back to regular scan:', streamErr);
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

  const handleAddPosition = async (ticker: string, entryPrice: number, direction: 'long' | 'short', stopLoss?: number, target?: number) => {
    const newPos = await addPosition(ticker, entryPrice, direction, stopLoss, target);
    setPositions((prev) => [...prev, newPos]);
  };

  const handleOpenAddModal = (rec?: TradeRecommendation) => {
    setAddPositionPrefill(rec || null);
    setShowAddModal(true);
  };

  const handleCloseModal = () => { setShowAddModal(false); setAddPositionPrefill(null); };
  const handlePositionClosed = (id: string) => setPositions((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="min-h-screen bg-[#070b14]">
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

      {/* Error banner */}
      {scanError && (
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 pt-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-red-950/30 border border-red-900/40 rounded-xl text-sm text-red-400">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            {scanError}
          </div>
        </div>
      )}

      {/* Desktop layout (≥1024px): two-column */}
      <main className="hidden lg:block max-w-[1600px] mx-auto px-6 py-6">
        <div className="grid grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-6 items-start">
          {/* Left: scan results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Scan Results
                  {recommendations.length > 0 && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      {recommendations.length} setups
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  AI-powered swing analysis · {mode === 'both' ? 'All directions' : mode === 'long' ? 'Long / Call bias' : 'Short / Put bias'} · 1-3 day holds
                </p>
              </div>

              {isMockData && recommendations.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/30 border border-amber-900/40 px-2.5 py-1.5 rounded-lg">
                  Demo data
                </span>
              )}
            </div>

            <RecommendationsTable
              recommendations={recommendations}
              prices={prices}
              onAddPosition={(rec) => handleOpenAddModal(rec)}
              isStreaming={isStreaming}
              streamPhase={streamPhase}
              brokerageConnected={brokerageStatus.connected}
              onTradeExecuted={(rec, price) => {
              const stop = parseFloat(rec.stopLoss.replace(/[^0-9.]/g, '')) || undefined;
              const target = parseFloat(rec.target.replace(/[^0-9.]/g, '')) || undefined;
              const dir = rec.direction === 'LONG' || rec.direction === 'CALL' ? 'long' : 'short';
              handleAddPosition(rec.ticker, price, dir, stop, target);
              loadBrokerageData();
              if (showPaperPanel) { setShowPaperPanel(false); setTimeout(() => setShowPaperPanel(true), 50); }
            }}
            />
          </div>

          {/* Right: positions stacked above news */}
          <div className="space-y-4 sticky top-20">
            <PositionsPanel
              positions={positions}
              paperPositions={paperPositions}
              onPositionClosed={handlePositionClosed}
              onAddClick={() => handleOpenAddModal()}
            />
            <NewsPanel news={news} />
          </div>
        </div>
      </main>

      {/* Mobile layout (<1024px): tab navigation */}
      <div className="lg:hidden">
        <main className="pb-20 px-4 pt-4">
          {mobileTab === 'scan' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">
                  Scan Results
                  {recommendations.length > 0 && (
                    <span className="text-xs font-normal text-gray-500 ml-2">{recommendations.length}</span>
                  )}
                </h2>
                {/* Mobile buying power input */}
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 mono text-xs">$</span>
                  <input
                    type="text"
                    value={buyingPower}
                    onChange={(e) => setBuyingPower(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="BP"
                    className="w-24 bg-[#0d1424] border border-[#16213a] rounded-lg pl-5 pr-2 py-1.5 text-white mono text-xs focus:outline-none focus:border-blue-600 placeholder-gray-700"
                  />
                </div>
              </div>
              <RecommendationsTable
                recommendations={recommendations}
                prices={prices}
                onAddPosition={(rec) => handleOpenAddModal(rec)}
                isStreaming={isStreaming}
                streamPhase={streamPhase}
                brokerageConnected={brokerageStatus.connected}
                onTradeExecuted={(rec, price) => {
                  const stop = parseFloat(rec.stopLoss.replace(/[^0-9.]/g, '')) || undefined;
                  const target = parseFloat(rec.target.replace(/[^0-9.]/g, '')) || undefined;
                  const dir = rec.direction === 'LONG' || rec.direction === 'CALL' ? 'long' : 'short';
                  handleAddPosition(rec.ticker, price, dir, stop, target);
                  loadBrokerageData();
                }}
              />
            </div>
          )}

          {mobileTab === 'positions' && (
            <PositionsPanel
              positions={positions}
              paperPositions={paperPositions}
              onPositionClosed={handlePositionClosed}
              onAddClick={() => handleOpenAddModal()}
            />
          )}

          {mobileTab === 'news' && <NewsPanel news={news} />}
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0d1424] border-t border-[#16213a] flex items-stretch z-50 safe-bottom">
          {([
            { key: 'scan' as MobileTab, label: 'Scan', icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
              </svg>
            )},
            { key: 'positions' as MobileTab, label: 'Positions', icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25" />
              </svg>
            )},
            { key: 'news' as MobileTab, label: 'News', icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25" />
              </svg>
            )},
          ]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => { setMobileTab(key); setShowPaperPanel(false); }}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                mobileTab === key ? 'text-blue-400' : 'text-gray-600'
              }`}
            >
              {icon}
              {label}
              {key === 'positions' && positions.length > 0 && (
                <span className="absolute top-2 right-1/2 translate-x-3 bg-blue-600 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                  {positions.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

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
        onConnected={() => {
          setShowConnectModal(false);
          loadBrokerageData();
        }}
      />

      {showPaperPanel && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-20 sm:pb-0 pt-20 sm:pt-0" onClick={() => setShowPaperPanel(false)}>
          <div className="w-full max-w-xl max-h-[75vh] sm:max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <PaperTradingPanel
              visible={showPaperPanel}
              onClose={() => setShowPaperPanel(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
