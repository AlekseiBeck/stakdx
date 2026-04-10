import React, { useState, useEffect } from 'react';
import ModeSwitcher from './ModeSwitcher';
import { ScanMode } from '../types';

interface HeaderProps {
  lastScanTime: Date | null;
  isMockData: boolean;
  userEmail: string;
  onSignOut: () => Promise<void>;
  mode: ScanMode;
  onModeChange: (m: ScanMode) => void;
  buyingPower: string;
  onBuyingPowerChange: (v: string) => void;
  onScan: () => void;
  isScanning: boolean;
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

export default function Header({
  lastScanTime,
  isMockData,
  userEmail,
  onSignOut,
  mode,
  onModeChange,
  buyingPower,
  onBuyingPowerChange,
  onScan,
  isScanning,
}: HeaderProps) {
  const [time, setTime] = useState(new Date());
  const session = getMarketSession();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const sessionConfig = {
    open: { label: 'OPEN', color: 'text-emerald-400', dotColor: 'bg-emerald-400', border: 'border-emerald-800/60 bg-emerald-950/40' },
    pre: { label: 'PRE', color: 'text-amber-400', dotColor: 'bg-amber-400', border: 'border-amber-800/60 bg-amber-950/40' },
    after: { label: 'AH', color: 'text-blue-400', dotColor: 'bg-blue-400', border: 'border-blue-800/60 bg-blue-950/40' },
    closed: { label: 'CLOSED', color: 'text-gray-500', dotColor: 'bg-gray-600', border: 'border-gray-800/60 bg-gray-950/40' },
  };

  const cfg = sessionConfig[session];

  const etTime = time.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <header className="border-b border-[#16213a] bg-[#070b14]/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex items-center gap-3 lg:gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none">SwingAI</h1>
            <p className="text-[10px] text-gray-600 leading-none mt-0.5 hidden sm:block">AI Trading Terminal</p>
          </div>
        </div>

        {/* Mode Switcher — primary control, always visible */}
        <div className="flex-shrink-0">
          <ModeSwitcher mode={mode} onChange={onModeChange} />
        </div>

        {/* Buying Power — hidden on small mobile */}
        <div className="hidden sm:flex items-center flex-shrink-0">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 mono text-xs">$</span>
            <input
              type="text"
              value={buyingPower}
              onChange={(e) => onBuyingPowerChange(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="Buying power"
              className="w-32 bg-[#0d1424] border border-[#16213a] rounded-lg pl-6 pr-3 py-1.5 text-white mono text-xs focus:outline-none focus:border-blue-600 transition-colors placeholder-gray-700"
            />
          </div>
        </div>

        {/* Scan Button */}
        <button
          onClick={onScan}
          disabled={isScanning}
          className="btn-primary text-sm flex-shrink-0 py-2"
        >
          {isScanning ? (
            <>
              <svg className="w-3.5 h-3.5 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Scanning...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
              </svg>
              <span className="hidden sm:inline">Run Scan</span>
            </>
          )}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Market status + clock */}
        <div className="hidden md:flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold mono ${cfg.border} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${cfg.dotColor}`} />
            {cfg.label}
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold mono text-gray-300">{etTime}</div>
            <div className="text-[10px] text-gray-600">ET</div>
          </div>
        </div>

        {/* Last scan */}
        {lastScanTime && (
          <div className="hidden lg:block text-right border-l border-[#16213a] pl-3">
            <div className="text-[10px] text-gray-600">Last scan</div>
            <div className="text-xs text-gray-400 mono">
              {lastScanTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}

        {/* Mock data badge */}
        {isMockData && (
          <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-amber-950/50 border border-amber-800/40 text-amber-400 text-xs font-medium flex-shrink-0">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            Demo
          </span>
        )}

        {/* User menu */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#16213a]">
          <div className="hidden lg:block text-right">
            <div className="text-xs text-gray-500 truncate max-w-[120px]">{userEmail}</div>
          </div>
          <button
            onClick={onSignOut}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-all"
            title="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
