import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ScanButton from './components/ScanButton';
import RecommendationsTable from './components/RecommendationsTable';
import PositionsPanel from './components/PositionsPanel';
import NewsTicker from './components/NewsTicker';
import AddPositionModal from './components/AddPositionModal';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { useAuth } from './AuthContext';
import { TradeRecommendation, NewsItem, Position } from './types';
import { runScan, fetchNews, addPosition, fetchPositions } from './api';

type DirectionFilter = 'LONG' | 'SHORT' | 'CALL' | 'PUT';

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  // Handle password reset redirect
  const isResetPage = window.location.pathname === '/reset-password' ||
    window.location.hash.includes('type=recovery');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
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
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [scanError, setScanError] = useState('');
  const [addPositionPrefill, setAddPositionPrefill] = useState<TradeRecommendation | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [buyingPower, setBuyingPower] = useState<string>('');
  const [activeFilters, setActiveFilters] = useState<Set<DirectionFilter>>(
    new Set(['LONG', 'SHORT', 'CALL', 'PUT'])
  );

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

  const handleScan = async () => {
    setIsScanning(true);
    setScanError('');
    try {
      const bp = buyingPower ? parseFloat(buyingPower.replace(/,/g, '')) : undefined;
      const result = await runScan(bp);
      setRecommendations(result.recommendations);
      setPrices(result.prices ?? {});
      setLastScanTime(new Date());
      setIsMockData(result.mock);
    } catch {
      setScanError('Unable to reach the server. Make sure the backend is running on port 3001.');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleFilter = (f: DirectionFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) {
        if (next.size === 1) return prev; // keep at least one active
        next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  };

  const filteredRecs = recommendations.filter((r) => activeFilters.has(r.direction));

  const handleAddPosition = async (ticker: string, entryPrice: number, direction: 'long' | 'short') => {
    const newPos = await addPosition(ticker, entryPrice, direction);
    setPositions((prev) => [...prev, newPos]);
  };

  const handleOpenAddModal = (rec?: TradeRecommendation) => {
    setAddPositionPrefill(rec || null);
    setShowAddModal(true);
  };

  const handleCloseModal = () => { setShowAddModal(false); setAddPositionPrefill(null); };
  const handlePositionClosed = (id: string) => setPositions((prev) => prev.filter((p) => p.id !== id));

  const filterConfig: { key: DirectionFilter; label: string; activeClass: string }[] = [
    { key: 'LONG', label: 'LONG', activeClass: 'bg-emerald-900/50 border-emerald-600 text-emerald-400' },
    { key: 'SHORT', label: 'SHORT', activeClass: 'bg-red-900/50 border-red-600 text-red-400' },
    { key: 'CALL', label: 'CALL', activeClass: 'bg-blue-900/50 border-blue-600 text-blue-400' },
    { key: 'PUT', label: 'PUT', activeClass: 'bg-purple-900/50 border-purple-600 text-purple-400' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <Header lastScanTime={lastScanTime} isMockData={isMockData} userEmail={userEmail} onSignOut={signOut} />

      <main className="max-w-[1600px] mx-auto px-6 py-8 pb-20 space-y-8">
        {/* Toolbar: title + buying power + scan */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Trading Dashboard</h2>
            <p className="text-gray-500 text-sm mt-1">
              AI-powered swing trade analysis · 10 tickers · 1-3 day holds
            </p>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            {/* Buying Power Input */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Buying Power
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 mono text-sm">$</span>
                <input
                  type="text"
                  value={buyingPower}
                  onChange={(e) => setBuyingPower(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="10,000"
                  className="w-36 bg-[#0f1629] border border-[#1a2442] rounded-lg pl-7 pr-3 py-2.5 text-white mono text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-700"
                />
              </div>
            </div>
            <ScanButton onScan={handleScan} isScanning={isScanning} />
          </div>
        </div>

        {/* Errors / notices */}
        {scanError && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-xl text-sm text-red-400">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            {scanError}
          </div>
        )}

        {isMockData && recommendations.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-900/20 border border-amber-800/40 rounded-xl text-sm text-amber-300">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span><strong>Demo mode:</strong> API keys not configured — showing sample recommendations.</span>
          </div>
        )}

        {/* Main layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-4">
            {/* Results header + filters */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                Scan Results
                {recommendations.length > 0 && (
                  <span className="text-xs text-gray-500 font-normal">
                    — {filteredRecs.length} of {recommendations.length} shown
                  </span>
                )}
              </h3>

              {/* Direction filter toggles */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Filter:</span>
                {filterConfig.map(({ key, label, activeClass }) => (
                  <button
                    key={key}
                    onClick={() => toggleFilter(key)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                      activeFilters.has(key)
                        ? activeClass
                        : 'bg-transparent border-[#1a2442] text-gray-600 hover:text-gray-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <RecommendationsTable
              recommendations={filteredRecs}
              prices={prices}
              onAddPosition={(rec) => handleOpenAddModal(rec)}
            />
          </div>

          {/* Positions panel */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-200 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
              Positions
            </h3>
            <PositionsPanel
              positions={positions}
              onPositionClosed={handlePositionClosed}
              onAddClick={() => handleOpenAddModal()}
            />
          </div>
        </div>
      </main>

      <NewsTicker news={news} />

      {showAddModal && (
        <AddPositionModal
          prefill={addPositionPrefill}
          onClose={handleCloseModal}
          onAdd={handleAddPosition}
        />
      )}
    </div>
  );
}
