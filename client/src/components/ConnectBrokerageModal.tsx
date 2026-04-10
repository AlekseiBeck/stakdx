import React, { useState } from 'react';
import { connectBrokerage } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  session?: unknown;
}

export default function ConnectBrokerageModal({ isOpen, onClose, onConnected }: Props) {
  const [accountType, setAccountType] = useState<'paper' | 'live'>('paper');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

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
      setTimeout(() => {
        onConnected();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message ?? 'Connection failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setApiKey('');
    setSecretKey('');
    setError('');
    setSuccess(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-[#0d1424] border border-[#16213a] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[#16213a] text-center">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 hover:bg-[#16213a] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="w-12 h-12 rounded-full bg-[#0a0e1a] border border-[#16213a] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Connect Brokerage</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
            Your API keys are encrypted with AES-256 before storage. Only you can access your account.
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Account type pills */}
          <div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Account Type</div>
            <div className="flex gap-2">
              <button
                onClick={() => setAccountType('paper')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                  accountType === 'paper'
                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                    : 'bg-[#0a0e1a] border-[#16213a] text-gray-500 hover:border-[#2a3a5e] hover:text-gray-400'
                }`}
              >
                Paper Trading
              </button>
              <button
                onClick={() => setAccountType('live')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                  accountType === 'live'
                    ? 'bg-red-950/60 border-red-700/60 text-red-400'
                    : 'bg-[#0a0e1a] border-[#16213a] text-gray-500 hover:border-[#2a3a5e] hover:text-gray-400'
                }`}
              >
                Live Trading
              </button>
            </div>
            {accountType === 'live' && (
              <p className="text-[11px] text-amber-400 mt-2">
                Live trading uses real money. Paper trading is recommended for testing.
              </p>
            )}
          </div>

          {/* API Key input */}
          <div>
            <label className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold block mb-1.5">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="PKXXXXXXXXXXXXXXXXXXXXX"
                autoComplete="off"
                className="w-full bg-[#0a0e1a] border border-[#16213a] rounded-lg px-3 py-2.5 pr-10 text-white mono text-sm focus:outline-none focus:border-blue-600 transition-colors placeholder-gray-700"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
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
            <label className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold block mb-1.5">
              Secret Key
            </label>
            <div className="relative">
              <input
                type={showSecretKey ? 'text' : 'password'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Enter your Alpaca secret key"
                autoComplete="off"
                className="w-full bg-[#0a0e1a] border border-[#16213a] rounded-lg px-3 py-2.5 pr-10 text-white mono text-sm focus:outline-none focus:border-blue-600 transition-colors placeholder-gray-700"
              />
              <button
                type="button"
                onClick={() => setShowSecretKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
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
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/30 border border-red-900/40 rounded-lg">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-950/30 border border-emerald-900/40 rounded-lg">
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-emerald-400 font-semibold">
                Connected to {accountType === 'paper' ? 'Paper' : 'Live'} Account
              </p>
            </div>
          )}

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={loading || success}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
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

          <p className="text-[11px] text-gray-600 text-center">
            Get your API keys at{' '}
            <a
              href="https://app.alpaca.markets/paper-accounts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400"
            >
              app.alpaca.markets
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
