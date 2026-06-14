import React from 'react';
import ConnectBrokerageForm from './ConnectBrokerageForm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  session?: unknown;
}

export default function ConnectBrokerageModal({ isOpen, onClose, onConnected }: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#141415] border border-[#222225] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[#222225] text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 hover:bg-[#1e1e20] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="w-12 h-12 rounded-full bg-[#111112] border border-[#222225] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Connect Brokerage</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
            Your API keys are encrypted with AES-256 before storage. Only you can access your account.
          </p>
        </div>

        <div className="px-6 py-5">
          <ConnectBrokerageForm onConnected={() => { onConnected(); onClose(); }} />
        </div>
      </div>
    </div>
  );
}
