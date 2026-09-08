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

const active = { id: '1', title: 'Read a book', completed: false };
const completed = { id: '2', title: 'Take a walk', completed: true };
const response = (data: unknown) => ({ ok: true, json: async () => data });
function deferred() {
  let resolve!: (value: ReturnType<typeof response> | { ok: false }) => void;
  const promise = new Promise<ReturnType<typeof response> | { ok: false }>(done => { resolve = done; });
  return { promise, resolve };
}

it.each([
  { label: 'empty', todos: [], text: '0 tasks remaining' },
  { label: 'all completed', todos: [completed], text: '0 tasks remaining' },
  { label: 'one active', todos: [active], text: '1 task remaining' },
  { label: 'mixed', todos: [active, completed, { ...active, id: '3' }], text: '2 tasks remaining' },
])('counts $label tasks after loading', async ({ todos, text }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(todos)));
  render(<App />);
  await screen.findByText(text);
  const status = screen.getByRole('status');
  expect(status.textContent).toBe(text);
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.getAttribute('aria-atomic')).toBe('true');
  expect(status.hasAttribute('tabindex')).toBe(false);
});

it('keeps the same empty status region until initial loading succeeds', async () => {
  const initial = deferred();
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(initial.promise));
  render(<App />);
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('');
  expect(screen.getByText('Loading your list…')).toBeTruthy();
  initial.resolve(response([]));
  await screen.findByText('0 tasks remaining');
  expect(screen.getByRole('status')).toBe(status);
});

it('updates the confirmed count for add, complete, reopen and both kinds of delete without moving focus', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response([completed]))
    .mockResolvedValueOnce(response(active))
    .mockResolvedValueOnce(response({ ...active, completed: true }))
    .mockResolvedValueOnce(response(active))
    .mockResolvedValueOnce(response({ ...active, id: '3', title: 'Cook' }))
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 204 });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText('0 tasks remaining');
  const input = screen.getByLabelText('New task');
  input.focus();
  fireEvent.change(input, { target: { value: active.title } });
  fireEvent.click(screen.getByRole('button', { name: /Add task/ }));
  await screen.findByText('1 task remaining');
  expect(document.activeElement).toBe(input);
  fireEvent.click(screen.getByRole('checkbox', { name: active.title }));
  await screen.findByText('0 tasks remaining');
  fireEvent.click(screen.getByRole('checkbox', { name: active.title }));
  await screen.findByText('1 task remaining');
  fireEvent.change(input, { target: { value: 'Cook' } });
  fireEvent.click(screen.getByRole('button', { name: /Add task/ }));
  await screen.findByText('2 tasks remaining');
  fireEvent.click(screen.getByRole('button', { name: `Delete ${completed.title}` }));
  await waitFor(() => expect(screen.queryByText(completed.title)).toBeNull());
  expect(screen.getByRole('status').textContent).toBe('2 tasks remaining');
  fireEvent.click(screen.getByRole('button', { name: `Delete ${active.title}` }));
  await screen.findByText('1 task remaining');
});

it.each(['add', 'complete', 'reopen', 'delete'] as const)('preserves the count during pending and failed %s', async operation => {
  const mutation = deferred();
  const fetcher = vi.fn().mockResolvedValueOnce(response([active, completed])).mockReturnValueOnce(mutation.promise);
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText('1 task remaining');
  if (operation === 'add') {
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Cook' } });
    fireEvent.click(screen.getByRole('button', { name: /Add task/ }));
  } else if (operation === 'delete') {
    fireEvent.click(screen.getByRole('button', { name: `Delete ${active.title}` }));
  } else {
    fireEvent.click(screen.getByRole('checkbox', { name: operation === 'complete' ? active.title : completed.title }));
  }
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('status').textContent).toBe('1 task remaining');
  expect((screen.getByRole('checkbox', { name: active.title }) as HTMLInputElement).disabled).toBe(true);
  mutation.resolve({ ok: false });
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save your changes. Please try again.');
  expect(screen.getByRole('status').textContent).toBe('1 task remaining');
  expect((screen.getByRole('checkbox', { name: active.title }) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('checkbox', { name: completed.title }) as HTMLInputElement).checked).toBe(true);
});

it('does not expose an incomplete count after initial failure even when adding clears the error and succeeds', async () => {
  const mutation = deferred();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(mutation.promise));
  render(<App />);
  await screen.findByRole('alert');
  expect(screen.getByRole('status').textContent).toBe('');
  fireEvent.change(screen.getByLabelText('New task'), { target: { value: active.title } });
  fireEvent.click(screen.getByRole('button', { name: /Add task/ }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('');
  mutation.resolve(response(active));
  await screen.findByText(active.title);
  expect(screen.getByRole('status').textContent).toBe('');
});
