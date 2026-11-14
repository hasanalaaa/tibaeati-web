import { render, screen } from '@testing-library/react';
import { memoryLocation } from 'wouter/memory-location';
import { Router } from 'wouter';
import { I18nProvider } from '@/app/i18n';
import { HomeScreen } from './HomeScreen';

describe('HomeScreen', () => {
  it('renders the six modes as links in Arabic by default', () => {
    localStorage.clear();
    const { hook } = memoryLocation({ path: '/' });
    render(
      <I18nProvider>
        <Router hook={hook}>
          <HomeScreen />
        </Router>
      </I18nProvider>,
    );
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.getByRole('link', { name: /البطاقة الموحدة/ })).toHaveAttribute(
      'href',
      '/mode/unifiedOnly',
    );
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('button', { name: 'الإعدادات' })).toBeInTheDocument();
  });
});
