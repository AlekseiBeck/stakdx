import React, { useState, useEffect } from 'react';
import { UserCircle, GearSix, SignOut } from '@phosphor-icons/react';
import ThemeToggle from './ThemeToggle';

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
  open:   { label: 'MARKET OPEN',   color: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40' },
  pre:    { label: 'PRE-MARKET',    color: 'text-amber-600 dark:text-amber-400',   border: 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40'   },
  after:  { label: 'AFTER HOURS',   color: 'text-violet-700 dark:text-violet-400',  border: 'border-violet-200 dark:border-violet-800/60 bg-violet-50 dark:bg-violet-950/40'  },
  closed: { label: 'MARKET CLOSED', color: 'text-faint',    border: 'border-border-strong bg-surface-2'     },
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
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted hover:text-fg hover:border-border-strong transition-all"
      >
        <UserCircle size={20} weight="duotone" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl shadow-pop z-50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <div className="text-[10px] text-dim uppercase tracking-wider font-semibold">Signed in as</div>
              <div className="text-xs text-muted truncate mono">{userEmail}</div>
            </div>
            <button
              onClick={() => { setOpen(false); onOpenAccount(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg transition-colors"
            >
              <GearSix size={16} weight="bold" />
              Account Settings
            </button>
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-400 transition-colors border-t border-border"
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
    <span className="flex items-center px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/40 text-amber-600 dark:text-amber-400 text-xs font-medium flex-shrink-0">
      Demo
    </span>
  );

  return (
    <header className="border-b border-border bg-bg/95 backdrop-blur-md sticky top-0 z-50 safe-top">
      {/* Desktop */}
      <div className="hidden lg:flex max-w-[1600px] mx-auto px-6 py-3 items-center gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <img src="/stakd-logo.png" className="h-6 w-auto rounded-md" alt="" />
          <span className="font-display text-base font-bold tracking-tight text-fg">Stakdx</span>
        </div>
        <div className="flex-1" />
        {demoBadge}
        {marketBadge}
        <ThemeToggle />
        <AccountMenu userEmail={userEmail} onOpenAccount={onOpenAccount} onSignOut={onSignOut} />
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <img src="/stakd-logo.png" className="h-5 w-auto rounded-md" alt="" />
          <span className="font-display text-sm font-bold tracking-tight text-fg">Stakdx</span>
        </div>
        <div className="flex-1" />
        {demoBadge}
        {marketBadge}
        <ThemeToggle className="w-9 h-9" />
        <AccountMenu userEmail={userEmail} onOpenAccount={onOpenAccount} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
