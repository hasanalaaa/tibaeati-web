import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { I18nProvider } from '@/app/i18n';
import { createPrintProject } from '@/domain/models/printProject';
import { storage } from '@/services/storage';
import { ToastProvider } from '@/ui';
import { LibraryScreen } from './LibraryScreen';

// jsdom has no <dialog> modal API; this stub is enough for open/close state.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.setAttribute('open', '');
    },
  },
  close: {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  },
});

function renderLibrary() {
  const { hook } = memoryLocation({ path: '/library' });
  render(
    <I18nProvider>
      <ToastProvider dismissLabel="x">
        <Router hook={hook}>
          <LibraryScreen />
        </Router>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('LibraryScreen', () => {
  beforeEach(async () => {
    localStorage.setItem('tibaeati.language', 'en');
    const s = storage();
    await s.db.projects.clear();
    await s.projects.save(createPrintProject({ name: 'Alpha', mode: 'unifiedOnly' }, new Date()));
    await s.projects.save(createPrintProject({ name: 'Beta', mode: 'housingOnly' }, new Date()));
  });

  it('lists projects, filters by name, renames and deletes', async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'alp');
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));

    await user.click(await screen.findByRole('button', { name: 'Actions for Alpha' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByLabelText('Project name');
    await user.clear(field);
    await user.type(field, 'Gamma{Enter}');
    expect(await screen.findByText('Gamma')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for Gamma' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => {
      expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
    });
  });

  it('shows the empty state and the quarantine notice', async () => {
    const s = storage();
    await s.db.projects.clear();
    await s.db.projects.put({
      id: '11111111-1111-4111-8111-111111111111',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mode: 'unifiedOnly',
      schemaVersion: 1,
    });
    renderLibrary();
    expect(await screen.findByRole('alert')).toHaveTextContent('1 unreadable items');
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });
});
