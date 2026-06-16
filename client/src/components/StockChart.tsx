import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { fetchChartData, ChartRange, ChartCandle } from '../api';
import { useTheme } from '../ThemeContext';

const RANGES: { id: ChartRange; label: string }[] = [
  { id: 'max', label: 'MAX' },
  { id: '2y', label: '2Y' },
  { id: '1y', label: '1Y' },
  { id: 'ytd', label: 'YTD' },
  { id: '1m', label: '1M' },
  { id: '1w', label: '1W' },
  { id: '1d', label: '1D' },
  { id: 'now', label: 'NOW' },
];

interface StockChartProps {
  ticker: string;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  fill?: boolean;            // fill the parent container (sized by the resizable split)
  collapsed: boolean;
  onToggleCollapse: () => void;
  showCollapse?: boolean;    // collapse-to-header only makes sense in vertical layouts
  compact?: boolean;         // narrow tiles (workstation grid): move range pills to a scrollable strip so none clip
}

export default function StockChart({ ticker, range, onRangeChange, fill = false, collapsed, onToggleCollapse, showCollapse = true, compact = false }: StockChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const filling = fill && !collapsed;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastCandle, setLastCandle] = useState<ChartCandle | null>(null);
  const [changePct, setChangePct] = useState<number | null>(null);

  useEffect(() => {
    if (collapsed || !containerRef.current) return;

    const el = containerRef.current;
    // lightweight-charts needs concrete colors (can't read CSS vars), so derive
    // the neutral chrome from the theme. Candle up/down + crosshair amber stay.
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    const axisBorder = isDark ? '#222225' : '#e5e5e7';
    const axisText = isDark ? '#71717a' : '#8e8e93';
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: axisText,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      rightPriceScale: { borderColor: axisBorder },
      timeScale: { borderColor: axisBorder, timeVisible: range !== 'max' && range !== '2y' && range !== '1y' && range !== 'ytd' },
      crosshair: {
        vertLine: { color: 'rgba(245,158,11,0.35)', labelBackgroundColor: '#f59e0b' },
        horzLine: { color: 'rgba(245,158,11,0.35)', labelBackgroundColor: '#f59e0b' },
      },
      height: 260,
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: 'rgba(16,185,129,0.6)',
      wickDownColor: 'rgba(239,68,68,0.6)',
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    let cancelled = false;
    setLoading(true);
    setError('');

    fetchChartData(ticker, range)
      .then(({ candles }) => {
        if (cancelled) return;
        if (!candles || candles.length === 0) {
          setError(`No data for ${ticker}`);
          setLoading(false);
          return;
        }
        const toTime = (t: string) => Math.floor(Date.parse(t) / 1000) as UTCTimestamp;
        candleSeries.setData(candles.map(c => ({
          time: toTime(c.t), open: c.o, high: c.h, low: c.l, close: c.c,
        })));
        volumeSeries.setData(candles.map(c => ({
          time: toTime(c.t),
          value: c.v,
          color: c.c >= c.o ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
        })));
        chart.timeScale().fitContent();
        const first = candles[0];
        const last = candles[candles.length - 1];
        setLastCandle(last);
        setChangePct(first.o > 0 ? ((last.c - first.o) / first.o) * 100 : null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(`Couldn't load chart for ${ticker}`);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      chart.remove();
      chartRef.current = null;
    };
  }, [ticker, range, collapsed, isDark]);

  // Keep the chart filled whenever its container resizes (layout change or drag-resize)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || collapsed) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [collapsed, filling]);

  const up = changePct != null && changePct >= 0;

  return (
    <div className={`bg-bg ${filling ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0'}`}>
      {/* Chart header */}
      <div className="flex items-center gap-2.5 px-4 h-10">
        <span className="mono text-sm font-bold text-fg">{ticker}</span>
        {lastCandle && !loading && (
          <>
            <span className="mono text-xs text-muted">${lastCandle.c.toFixed(2)}</span>
            {changePct != null && (
              <span className={`mono text-[11px] font-semibold ${up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
                <span className="text-dim font-normal ml-1">{range.toUpperCase()}</span>
              </span>
            )}
          </>
        )}
        <div className="flex-1" />
        <div className={`${compact ? 'hidden' : 'hidden sm:flex'} items-center gap-0.5`}>
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => onRangeChange(r.id)}
              className={`mono text-[10px] font-semibold px-1.5 py-1 rounded transition-colors ${
                range === r.id
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'text-dim hover:text-muted'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {showCollapse && (
          <button
            onClick={onToggleCollapse}
            className="w-6 h-6 flex items-center justify-center rounded-md text-faint hover:text-fg hover:bg-surface-2 transition-colors"
            title={collapsed ? 'Show chart' : 'Hide chart'}
          >
            {collapsed ? <CaretDown size={13} weight="bold" /> : <CaretUp size={13} weight="bold" />}
          </button>
        )}
      </div>

      {/* Scrollable range pills — always shown on mobile, and in compact (workstation) tiles */}
      {!collapsed && (
        <div className={`${compact ? '' : 'sm:hidden'} flex items-center gap-0.5 px-3 pb-1 overflow-x-auto`}>
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => onRangeChange(r.id)}
              className={`mono text-[10px] font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors ${
                range === r.id ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'text-dim'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* Chart body */}
      {!collapsed && (
        <div className={`relative px-1 pb-1 ${filling ? 'flex-1 min-h-0' : ''}`}>
          <div ref={containerRef} className={`w-full ${filling ? 'h-full' : 'h-[260px]'}`} />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/70">
              <span className="text-xs text-dim mono">Loading {ticker}…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg">
              <span className="text-xs text-dim">{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
