import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if (typeof window !== 'undefined') {
  const isExtensionError = (msg: string, stack = '') =>
    stack.includes('chrome-extension://') ||
    stack.includes('moz-extension://') ||
    msg.includes('Failed to connect to MetaMask');

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined;
    const msg = typeof reason === 'string' ? reason : String(reason?.message ?? '');
    const stack = typeof reason === 'object' && reason ? String(reason.stack ?? '') : '';
    if (isExtensionError(msg, stack)) {
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = String(event.message ?? '');
    const filename = String(event.filename ?? '');
    if (isExtensionError(msg, filename)) {
      event.preventDefault();
    }
  });
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
