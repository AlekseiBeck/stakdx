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
  brokerageConnected: boolean;
  onOpenConnectModal: () => void;
  onOpenPaperPanel: () => void;
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
  brokerageConnected,
  onOpenConnectModal,
  onOpenPaperPanel,
}: HeaderProps) {
  const [time, setTime] = useState(new Date());
  const session = getMarketSession();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const sessionConfig = {
    open:   { label: 'OPEN',   color: 'text-emerald-400', dotColor: 'bg-emerald-400', border: 'border-emerald-800/60 bg-emerald-950/40' },
    pre:    { label: 'PRE',    color: 'text-amber-400',   dotColor: 'bg-amber-400',   border: 'border-amber-800/60 bg-amber-950/40'   },
    after:  { label: 'AH',     color: 'text-violet-400',  dotColor: 'bg-violet-400',  border: 'border-violet-800/60 bg-violet-950/40'  },
    closed: { label: 'CLOSED', color: 'text-gray-500',    dotColor: 'bg-gray-600',    border: 'border-gray-800/60 bg-gray-950/40'     },
  };

  const cfg = sessionConfig[session];

  const etTime = time.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
  });

  const scanIcon = (size = 'w-4 h-4') => (
    <svg className={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
    </svg>
  );

  const spinIcon = (size = 'w-4 h-4') => (
    <svg className={`${size} spin-slow`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );

  return (
    <header className="border-b border-[#222225] bg-[#0c0c0d]/95 backdrop-blur-md sticky top-0 z-50 safe-top">

      {/* Desktop: single row (>=1024px) */}
      <div className="hidden lg:flex max-w-[1600px] mx-auto px-6 py-3 items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0 pr-2 border-r border-[#222225]">
          <img src="/icons/icon-192.png" className="h-6 w-auto rounded-md" alt="" />
          <span className="text-base font-bold tracking-tight text-white">Stakdx</span>
        </div>
        <div className="flex-shrink-0"><ModeSwitcher mode={mode} onChange={onModeChange} /></div>

        <div className="hidden sm:flex items-center flex-shrink-0">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 mono text-xs">$</span>
            <input
              type="text"
              value={buyingPower}
              onChange={(e) => onBuyingPowerChange(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="Buying power"
              className="w-32 bg-[#141415] border border-[#222225] rounded-lg pl-6 pr-3 py-1.5 text-white mono text-xs focus:outline-none focus:border-amber-500/60 transition-colors placeholder-gray-700"
            />
          </div>
        </div>

        <button onClick={onScan} disabled={isScanning} className="btn-primary text-sm flex-shrink-0 py-2">
          {isScanning ? <>{spinIcon('w-3.5 h-3.5')} Scanning...</> : <>{scanIcon('w-3.5 h-3.5')} Run Scan</>}
        </button>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold mono ${cfg.border} ${cfg.color} border-[#222225]`}>
            <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${cfg.dotColor}`} />
            {cfg.label}
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold mono text-gray-300">{etTime}</div>
            <div className="text-[10px] text-gray-600">ET</div>
          </div>
        </div>

        {lastScanTime && (
          <div className="hidden lg:block text-right border-l border-[#222225] pl-3">
            <div className="text-[10px] text-gray-600">Last scan</div>
            <div className="text-xs text-gray-400 mono">
              {lastScanTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}

        {isMockData && (
          <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-amber-950/50 border border-amber-800/40 text-amber-400 text-xs font-medium flex-shrink-0">
            Demo
          </span>
        )}

        {brokerageConnected ? (
          <button onClick={onOpenPaperPanel} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-800/50 bg-emerald-950/30 text-emerald-400 text-xs font-semibold hover:border-emerald-700 transition-all flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            Paper
          </button>
        ) : (
          <button onClick={onOpenConnectModal} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#222225] text-gray-500 text-xs font-semibold hover:border-[#333336] hover:text-gray-300 transition-all flex-shrink-0">
            Connect Broker
          </button>
        )}

        <div className="flex items-center gap-2 pl-2 border-l border-[#222225]">
          <div className="hidden lg:block text-right">
            <div className="text-xs text-gray-500 truncate max-w-[120px]">{userEmail}</div>
          </div>
          <button onClick={onSignOut} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-all" title="Sign out">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile: two rows (<1024px) */}
      <div className="lg:hidden">

        {/* Row 1: logo + mode switcher + market status + sign out */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <img src="/icons/icon-192.png" className="h-5 w-auto rounded-md" alt="" />
            <span className="text-sm font-bold tracking-tight text-white">Stakdx</span>
          </div>
          <div className="flex-1 min-w-0">
            <ModeSwitcher mode={mode} onChange={onModeChange} />
          </div>

          <div className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold mono flex-shrink-0 ${cfg.border} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${cfg.dotColor}`} />
            {cfg.label}
          </div>

          <button
            onClick={onSignOut}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#1e1e20] border border-[#2a2a2c] text-gray-400 hover:text-red-400 hover:bg-red-950/20 active:scale-95 transition-all flex-shrink-0"
            title="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>

        {/* Row 2: scan button + buying power + optional brokerage/demo */}
        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            onClick={onScan}
            disabled={isScanning}
            className="btn-primary text-sm flex-shrink-0 py-2 px-4 min-h-[40px]"
          >
            {isScanning
              ? <>{spinIcon('w-4 h-4')} Scanning…</>
              : <>{scanIcon('w-4 h-4')} Run Scan</>
            }
          </button>

          <div className="relative flex-1 min-w-0 max-w-[160px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 mono text-xs pointer-events-none">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={buyingPower}
              onChange={(e) => onBuyingPowerChange(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="Buying power"
              className="w-full bg-[#141415] border border-[#222225] rounded-lg pl-6 pr-2 py-2 text-white mono text-xs focus:outline-none focus:border-amber-500/60 transition-colors placeholder-gray-700 min-h-[40px]"
            />
          </div>

          {brokerageConnected && (
            <button onClick={onOpenPaperPanel} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 text-emerald-400 text-xs font-semibold min-h-[40px] flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
              Paper
            </button>
          )}

          {isMockData && (
            <span className="px-2 py-1 rounded-md bg-amber-950/50 border border-amber-800/40 text-amber-400 text-xs font-medium flex-shrink-0">Demo</span>
          )}
        </div>
      </div>
    </header>
  );
}
