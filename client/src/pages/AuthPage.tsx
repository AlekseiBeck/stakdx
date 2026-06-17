import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  RadioButton, BellRinging, ChatCircleDots, LightningA, ArrowRight, ArrowLeft,
  EnvelopeSimple, WarningCircle, CheckCircle, CircleNotch, TrendUp,
} from '@phosphor-icons/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import ThemeToggle from '../components/ThemeToggle';

const ParticleWave = lazy(() => import('../components/landing/ParticleWave'));

type Mode = 'landing' | 'login' | 'signup' | 'forgot' | 'verify';

function StakdxLogo({ size = 'h-8' }: { size?: string }) {
  return <img src="/stakd-logo.png" className={`${size} w-auto rounded-lg`} alt="" />;
}

const FEATURES = [
  {
    icon: <RadioButton size={20} weight="duotone" />,
    title: 'Daily Market Scan',
    desc: 'AI screens the entire US market every morning and surfaces the highest-conviction swing setups — long, short, calls, and puts.',
  },
  {
    icon: <BellRinging size={20} weight="duotone" />,
    title: 'Stop / Target Alerts',
    desc: 'Track open positions and receive push notifications the moment price hits your stop loss or profit target.',
  },
  {
    icon: <ChatCircleDots size={20} weight="duotone" />,
    title: 'AI Trading Chat',
    desc: 'Ask anything — "should I hold NVDA through earnings?" The AI knows your positions, live prices, and the latest news.',
  },
  {
    icon: <LightningA size={20} weight="duotone" />,
    title: 'One-Click Paper Trading',
    desc: 'Connect your Alpaca account and execute AI setups in a sandbox with real market prices — zero risk.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Run the scan',
    desc: 'One click screens thousands of US-listed tickers and enriches the top candidates with news, sentiment, earnings, and volume data.',
  },
  {
    num: '02',
    title: 'Review ranked setups',
    desc: 'Every setup ships with an entry zone, stop loss, target, confidence score, and the AI’s full rationale.',
  },
  {
    num: '03',
    title: 'Track, alert, execute',
    desc: 'Track positions, get push alerts the moment price hits your levels, and paper trade through Alpaca.',
  },
];

const TICKERS: Array<[string, number]> = [
  ['NVDA', 2.4], ['TSLA', -1.8], ['AMD', 3.1], ['META', 0.9], ['AAPL', -0.4],
  ['MSFT', 1.2], ['AMZN', 0.7], ['GOOGL', -1.1], ['PLTR', 4.6], ['COIN', -2.3],
  ['AVGO', 1.8], ['NFLX', 0.5], ['SMCI', 5.2], ['MU', 2.9], ['CRM', -0.8], ['UBER', 1.4],
];

function TickerItem({ sym, pct }: { sym: string; pct: number }) {
  const up = pct >= 0;
  return (
    <span className="flex items-center gap-1.5 px-5 mono text-xs">
      <span className="font-bold text-muted">{sym}</span>
      <span className={up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
        {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
    </span>
  );
}

function MiniRing({ value, color = '#10b981', textClass = 'text-emerald-700 dark:text-emerald-400' }: { value: number; color?: string; textClass?: string }) {
  const C = 2 * Math.PI * 14;
  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3.5" className="stroke-border" />
        <circle
          cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${(value / 100) * C} ${C}`} strokeLinecap="round"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center mono text-[11px] font-bold ${textClass}`}>{value}</span>
    </div>
  );
}

