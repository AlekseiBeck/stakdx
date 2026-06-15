import { describe, it, expect } from 'vitest';
import { responseText } from '../src/claude';
import type Anthropic from '@anthropic-ai/sdk';

// responseText skips thinking blocks and returns the first text block — the
// contract the structured-output parsers rely on.
const msg = (content: unknown) => ({ content } as unknown as Anthropic.Message);

describe('responseText', () => {
  it('returns the first text block, ignoring thinking blocks', () => {
    expect(responseText(msg([
      { type: 'thinking', thinking: 'let me reason...' },
      { type: 'text', text: '{"ok":true}' },
    ]))).toBe('{"ok":true}');
  });

  it('returns empty string when there is no text block', () => {
    expect(responseText(msg([{ type: 'thinking', thinking: 'only thinking' }]))).toBe('');
    expect(responseText(msg([]))).toBe('');
  });
});
