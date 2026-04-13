import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './AuthContext';
import App from './App';
import './index.css';

// ─── Service Worker Registration ──────────────────────────────────────────────
// Required for PWA (and push notifications on iOS 16.4+).
// On iOS, push notifications only work after the user adds the app to Home Screen.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[SW] Registered, scope:', registration.scope);
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
