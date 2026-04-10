import React from 'react';
import { ScanMode } from '../types';

interface Props {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
}

const OPTIONS: { value: ScanMode; label: string; activeClass: string }[] = [
  { value: 'long', label: 'LONG', activeClass: 'bg-emerald-600 text-white' },
  { value: 'both', label: 'BOTH', activeClass: 'bg-blue-600 text-white' },
  { value: 'short', label: 'SHORT', activeClass: 'bg-red-600 text-white' },
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
