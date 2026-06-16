import React, { useState } from 'react';
import { connectBrokerage } from '../api';

interface Props {
  onConnected: () => void;
}

export default function ConnectBrokerageForm({ onConnected }: Props) {
  const [accountType, setAccountType] = useState<'paper' | 'live'>('paper');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleConnect = async () => {
    if (!apiKey.trim() || !secretKey.trim()) {
      setError('Both API Key and Secret Key are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await connectBrokerage(apiKey.trim(), secretKey.trim(), accountType);
      setSuccess(true);
      setTimeout(() => onConnected(), 1200);
    } catch (err: any) {
      setError(err?.message ?? 'Connection failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Account type pills */}
      <div>
        <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-2">Account Type</div>
        <div className="flex gap-2">
          <button
            onClick={() => setAccountType('paper')}
            className={`flex-1 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
              accountType === 'paper'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-bg border-border text-faint hover:border-border-strong hover:text-muted'
            }`}
          >
            Paper Trading
          </button>
          <button
            onClick={() => setAccountType('live')}
            className={`flex-1 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
              accountType === 'live'
                ? 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-700/60 text-red-700 dark:text-red-400'
                : 'bg-bg border-border text-faint hover:border-border-strong hover:text-muted'
            }`}
          >
            Live Trading
          </button>
        </div>
        {accountType === 'live' && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
            Live trading uses real money. Paper trading is recommended for testing.
          </p>
        )}
      </div>

      {/* API Key input */}
      <div>
        <label className="text-[10px] text-dim uppercase tracking-wider font-semibold block mb-1.5">
          API Key
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="PKXXXXXXXXXXXXXXXXXXXXX"
            autoComplete="off"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 pr-10 text-fg mono text-sm focus:outline-none focus:border-amber-500/60 transition-colors placeholder-dim"
          />
          <button
            type="button"
            onClick={() => setShowApiKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-muted transition-colors"
          >
            {showApiKey ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Secret Key input */}
      <div>
        <label className="text-[10px] text-dim uppercase tracking-wider font-semibold block mb-1.5">
          Secret Key
        </label>
        <div className="relative">
          <input
            type={showSecretKey ? 'text' : 'password'}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="Enter your Alpaca secret key"
            autoComplete="off"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 pr-10 text-fg mono text-sm focus:outline-none focus:border-amber-500/60 transition-colors placeholder-dim"
          />
          <button
            type="button"
            onClick={() => setShowSecretKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-muted transition-colors"
          >
            {showSecretKey ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg">
          <svg className="w-4 h-4 text-red-700 dark:text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-lg">
          <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
            Connected to {accountType === 'paper' ? 'Paper' : 'Live'} Account
          </p>
        </div>
      )}

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={loading || success}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Connecting...
          </>
        ) : success ? (
          'Connected'
        ) : (
          'Test & Connect'
        )}
      </button>

      <p className="text-[11px] text-dim text-center">
        Get your API keys at{' '}
        <a
          href="https://app.alpaca.markets/paper-accounts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-500/70 hover:text-amber-500"
        >
          app.alpaca.markets
        </a>
      </p>
    </div>
  );
}
