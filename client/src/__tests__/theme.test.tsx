import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../ThemeContext';

const STORAGE_KEY = 'stakdx-theme';

function Consumer() {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
      <button onClick={() => setTheme('light')}>set-light</button>
      <button onClick={() => setTheme('dark')}>set-dark</button>
    </div>
  );
}

// Deterministic matchMedia: reports `dark` only when asked about the dark query.
function mockPrefersColorScheme(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const html = () => document.documentElement.getAttribute('data-theme');

beforeEach(() => {
  // Self-contained in-memory localStorage (jsdom's is unreliable under Node).
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider / useTheme — initial resolution', () => {
  it('defaults to prefers-color-scheme: dark when nothing is stored', () => {
    mockPrefersColorScheme(true);
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(html()).toBe('dark');
    // System preference must NOT be pinned to storage on first load.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('defaults to prefers-color-scheme: light when nothing is stored', () => {
    mockPrefersColorScheme(false);
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(html()).toBe('light');
  });

  it('prefers a stored choice over the system setting', () => {
    mockPrefersColorScheme(false); // system = light
    localStorage.setItem(STORAGE_KEY, 'dark'); // user previously chose dark
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(html()).toBe('dark');
  });

  it('honors a pre-paint data-theme attribute (inline-script sync)', () => {
    mockPrefersColorScheme(false);
    document.documentElement.setAttribute('data-theme', 'dark');
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });
});

describe('ThemeProvider / useTheme — toggle + persistence', () => {
  it('toggle flips the DOM attribute and persists across both directions', async () => {
    mockPrefersColorScheme(false); // start light
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');

    await user.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(html()).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(html()).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('setTheme writes the attribute, status-bar meta, and localStorage', async () => {
    mockPrefersColorScheme(true);
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    await user.click(screen.getByText('set-light'));
    expect(html()).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(meta.getAttribute('content')).toBe('#f5f5f7');

    await user.click(screen.getByText('set-dark'));
    expect(meta.getAttribute('content')).toBe('#0c0c0d');

    meta.remove();
  });
});

describe('useTheme — without a provider', () => {
  it('returns a safe default and no-ops mutations (bare component render)', async () => {
    document.documentElement.removeAttribute('data-theme');
    const user = userEvent.setup();
    render(<Consumer />);
    // No provider -> reads DOM (none set) -> light, and toggling must not throw.
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    await user.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });
});
