import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests so the DOM doesn't leak across cases.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom lacks a few browser APIs that components touch. Stub the minimum.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error - jsdom has no ResizeObserver
window.ResizeObserver = window.ResizeObserver ?? ResizeObserverStub;
