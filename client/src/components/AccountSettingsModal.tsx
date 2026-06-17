import React, { useState } from 'react';
import { X, GearSix, SignOut, LinkBreak } from '@phosphor-icons/react';
import { supabase } from '../supabase';
import { disconnectBrokerage } from '../api';
import ConnectBrokerageForm from './ConnectBrokerageForm';
import PaperTradingPanel from './PaperTradingPanel';

interface Props {
  userEmail: string;
  brokerageConnected: boolean;
  onClose: () => void;
  onBrokerageChanged: () => void;
  onSignOut: () => Promise<void>;
}

export default function AccountSettingsModal({
  userEmail,
  brokerageConnected,
  onClose,
  onBrokerageChanged,
  onSignOut,
}: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwError(error.message);
      } else {
        setPwSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setPwError('Failed to update password. Please try again.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectBrokerage();
      onBrokerageChanged();
    } catch {
      // non-fatal — keep modal open
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0 pt-16 sm:pt-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-surface border border-border rounded-2xl shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-surface">
          <div className="flex items-center gap-2">
            <GearSix size={18} weight="duotone" className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-bold text-fg">Account Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:text-muted hover:bg-surface-2 transition-all"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* ── Profile ─────────────────────────────────────────────────────── */}
          <section>
            <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-2">Profile</div>
            <div className="bg-bg rounded-lg px-3 py-2.5 border border-border">
              <div className="text-[10px] text-dim mb-0.5">Email</div>
              <div className="text-sm text-muted mono truncate">{userEmail}</div>
            </div>
          </section>

          {/* ── Change password ─────────────────────────────────────────────── */}
          <section>
            <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-2">Change Password</div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-fg text-sm focus:outline-none focus:border-amber-500/60 transition-colors placeholder-dim"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-fg text-sm focus:outline-none focus:border-amber-500/60 transition-colors placeholder-dim"
              />
              {pwError && <p className="text-xs text-red-700 dark:text-red-400">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">Password updated.</p>}
              <button
                type="submit"
                disabled={pwLoading || !newPassword || !confirmPassword}
                className="btn-ghost text-xs py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pwLoading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </section>

          {/* ── Paper trading ───────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-dim uppercase tracking-wider font-semibold">Paper Trading Account</div>
              {brokerageConnected && (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 text-[11px] text-faint hover:text-red-700 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <LinkBreak size={13} weight="bold" />
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              )}
            </div>
            {brokerageConnected ? (
              <PaperTradingPanel visible={true} />
            ) : (
              <div className="bg-bg rounded-xl border border-border p-4">
                <p className="text-xs text-faint mb-4 leading-relaxed">
                  Connect your Alpaca paper account to place orders and view live balances. Keys are
                  encrypted with AES-256 before storage.
                </p>
                <ConnectBrokerageForm onConnected={onBrokerageChanged} />
              </div>
            )}
          </section>

          {/* ── Sign out ────────────────────────────────────────────────────── */}
          <section className="border-t border-border pt-4">
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 text-sm text-muted hover:text-red-700 dark:hover:text-red-400 transition-colors"
            >
              <SignOut size={16} weight="bold" />
              Sign out
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
