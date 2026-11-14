import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppearanceProvider } from './appearance';
import { ErrorBoundary } from './ErrorBoundary';
import { I18nProvider } from './i18n';
import { registerServiceWorker } from './pwa';
import { ToastProvider } from '@/ui';
import { useT } from './i18n';
import './index.css';

function Toasts({ children }: { children: ReactNode }) {
  const t = useT();
  return <ToastProvider dismissLabel={t('common.dismiss')}>{children}</ToastProvider>;
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <AppearanceProvider>
        <ErrorBoundary>
          <Toasts>
            <App />
          </Toasts>
        </ErrorBoundary>
      </AppearanceProvider>
    </I18nProvider>
  </StrictMode>,
);
