import React from 'react';

// ScanButton is now embedded in Header.tsx for layout integration.
// This file is kept for backwards compatibility.

interface ScanButtonProps {
  onScan: () => void;
  isScanning: boolean;
}

export default function ScanButton({ onScan, isScanning }: ScanButtonProps) {
  return (
    <button
      onClick={onScan}
      disabled={isScanning}
      className="btn-primary text-sm"
    >
      {isScanning ? (
        <>
          <svg className="w-4 h-4 spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Scanning...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
          </svg>
          Run Daily Scan
        </>
      )}
    </button>
  );
}