/* Static product mockup for the hero — mirrors the dashboard's card language */
function HeroPreview() {
  return (
    <div className="relative isolate mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-10 bg-amber-500/[0.08] blur-3xl rounded-full pointer-events-none" />

      {/* TSLA short card — tucked behind. Explicit z-index (not z-auto) so the
          glass backdrop-filter layers keep a stable order during the GSAP
          entrance and don't briefly render in front of the NVDA card. */}
      <div className="hero-card absolute z-0 -top-12 -right-2 sm:-right-10 w-60 hidden sm:block">
        <div className="float-b glass rounded-xl p-3.5 rotate-2 opacity-90 shadow-card">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="mono text-sm font-bold text-fg">TSLA</span>
              <span className="badge-short text-[10px] px-2 py-0">SHORT</span>
            </div>
            <span className="mono text-xs font-bold text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-900/20 rounded px-1.5 py-0.5">72</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] mono text-faint">
            <span>Entry $238.40</span>
            <span className="text-red-700 dark:text-red-400">Stop $246.10</span>
            <span className="text-emerald-700 dark:text-emerald-400">Tgt $221.00</span>
          </div>
        </div>
      </div>

      {/* NVDA long card — front and center */}
      <div className="hero-card relative z-10">
        <div className="float-a glass rounded-2xl p-5 shadow-pop">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="mono text-2xl font-bold text-fg tracking-tight">NVDA</span>
              <span className="badge-long">
                <TrendUp size={10} weight="bold" />
                LONG
              </span>
              <span className="mono text-sm text-muted">$172.40</span>
            </div>
            <MiniRing value={86} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3.5">
            <div className="bg-bg/80 rounded-lg px-3 py-2">
              <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-0.5">Entry</div>
              <div className="mono text-sm font-bold text-fg">$171.80</div>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              <div className="text-[10px] text-red-700 uppercase tracking-wider font-semibold mb-0.5">Stop</div>
              <div className="mono text-sm font-bold text-red-700 dark:text-red-400">$166.90</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">
              <div className="text-[10px] text-emerald-700 uppercase tracking-wider font-semibold mb-0.5">Target</div>
              <div className="mono text-sm font-bold text-emerald-700 dark:text-emerald-400">$183.50</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted bg-surface-2/80 px-2 py-0.5 rounded border border-border-strong">Bull flag breakout</span>
            <span className="text-xs text-dim">1–3 days</span>
            <span className="text-xs mono font-semibold text-amber-600 dark:text-amber-400">2.3:1 R/R</span>
          </div>
        </div>
      </div>

      {/* Chat snippet — overlapping below */}
      <div className="hero-card relative z-20 -mt-3 ml-8 sm:ml-16 max-w-sm">
        <div className="float-b glass rounded-xl p-4 space-y-3 shadow-pop">
          <div className="flex justify-end">
            <span className="bg-surface-3 text-fg text-xs px-3 py-1.5 rounded-2xl rounded-br-sm">
              Should I hold NVDA through earnings?
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-[9px] font-bold text-black flex-shrink-0 mt-0.5">S</span>
            <p className="text-xs text-muted leading-relaxed">
              Earnings hit in 6 days and IV is elevated — consider trimming half into strength and holding the rest against the <span className="mono text-red-700 dark:text-red-400">$166.90</span> stop.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const landingRef = useRef<HTMLDivElement>(null);

  const reset = (m: Mode) => { setMode(m); setError(''); setMessage(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage(''); setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Supabase returns a user object even for existing emails, but identities is empty
        if (!data.user || data.user.identities?.length === 0) {
          throw new Error('This email is already registered. Sign in instead.');
        }
        setMode('verify');
        setPassword('');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage('Password reset email sent — check your inbox.');
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // GSAP entrance + scroll animations for the landing page
  useEffect(() => {
    if (mode !== 'landing' || !landingRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.from('.hero-reveal', { y: 28, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.1, delay: 0.1 });
      // The hero cards overlap and are translucent glass, so opacity must fade
      // them in *together* (no stagger). A staggered opacity fade gives the cards
      // unequal opacity mid-entrance, and the more-opaque card visually dominates
      // the overlap — reading as a wrong stacking order that "snaps" right once
      // opacities equalize. Keep the rise/scale staggered for the cascade; fade
      // uniformly so the painted order (TSLA behind, chat in front) reads correctly.
      gsap.from('.hero-card', { y: 36, scale: 0.97, duration: 0.9, ease: 'power3.out', stagger: 0.15, delay: 0.45 });
      gsap.from('.hero-card', { opacity: 0, duration: 0.7, ease: 'power2.out', delay: 0.45 });
      gsap.to('.float-a', { y: -10, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.4 });
      gsap.to('.float-b', { y: -7, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.8 });

      gsap.utils.toArray<HTMLElement>('.scroll-reveal').forEach((el, i) => {
        gsap.from(el, {
          y: 28, opacity: 0, duration: 0.7, ease: 'power3.out', delay: (i % 4) * 0.08,
          scrollTrigger: { trigger: el, scroller: landingRef.current, start: 'top 92%', once: true },
        });
      });
    }, landingRef);

    return () => ctx.revert();
  }, [mode]);

  if (mode === 'landing') {
    return (
      <div ref={landingRef} className="relative h-full overflow-y-auto bg-bg noise-overlay">
        {/* Animated background — fixed behind everything */}
        <div className="fixed inset-0 pointer-events-none">
          <Suspense fallback={null}>
            <ParticleWave theme={theme} />
          </Suspense>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(var(--bg)/0.5)_65%,rgb(var(--bg)/0.92)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
        </div>

        {/* Nav */}
        <nav className="sticky top-0 z-30 glass border-x-0 border-t-0 safe-top">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-2">
              <StakdxLogo size="h-6" />
              <span className="font-display text-lg font-bold tracking-tight text-fg">Stakdx</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ThemeToggle className="w-8 h-8" />
              <button
                onClick={() => reset('login')}
                className="text-sm text-muted hover:text-fg transition-colors px-4 py-1.5 rounded-lg border border-border-strong hover:border-border-strong"
              >
                Sign In
              </button>
              <button onClick={() => reset('signup')} className="btn-primary text-sm px-4 py-1.5 hidden sm:inline-flex">
                Get Started
              </button>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="relative z-10 max-w-6xl mx-auto px-6 pt-14 sm:pt-20 pb-16 lg:pb-24 grid lg:grid-cols-2 gap-14 lg:gap-10 items-center min-h-[82vh]">
          <div className="text-center lg:text-left">
            <h1 className="hero-reveal font-display text-5xl sm:text-6xl font-bold text-fg tracking-tight leading-[1.05] mb-5 mt-2">
              Trade with<br />an <span className="text-gradient-amber">edge.</span>
            </h1>
            <p className="hero-reveal text-muted text-lg max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed">
              Daily AI setups, real-time stop & target alerts, and a market-aware AI you can actually talk to.
            </p>
            <div className="hero-reveal flex items-center justify-center lg:justify-start gap-3 mb-5">
              <button onClick={() => reset('signup')} className="btn-primary text-sm sm:text-base px-5 sm:px-7 py-3 whitespace-nowrap">
                Get Started Free
              </button>
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-ghost text-sm sm:text-base px-4 sm:px-5 py-3 whitespace-nowrap"
              >
                See how it works
              </button>
            </div>
            <p className="hero-reveal text-xs text-dim mb-8">No credit card required</p>
            <div className="hero-reveal flex items-center justify-center lg:justify-start gap-5 text-xs text-faint">
              <span><span className="mono font-bold text-muted">4,000+</span> tickers scanned</span>
              <span className="w-px h-3 bg-border-strong" />
              <span><span className="mono font-bold text-muted">30</span> setups ranked</span>
              <span className="w-px h-3 bg-border-strong" />
              <span><span className="mono font-bold text-muted">7+</span> data sources</span>
            </div>
          </div>

          <div className="pt-10 lg:pt-0">
            <HeroPreview />
          </div>
        </section>

        {/* Ticker marquee */}
        <div className="relative z-10 border-y border-border bg-bg/70 backdrop-blur-sm py-2.5 overflow-hidden" aria-hidden="true">
          <div className="marquee-track">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex">
                {TICKERS.map(([sym, pct]) => <TickerItem key={`${dup}-${sym}`} sym={sym} pct={pct} />)}
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
          <div className="scroll-reveal text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-fg tracking-tight mb-3">
              Everything you need to <span className="text-gradient-amber">swing trade</span>
            </h2>
            <p className="text-faint max-w-lg mx-auto">One dashboard for scanning, tracking, alerting, and executing — powered by AI-driven decision-making.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="scroll-reveal group glass shadow-card rounded-2xl p-6 transition-all duration-300 hover:border-amber-500/30 hover:-translate-y-1"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-4 transition-all duration-300 group-hover:bg-amber-500/20 group-hover:shadow-[0_0_20px_-4px_rgba(245,158,11,0.5)]">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-fg mb-2">{f.title}</h3>
                <p className="text-xs text-faint leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="relative z-10 max-w-5xl mx-auto px-6 py-16">
          <div className="scroll-reveal text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-fg tracking-tight">How it works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((s, i) => (
              <div key={s.num} className="scroll-reveal relative glass shadow-card rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="mono text-sm font-bold text-gradient-amber">{s.num}</span>
                  <span className="flex-1 h-px bg-gradient-to-r from-amber-500/30 to-transparent" />
                </div>
                <h3 className="text-base font-semibold text-fg mb-2">{s.title}</h3>
                <p className="text-sm text-faint leading-relaxed">{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight size={16} className="hidden md:block absolute top-1/2 -right-4 text-dim z-10" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative z-10 max-w-4xl mx-auto px-6 py-20">
          <div className="scroll-reveal relative glass shadow-card rounded-3xl px-8 py-14 text-center overflow-hidden">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[260px] bg-amber-500/15 blur-[90px] rounded-full pointer-events-none" />
            <div className="relative">
              <div className="flex justify-center mb-5"><StakdxLogo size="h-12" /></div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-fg tracking-tight mb-3">
                Start trading <span className="text-gradient-amber">smarter</span>
              </h2>
              <p className="text-faint mb-8 max-w-md mx-auto">Join Stakdx and let the AI do the screening while you make the calls.</p>
              <button onClick={() => reset('signup')} className="btn-primary text-base px-8 py-3">
                Get Started Free
              </button>
            </div>
          </div>
        </section>

        <footer className="relative z-10 border-t border-border py-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2 opacity-60">
            <StakdxLogo size="h-4" />
            <span className="font-display text-sm font-bold text-muted">Stakdx</span>
          </div>
          <p className="text-xs text-dim">For informational purposes only. Not financial advice.</p>
        </footer>
      </div>
    );
  }

  if (mode === 'verify') {
    return (
      <div className="h-full overflow-y-auto bg-bg noise-overlay flex items-center justify-center p-4">
        <div className="fixed inset-0 grid-overlay bg-[size:48px_48px] pointer-events-none" />
        <div className="fixed -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[320px] bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
        <ThemeToggle className="fixed top-4 right-4 z-20 w-9 h-9 safe-top" />
        <div className="relative w-full max-w-sm text-center fade-in-up">
          <div className="flex items-center justify-center gap-2 mb-8">
            <StakdxLogo size="h-8" />
            <h1 className="font-display text-2xl font-bold text-fg">Stakdx</h1>
          </div>
          <div className="rounded-2xl p-px bg-gradient-to-b from-border-strong to-surface-2">
            <div className="bg-surface rounded-[15px] p-8">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_-6px_rgba(245,158,11,0.4)]">
                <EnvelopeSimple size={28} weight="duotone" className="text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold text-fg mb-2">Check your email</h2>
              <p className="text-sm text-muted leading-relaxed mb-1">
                We sent a confirmation link to
              </p>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-5">{email}</p>
              <p className="text-xs text-dim leading-relaxed mb-6">
                Click the link in that email to activate your account, then come back here to sign in.
              </p>
              <button
                onClick={() => reset('login')}
                className="btn-primary w-full justify-center"
              >
                Go to Sign In
              </button>
            </div>
          </div>
          <p className="text-center text-xs text-dim mt-4">
            <button onClick={() => reset('landing')} className="hover:text-faint transition-colors">← Back to home</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-bg noise-overlay flex items-center justify-center p-4">
      <div className="fixed inset-0 grid-overlay bg-[size:48px_48px] pointer-events-none" />
      <div className="fixed -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[320px] bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
      <ThemeToggle className="fixed top-4 right-4 z-20 w-9 h-9 safe-top" />
      <div className="relative w-full max-w-sm fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <StakdxLogo size="h-8" />
            <h1 className="font-display text-2xl font-bold text-fg">Stakdx</h1>
          </div>
          <p className="text-dim text-sm mt-1">
            {mode === 'forgot' ? 'Reset your password' : mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        <div className="rounded-2xl p-px bg-gradient-to-b from-border-strong to-surface-2">
          <div className="bg-surface rounded-[15px] p-6">
          {/* Tabs */}
          {mode !== 'forgot' && (
            <div className="flex rounded-lg bg-bg p-1 mb-6">
              <button type="button" onClick={() => reset('login')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'login' ? 'bg-surface-2 text-fg shadow-sm' : 'text-dim hover:text-muted'}`}>
                Sign In
              </button>
              <button type="button" onClick={() => reset('signup')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-surface-2 text-fg shadow-sm' : 'text-dim hover:text-muted'}`}>
                Create Account
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="mb-5">
              <button onClick={() => reset('login')} className="flex items-center gap-1.5 text-faint hover:text-muted text-sm transition-colors">
                <ArrowLeft size={16} weight="bold" />
                Back to sign in
              </button>
              <p className="text-faint text-sm mt-4">Enter your email and we'll send a reset link.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required
                className="input-dark" />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                  className="input-dark" />
              </div>
            )}

            {mode === 'login' && (
              <div className="text-right -mt-1">
                <button type="button" onClick={() => reset('forgot')}
                  className="text-xs text-dim hover:text-amber-500 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2">
                <WarningCircle size={16} weight="fill" className="flex-shrink-0" />
                {error}
              </div>
            )}

            {message && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-3 py-2">
                <CheckCircle size={16} weight="fill" className="flex-shrink-0" />
                {message}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
              {loading ? (
                <><CircleNotch size={16} weight="bold" className="spin-slow" />Processing...</>
              ) : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>
          </div>
        </div>

        <p className="text-center text-xs text-dim mt-4">
          For informational purposes only. Not financial advice.
        </p>
        <p className="text-center text-xs text-dim mt-1">
          <button onClick={() => reset('landing')} className="hover:text-faint transition-colors">← Back to home</button>
        </p>
      </div>
    </div>
  );
}
