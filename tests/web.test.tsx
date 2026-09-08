// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/web/App';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('adds, completes and deletes a task through the API', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '1', title: 'Read a book', completed: false }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '1', title: 'Read a book', completed: true }) })
    .mockResolvedValueOnce({ ok: true, status: 204 });
  vi.stubGlobal('fetch', fetcher); render(<App />);
  await screen.findByText(/A fresh start/);
  fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Read a book' } });
  fireEvent.click(screen.getByRole('button', { name: /Add task/ }));
  await screen.findByText('Read a book');
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Delete Read a book' }));
  await screen.findByText(/A fresh start/);
});
it('shows an API failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(<App />); expect((await screen.findByRole('alert')).textContent).toContain('Could not load');
});
