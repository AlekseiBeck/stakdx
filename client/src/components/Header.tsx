import React, { useState, useEffect } from 'react';
import { UserCircle, GearSix, SignOut } from '@phosphor-icons/react';

interface HeaderProps {
  isMockData: boolean;
  userEmail: string;
  onOpenAccount: () => void;
  onSignOut: () => Promise<void>;
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

const sessionConfig = {
  open:   { label: 'MARKET OPEN',   color: 'text-emerald-400', border: 'border-emerald-800/60 bg-emerald-950/40' },
  pre:    { label: 'PRE-MARKET',    color: 'text-amber-400',   border: 'border-amber-800/60 bg-amber-950/40'   },
  after:  { label: 'AFTER HOURS',   color: 'text-violet-400',  border: 'border-violet-800/60 bg-violet-950/40'  },
  closed: { label: 'MARKET CLOSED', color: 'text-gray-500',    border: 'border-gray-800/60 bg-gray-950/40'     },
};

function AccountMenu({
  userEmail,
  onOpenAccount,
  onSignOut,
}: {
  userEmail: string;
  onOpenAccount: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Account"
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#222225] text-gray-400 hover:text-white hover:border-[#333336] transition-all"
      >
        <UserCircle size={20} weight="duotone" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-[#141415] border border-[#222225] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-[#222225]">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Signed in as</div>
              <div className="text-xs text-gray-300 truncate mono">{userEmail}</div>
            </div>
            <button
              onClick={() => { setOpen(false); onOpenAccount(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-[#1a1a1c] hover:text-white transition-colors"
            >
              <GearSix size={16} weight="bold" />
              Account Settings
            </button>
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-400 hover:bg-red-950/30 hover:text-red-400 transition-colors border-t border-[#222225]"
            >
              <SignOut size={16} weight="bold" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Header({ isMockData, userEmail, onOpenAccount, onSignOut }: HeaderProps) {
  // Recompute the market session periodically so the badge stays accurate
  // without showing a live clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const cfg = sessionConfig[getMarketSession()];

  const marketBadge = (
    <div className={`flex items-center px-2.5 py-1 rounded-md border text-xs font-bold mono flex-shrink-0 ${cfg.border} ${cfg.color}`}>
      {cfg.label}
    </div>
  );

  const demoBadge = isMockData && (
    <span className="flex items-center px-2 py-1 rounded-md bg-amber-950/50 border border-amber-800/40 text-amber-400 text-xs font-medium flex-shrink-0">
      Demo
    </span>
  );

  return (
    <header className="border-b border-[#222225] bg-[#0c0c0d]/95 backdrop-blur-md sticky top-0 z-50 safe-top">
      {/* Desktop */}
      <div className="hidden lg:flex max-w-[1600px] mx-auto px-6 py-3 items-center gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <img src="/stakd-logo.png" className="h-6 w-auto rounded-md" alt="" />
          <span className="font-display text-base font-bold tracking-tight text-white">Stakdx</span>
        </div>
        <div className="flex-1" />
        {demoBadge}
        {marketBadge}
        <AccountMenu userEmail={userEmail} onOpenAccount={onOpenAccount} onSignOut={onSignOut} />
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <img src="/stakd-logo.png" className="h-5 w-auto rounded-md" alt="" />
          <span className="font-display text-sm font-bold tracking-tight text-white">Stakdx</span>
        </div>
        <div className="flex-1" />
        {demoBadge}
        {marketBadge}
        <AccountMenu userEmail={userEmail} onOpenAccount={onOpenAccount} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
