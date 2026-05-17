import React, { useState, useEffect } from 'react';
import { Position, PositionUpdate, AlpacaPosition } from '../types';
import { getPositionUpdate, deletePosition, getVapidPublicKey, subscribeToNotifications, unsubscribeFromNotifications } from '../api';

interface Props {
  positions: Position[];
  onPositionClosed: (id: string) => void;
  onAddClick: () => void;
  paperPositions?: AlpacaPosition[];
}

function formatTimeHeld(entryTime: string): string {
  const diff = Date.now() - new Date(entryTime).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

interface UpdateState {
  loading: boolean;
  data: PositionUpdate | null;
  mock: boolean;
}

// ─── iOS detection ─────────────────────────────────────────────────────────────
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

// Convert VAPID public key (base64url) to Uint8Array for PushManager
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
}

export default function PositionsPanel({ positions, onPositionClosed, onAddClick, paperPositions = [] }: Props) {
  const [updates, setUpdates] = useState<Record<string, UpdateState>>({});
  const [notifStatus, setNotifStatus] = useState<'idle' | 'loading' | 'subscribed' | 'denied' | 'unsupported'>('idle');
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [iosBannerDismissed, setIosBannerDismissed] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<PushSubscription | null>(null);

  // On mount, detect current notification state and iOS install status
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifStatus('unsupported');
      return;
    }

    // iOS: show install banner if not in standalone mode
    if (isIOS() && !isInStandaloneMode()) {
      setShowIOSBanner(true);
      setNotifStatus('unsupported'); // iOS needs PWA install first
      return;
    }

    // Check if already subscribed
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) {
          setCurrentSubscription(sub);
          setNotifStatus('subscribed');
        }
      });
    });

    if (Notification.permission === 'denied') {
      setNotifStatus('denied');
    }
  }, []);

  const handleEnableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    setNotifStatus('loading');

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifStatus('denied');
        return;
      }

      // Get VAPID public key from backend
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        console.error('No VAPID public key from server');
        setNotifStatus('idle');
        return;
      }

      // Subscribe via PushManager
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
      });

      // Send subscription to backend
      await subscribeToNotifications(subscription.toJSON());
      setCurrentSubscription(subscription);
      setNotifStatus('subscribed');
    } catch (err) {
      console.error('Notification subscription failed:', err);
      setNotifStatus('idle');
    }
  };

  const handleDisableNotifications = async () => {
    if (!currentSubscription) return;
    try {
      await unsubscribeFromNotifications(currentSubscription.endpoint);
      await currentSubscription.unsubscribe();
      setCurrentSubscription(null);
      setNotifStatus('idle');
    } catch (err) {
      console.error('Unsubscribe failed:', err);
    }
  };

  const handleGetUpdate = async (ticker: string) => {
    setUpdates(prev => ({ ...prev, [ticker]: { loading: true, data: null, mock: false } }));
    try {
      const result = await getPositionUpdate(ticker);
      setUpdates(prev => ({ ...prev, [ticker]: { loading: false, data: result.update, mock: result.mock } }));
    } catch {
      setUpdates(prev => ({ ...prev, [ticker]: { loading: false, data: null, mock: false } }));
    }
  };

  const handleClose = async (id: string) => {
    try {
      await deletePosition(id);
      onPositionClosed(id);
    } catch {}
  };

  const verdictConfig = {
    HOLD: { label: 'HOLD', class: 'badge-hold', icon: '⏸' },
    SELL: { label: 'SELL', class: 'badge-sell', icon: '⚡' },
    CAUTION: { label: 'CAUTION', class: 'badge-caution', icon: '⚠' },
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#222225]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
          </svg>
          <h2 className="font-bold text-white">Active Positions</h2>
          {positions.length > 0 && (
            <span className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full">{positions.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Notification toggle */}
          {notifStatus === 'subscribed' ? (
            <button
              onClick={handleDisableNotifications}
              className="flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 hover:bg-red-900/20 hover:border-red-700/40 hover:text-red-400 transition-all"
              title="Disable stop/target notifications"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Alerts On
            </button>
          ) : notifStatus === 'loading' ? (
            <button disabled className="btn-ghost text-xs py-1.5 px-3 opacity-60">
              <svg className="w-3 h-3 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Enabling...
            </button>
          ) : notifStatus === 'denied' ? (
            <span className="text-xs text-red-400/70 px-2">Notifications blocked</span>
          ) : notifStatus === 'unsupported' && !showIOSBanner ? (
            <span className="text-xs text-gray-600 px-2">Alerts unavailable</span>
          ) : notifStatus !== 'unsupported' ? (
            <button
              onClick={handleEnableNotifications}
              className="btn-ghost text-xs py-1.5 px-3"
              title="Get push notifications when your positions hit stop loss or target"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              Enable Alerts
            </button>
          ) : null}

          <button onClick={onAddClick} className="btn-ghost text-xs py-1.5 px-3">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Position
          </button>
        </div>
      </div>

      {/* iOS "Add to Home Screen" install banner */}
      {showIOSBanner && !iosBannerDismissed && (
        <div className="mx-4 mt-4 p-3.5 rounded-xl bg-[#1a1a1c] border border-[#2a2a2c]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-300">Enable Stop/Target Alerts on iPhone</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  To receive push notifications, install Stakd on your Home Screen:
                </p>
                <ol className="text-xs text-gray-500 mt-1.5 space-y-0.5 leading-relaxed">
                  <li>1. Tap the <strong className="text-amber-300">Share</strong> button in Safari (
                    <svg className="inline w-3.5 h-3.5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
                    </svg>
                  )</li>
                  <li>2. Scroll down and tap <strong className="text-amber-300">"Add to Home Screen"</strong></li>
                  <li>3. Open Stakd from your Home Screen and enable alerts here</li>
                </ol>
                <p className="text-[10px] text-gray-600 mt-1.5">Requires iOS 16.4 or later · Safari only</p>
              </div>
            </div>
            <button
              onClick={() => setIosBannerDismissed(true)}
              className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {positions.length === 0 && paperPositions.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#1e1e20] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No active positions</p>
          <p className="text-gray-600 text-xs mt-1">Add a position to track it with AI</p>
        </div>
      ) : (
        <div className="divide-y divide-[#222225]/60">
          {/* Paper account positions (live from Alpaca) */}
          {paperPositions.length > 0 && (
            <div className="px-5 py-3">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                Paper Account
              </div>
              <div className="space-y-1.5">
                {paperPositions.map((pos) => {
                  const isLong = pos.side === 'long';
                  const pl = parseFloat(pos.unrealized_pl);
                  const plPct = (parseFloat(pos.unrealized_plpc) * 100).toFixed(2);
                  return (
                    <div key={pos.symbol} className="bg-[#111112] rounded-lg px-3 py-2.5 border border-[#222225]">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="mono font-bold text-white text-sm">{pos.symbol}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            isLong ? 'bg-emerald-900/50 border-emerald-700/40 text-emerald-400' : 'bg-red-900/50 border-red-700/40 text-red-400'
                          }`}>
                            {isLong ? 'LONG' : 'SHORT'}
                          </span>
                          <span className="mono text-xs text-gray-500">{pos.qty} sh</span>
                        </div>
                        <span className={`mono text-sm font-bold ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pl >= 0 ? '+' : ''}${Math.abs(pl).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs mono text-gray-500">
                        <span>Avg ${parseFloat(pos.avg_entry_price).toFixed(2)}</span>
                        <span>Now ${parseFloat(pos.current_price).toFixed(2)}</span>
                        <span className={pl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {pl >= 0 ? '+' : ''}{plPct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manually tracked positions */}
          {positions.length > 0 && (
            <div>
              {paperPositions.length > 0 && (
                <div className="px-5 pt-3 pb-1">
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                    Tracked Positions
                  </div>
                </div>
              )}
          {positions.map((pos) => {
            const update = updates[pos.ticker];
            const cfg = update?.data ? verdictConfig[update.data.verdict] : null;

            return (
              <div key={pos.id} className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="mono font-bold text-lg text-white">{pos.ticker}</span>
                        {pos.direction === 'long' ? (
                          <span className="badge-long text-xs">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                            </svg>
                            LONG
                          </span>
                        ) : (
                          <span className="badge-short text-xs">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
                            </svg>
                            SHORT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500">Entry: <span className="mono text-gray-300">${pos.entryPrice.toFixed(2)}</span></span>
                        {pos.stopLoss != null && (
                          <>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="text-xs text-gray-500">Stop: <span className="mono text-red-400">${pos.stopLoss.toFixed(2)}</span></span>
                          </>
                        )}
                        {pos.target != null && (
                          <>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="text-xs text-gray-500">Target: <span className="mono text-emerald-400">${pos.target.toFixed(2)}</span></span>
                          </>
                        )}
                        <span className="text-xs text-gray-600">•</span>
                        <span className="text-xs text-gray-500">Held: <span className="text-gray-300">{formatTimeHeld(pos.entryTime)}</span></span>
                        {update?.data && (
                          <>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="mono text-xs text-gray-300">{update.data.currentPrice}</span>
                            <span className={`mono text-xs font-semibold ${update.data.priceChange.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                              {update.data.priceChange}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleGetUpdate(pos.ticker)}
                      disabled={update?.loading}
                      className="btn-ghost text-xs py-1.5 px-3"
                    >
                      {update?.loading ? (
                        <>
                          <svg className="w-3 h-3 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                          </svg>
                          Get Update
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleClose(pos.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-all"
                      title="Close position"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {update?.data && cfg && (
                  <div className={`rounded-lg p-3 mt-2 border ${
                    update.data.verdict === 'HOLD' ? 'bg-[#111112] border-[#2a2a2c]' :
                    update.data.verdict === 'SELL' ? 'bg-red-900/10 border-red-800/30' :
                    'bg-amber-900/10 border-amber-800/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cfg.class}>{cfg.icon} {cfg.label}</span>
                      {update.mock && (
                        <span className="text-[10px] text-gray-600 bg-gray-800/50 px-1.5 py-0.5 rounded">demo</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{update.data.reasoning}</p>
                  </div>
                )}
              </div>
            );
          })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
