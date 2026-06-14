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
}

export default function StockChart({ ticker, range, onRangeChange, fill = false, collapsed, onToggleCollapse, showCollapse = true }: StockChartProps) {
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
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#71717a',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: '#222225' },
      timeScale: { borderColor: '#222225', timeVisible: range !== 'max' && range !== '2y' && range !== '1y' && range !== 'ytd' },
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
  }, [ticker, range, collapsed]);

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
    <div className={`bg-[#0e0e0f] ${filling ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0'}`}>
      {/* Chart header */}
      <div className="flex items-center gap-2.5 px-4 h-10">
        <span className="mono text-sm font-bold text-white">{ticker}</span>
        {lastCandle && !loading && (
          <>
            <span className="mono text-xs text-gray-300">${lastCandle.c.toFixed(2)}</span>
            {changePct != null && (
              <span className={`mono text-[11px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
                <span className="text-gray-600 font-normal ml-1">{range.toUpperCase()}</span>
              </span>
            )}
          </>
        )}
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-0.5">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => onRangeChange(r.id)}
              className={`mono text-[10px] font-semibold px-1.5 py-1 rounded transition-colors ${
                range === r.id
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-gray-600 hover:text-gray-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {showCollapse && (
          <button
            onClick={onToggleCollapse}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-[#1e1e20] transition-colors"
            title={collapsed ? 'Show chart' : 'Hide chart'}
          >
            {collapsed ? <CaretDown size={13} weight="bold" /> : <CaretUp size={13} weight="bold" />}
          </button>
        )}
      </div>

      {/* Mobile range pills */}
      {!collapsed && (
        <div className="sm:hidden flex items-center gap-0.5 px-3 pb-1 overflow-x-auto">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => onRangeChange(r.id)}
              className={`mono text-[10px] font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors ${
                range === r.id ? 'bg-amber-500/15 text-amber-400' : 'text-gray-600'
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
            <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e0f]/70">
              <span className="text-xs text-gray-600 mono">Loading {ticker}…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0e0e0f]">
              <span className="text-xs text-gray-600">{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
