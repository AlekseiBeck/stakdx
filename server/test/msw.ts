import { setupServer } from 'msw/node';

// Shared Mock Service Worker server. Tests register per-case handlers with
// `mswServer.use(...)`; outbound HTTP from the modules under test (axios →
// Alpaca / Finnhub / NewsAPI / Reddit / brokerage / link-preview) is intercepted
// here instead of hitting the network.
export const mswServer = setupServer();
