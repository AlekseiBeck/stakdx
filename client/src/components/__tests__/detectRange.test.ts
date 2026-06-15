import { describe, it, expect } from 'vitest';
import { detectRange } from '../ChatPanel';

describe('detectRange', () => {
  it.each([
    ['what is the price right now?', 'now'],
    ['how did it do today', '1d'],
    ['premarket movement', '1d'],
    ['this week so far', '1w'],
    ['over the past month', '1m'],
    ['ytd performance', 'ytd'],
    ['year to date return', 'ytd'],
    ['past year trend', '1y'],
    ['all time high', 'max'],
    ['long-term outlook', 'max'],
  ] as const)('maps %j → %s', (text, expected) => {
    expect(detectRange(text)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(detectRange('YTD')).toBe('ytd');
  });

  it('returns null when no time reference is present', () => {
    expect(detectRange('should I buy this stock?')).toBeNull();
  });
});
