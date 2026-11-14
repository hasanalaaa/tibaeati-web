import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Card } from '@/ui';
import { useT } from './i18n';

function Fallback() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-4">
      <Card className="w-full text-center">
        <h1 className="text-xl font-bold">{t('error.title')}</h1>
        <p className="mt-2 text-fg-muted">{t('error.body')}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          {t('error.reload')}
        </Button>
      </Card>
    </main>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
