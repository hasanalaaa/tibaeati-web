import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppearanceProvider } from './appearance';
import { ErrorBoundary } from './ErrorBoundary';
import { I18nProvider } from './i18n';
import { registerServiceWorker } from './pwa';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <AppearanceProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AppearanceProvider>
    </I18nProvider>
  </StrictMode>,
);
