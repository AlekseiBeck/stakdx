import React, { useState } from 'react';
import { supabase } from '../supabase';

type Mode = 'landing' | 'login' | 'signup' | 'forgot' | 'verify';

function StakdxLogo({ size = 'h-8' }: { size?: string }) {
  return <img src="/stakd-logo.png" className={`${size} w-auto rounded-lg`} alt="" />;
}

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
      </svg>
    ),
    title: 'Daily Market Scan',
    desc: 'AI screens 240+ tickers every morning and surfaces the highest-conviction swing setups — long, short, calls, and puts.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.235 2.235 0 00-.1.661z" />
      </svg>
    ),
    title: 'Stop / Target Alerts',
    desc: 'Track open positions and receive push notifications the moment price hits your stop loss or profit target.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
    title: 'AI Trading Chat',
    desc: 'Ask anything — "should I hold NVDA through earnings?" The AI knows your positions, live prices, and the latest news.',
  },
];

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reset = (m: Mode) => { setMode(m); setError(''); setMessage(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage(''); setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
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

  if (mode === 'landing') {
    return (
      <div className="min-h-screen bg-[#0c0c0d] flex flex-col">
        {/* Subtle grid texture */}
        <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

        {/* Nav */}
        <nav className="relative flex items-center justify-between px-6 py-4 border-b border-[#1a1a1c]">
          <div className="flex items-center gap-2">
            <StakdxLogo size="h-6" />
            <span className="text-lg font-bold tracking-tight text-white">Stakdx</span>
          </div>
          <button
            onClick={() => reset('login')}
            className="text-sm text-gray-400 hover:text-white transition-colors px-4 py-1.5 rounded-lg border border-[#222225] hover:border-[#333336]"
          >
            Sign In
          </button>
        </nav>

        {/* Hero */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-6">
            <StakdxLogo size="h-14" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4 max-w-xl">
            Trade with an<br /><span className="text-amber-500">edge.</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-md mb-10 leading-relaxed">
            AI-powered swing trading analysis. Daily setups, real-time alerts, and a market-aware AI you can actually talk to.
          </p>
          <button
            onClick={() => reset('signup')}
            className="btn-primary text-base px-8 py-3 mb-4"
          >
            Get Started Free
          </button>
          <p className="text-xs text-gray-600">No credit card required</p>
        </div>

        {/* Features */}
        <div className="relative px-6 pb-16">
          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-[#141415] border border-[#222225] rounded-xl p-5">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-3">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <footer className="relative text-center text-xs text-gray-700 pb-6">
          For informational purposes only. Not financial advice.
        </footer>
      </div>
    );
  }

  if (mode === 'verify') {
    return (
      <div className="min-h-screen bg-[#0c0c0d] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />
        <div className="relative w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <StakdxLogo size="h-8" />
            <h1 className="text-2xl font-bold text-white">Stakdx</h1>
          </div>
          <div className="bg-[#141415] border border-[#222225] rounded-xl p-8 shadow-2xl shadow-black/50">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-1">
              We sent a confirmation link to
            </p>
            <p className="text-sm font-medium text-amber-400 mb-5">{email}</p>
            <p className="text-xs text-gray-600 leading-relaxed mb-6">
              Click the link in that email to activate your account, then come back here to sign in.
            </p>
            <button
              onClick={() => reset('login')}
              className="btn-primary w-full justify-center"
            >
              Go to Sign In
            </button>
          </div>
          <p className="text-center text-xs text-gray-700 mt-4">
            <button onClick={() => reset('landing')} className="hover:text-gray-500 transition-colors">← Back to home</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0d] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <StakdxLogo size="h-8" />
            <h1 className="text-2xl font-bold text-white">Stakdx</h1>
          </div>
          <p className="text-gray-600 text-sm mt-1">
            {mode === 'forgot' ? 'Reset your password' : mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        <div className="bg-[#141415] border border-[#222225] rounded-xl p-6 shadow-2xl shadow-black/50">
          {/* Tabs */}
          {mode !== 'forgot' && (
            <div className="flex rounded-lg bg-[#0c0c0d] p-1 mb-6">
              <button type="button" onClick={() => reset('login')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'login' ? 'bg-[#1e1e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-300'}`}>
                Sign In
              </button>
              <button type="button" onClick={() => reset('signup')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-[#1e1e20] text-white shadow-sm' : 'text-gray-600 hover:text-gray-300'}`}>
                Create Account
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="mb-5">
              <button onClick={() => reset('login')} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to sign in
              </button>
              <p className="text-gray-500 text-sm mt-4">Enter your email and we'll send a reset link.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required
                className="w-full bg-[#0c0c0d] border border-[#2a2a2c] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/60 transition-colors placeholder-gray-700" />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                  className="w-full bg-[#0c0c0d] border border-[#2a2a2c] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/60 transition-colors placeholder-gray-700" />
              </div>
            )}

            {mode === 'login' && (
              <div className="text-right -mt-1">
                <button type="button" onClick={() => reset('forgot')}
                  className="text-xs text-gray-600 hover:text-amber-500 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {message && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                {message}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
              {loading ? (
                <><svg className="w-4 h-4 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>Processing...</>
              ) : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-700 mt-4">
          For informational purposes only. Not financial advice.
        </p>
        <p className="text-center text-xs text-gray-700 mt-1">
          <button onClick={() => reset('landing')} className="hover:text-gray-500 transition-colors">← Back to home</button>
        </p>
      </div>
    </div>
  );
}
