import React, { useState, useEffect } from 'react';

interface HeaderProps {
  lastScanTime: Date | null;
  isMockData: boolean;
  userEmail: string;
  onSignOut: () => Promise<void>;
}

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  // Market open: M-F, 9:30 AM - 4:00 PM ET
  return day >= 1 && day <= 5 && timeInMinutes >= 570 && timeInMinutes < 960;
}

function getMarketSession(): 'open' | 'pre' | 'after' | 'closed' {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const timeInMinutes = et.getHours() * 60 + et.getMinutes();
  if (day === 0 || day === 6) return 'closed';
  if (timeInMinutes >= 240 && timeInMinutes < 570) return 'pre';
  if (timeInMinutes >= 570 && timeInMinutes < 960) return 'open';
  if (timeInMinutes >= 960 && timeInMinutes < 1200) return 'after';
  return 'closed';
}

export default function Header({ lastScanTime, isMockData, userEmail, onSignOut }: HeaderProps) {
  const [time, setTime] = useState(new Date());
  const session = getMarketSession();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const sessionConfig = {
    open: { label: 'Market Open', color: 'text-emerald-400', dotColor: 'bg-emerald-400', border: 'border-emerald-700/50 bg-emerald-900/20' },
    pre: { label: 'Pre-Market', color: 'text-amber-400', dotColor: 'bg-amber-400', border: 'border-amber-700/50 bg-amber-900/20' },
    after: { label: 'After Hours', color: 'text-blue-400', dotColor: 'bg-blue-400', border: 'border-blue-700/50 bg-blue-900/20' },
    closed: { label: 'Market Closed', color: 'text-gray-400', dotColor: 'bg-gray-500', border: 'border-gray-700/50 bg-gray-900/20' },
  };

  const cfg = sessionConfig[session];

  const etTime = time.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="border-b border-[#1a2442] bg-[#0a0e1a]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight leading-none">SwingAI</h1>
            <p className="text-[11px] text-gray-500 leading-none mt-0.5">AI Trading Assistant</p>
          </div>
        </div>

        {/* Center — watchlist */}
        <div className="hidden lg:flex items-center gap-1 text-xs mono text-gray-500">
          {['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'SPY', 'QQQ', 'META', 'AMZN', 'GOOGL'].map((t) => (
            <span key={t} className="px-2 py-1 rounded bg-[#141d35] text-gray-400">{t}</span>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {isMockData && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-900/30 border border-amber-700/40 text-amber-400 text-xs font-medium">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Demo Mode
            </span>
          )}

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${cfg.border} ${cfg.color}`}>
            <span className={`w-2 h-2 rounded-full pulse-dot ${cfg.dotColor}`} />
            {cfg.label}
          </div>

          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold mono text-gray-300">{etTime}</div>
            <div className="text-[10px] text-gray-600">ET</div>
          </div>

          {lastScanTime && (
            <div className="hidden md:block text-right">
              <div className="text-[10px] text-gray-600">Last scan</div>
              <div className="text-xs text-gray-400 mono">
                {lastScanTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )}

          {/* User menu */}
          <div className="flex items-center gap-2 pl-3 border-l border-[#1a2442]">
            <div className="hidden sm:block text-right">
              <div className="text-xs text-gray-400 truncate max-w-[140px]">{userEmail}</div>
            </div>
            <button
              onClick={onSignOut}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-all"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
