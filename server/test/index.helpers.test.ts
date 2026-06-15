import { describe, it, expect } from 'vitest';
import { sanitizeArticles, decodeEntities } from '../src/index';

describe('decodeEntities', () => {
  it('decodes the supported named/numeric entities', () => {
    expect(decodeEntities('AT&amp;T &quot;hi&quot; &#39;x&#39; &#039;y&#039; &lt;b&gt;&nbsp;end'))
      .toBe('AT&T "hi" \'x\' \'y\' <b> end');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('a &copy; b')).toBe('a &copy; b');
  });
});

describe('sanitizeArticles', () => {
  it('returns null for a non-array', () => {
    expect(sanitizeArticles('nope')).toBeNull();
    expect(sanitizeArticles({})).toBeNull();
    expect(sanitizeArticles(null)).toBeNull();
  });

  it('returns null if any entry is not an object', () => {
    expect(sanitizeArticles(['https://x.com'])).toBeNull();
  });

  it('returns null if any url is missing/invalid/too long', () => {
    expect(sanitizeArticles([{ url: 'ftp://x.com' }])).toBeNull();
    expect(sanitizeArticles([{ url: 'not-a-url' }])).toBeNull();
    expect(sanitizeArticles([{ url: 123 }])).toBeNull();
    expect(sanitizeArticles([{ url: `https://x.com/${'a'.repeat(2001)}` }])).toBeNull();
  });

  it('keeps valid entries, trims url, defaults title to url, defaults addedAt', () => {
    const out = sanitizeArticles([{ url: '  https://example.com/a  ' }])!;
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://example.com/a');
    expect(out[0].title).toBe('https://example.com/a');
    expect(typeof out[0].addedAt).toBe('string');
  });

  it('dedupes by url, keeping the first occurrence', () => {
    const out = sanitizeArticles([
      { url: 'https://a.com', title: 'first' },
      { url: 'https://a.com', title: 'dupe' },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('first');
  });

  it('caps title at 300 and source at 80 chars', () => {
    const out = sanitizeArticles([
      { url: 'https://a.com', title: 'T'.repeat(400), source: 'S'.repeat(120) },
    ])!;
    expect(out[0].title).toHaveLength(300);
    expect(out[0].source).toHaveLength(80);
  });

  it('omits source when blank', () => {
    const out = sanitizeArticles([{ url: 'https://a.com', source: '   ' }])!;
    expect(out[0].source).toBeUndefined();
  });

  it('caps the list at 30 entries', () => {
    const many = Array.from({ length: 35 }, (_, i) => ({ url: `https://a.com/${i}` }));
    expect(sanitizeArticles(many)!).toHaveLength(30);
  });
});
