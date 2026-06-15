import { describe, it, expect } from 'vitest';
import { detectTicker } from '../ChatPanel';

const watchlist = ['AAPL', 'NVDA', 'AMD', 'TSLA'];

describe('detectTicker', () => {
  it('picks up explicit $TICKER syntax (case-insensitive)', () => {
    expect(detectTicker('thoughts on $tsla here', watchlist)).toBe('TSLA');
  });

  it('matches an all-caps watchlist token', () => {
    expect(detectTicker('is NVDA a buy', watchlist)).toBe('NVDA');
  });

  it('ignores all-caps English words on the blacklist', () => {
    expect(detectTicker('SELL THE TOP NOW', watchlist)).toBeNull();
  });

  it('resolves a company name to its ticker', () => {
    expect(detectTicker('how is nvidia doing today', watchlist)).toBe('NVDA');
    expect(detectTicker('thinking about palantir', watchlist)).toBe('PLTR');
  });

  it('resolves an unambiguous lowercase ticker mention', () => {
    expect(detectTicker('i think aapl looks strong', watchlist)).toBe('AAPL');
  });

  it('returns null when no ticker is present', () => {
    expect(detectTicker('what should I do here', watchlist)).toBeNull();
  });

  it('prioritizes $TICKER over later matches', () => {
    expect(detectTicker('$amd vs nvidia', watchlist)).toBe('AMD');
  });
});
