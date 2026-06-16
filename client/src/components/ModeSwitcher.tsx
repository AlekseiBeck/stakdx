import React from 'react';
import { ScanMode } from '../types';

interface Props {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
}

const OPTIONS: { value: ScanMode; label: string; activeClass: string }[] = [
  { value: 'long', label: 'LONG', activeClass: 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_2px_10px_-2px_rgba(16,185,129,0.5)]' },
  { value: 'both', label: 'BOTH', activeClass: 'bg-gradient-to-b from-zinc-200 to-zinc-300 text-zinc-900 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] dark:from-[#44444a] dark:to-[#36363b] dark:text-fg dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.5)]' },
  { value: 'short', label: 'SHORT', activeClass: 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_2px_10px_-2px_rgba(239,68,68,0.5)]' },
];

export default function ModeSwitcher({ mode, onChange }: Props) {
  return (
    <div className="mode-pill">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`mode-pill-btn ${
            mode === opt.value ? opt.activeClass : 'mode-pill-btn-inactive'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
