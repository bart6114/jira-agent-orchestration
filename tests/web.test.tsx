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

const mixedTasks = [
  { id: '1', title: 'Read a book', completed: false },
  { id: '2', title: 'Water plants', completed: true },
  { id: '3', title: 'Take a walk', completed: false },
  { id: '4', title: 'Send a letter', completed: true },
];
function selectFilter(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}
function expectSelected(name: string) {
  expect(screen.getByRole('group', { name: 'Filter tasks' })).toBeTruthy();
  expect(screen.getAllByRole('button', { pressed: true })).toEqual([
    screen.getByRole('button', { name }),
  ]);
  expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2);
}
function visibleTitles() {
  return screen.queryAllByRole('checkbox').map(input => input.closest('label')?.textContent);
}
it('defaults to All and switches locally without losing tasks or their order', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => mixedTasks });
  vi.stubGlobal('fetch', fetcher);
  const view = render(<App />);
  expect(screen.getByText('Loading your list…')).toBeTruthy();
  await screen.findByText('Read a book');
  expectSelected('All');
  expect(visibleTitles()).toEqual(mixedTasks.map(task => task.title));
  const calls = fetcher.mock.calls.length;
  selectFilter('Active');
  expectSelected('Active');
  expect(visibleTitles()).toEqual(['Read a book', 'Take a walk']);
  selectFilter('Completed');
  expectSelected('Completed');
  expect(visibleTitles()).toEqual(['Water plants', 'Send a letter']);
  selectFilter('All');
  expectSelected('All');
  expect(visibleTitles()).toEqual(mixedTasks.map(task => task.title));
  expect(fetcher).toHaveBeenCalledTimes(calls);
  selectFilter('Completed');
  view.unmount();
  render(<App />);
  await screen.findByText('Read a book');
  expectSelected('All');
  expect(visibleTitles()).toEqual(mixedTasks.map(task => task.title));
});

it.each([
  { filter: 'Active', opposite: 'Completed', completed: false, empty: 'No active tasks.' },
  { filter: 'Completed', opposite: 'Active', completed: true, empty: 'No completed tasks.' },
])('updates visibility in $filter only after a successful PATCH', async ({ filter, opposite, completed, empty }) => {
  const task = { id: '1', title: 'Read a book', completed };
  let finish!: (response: unknown) => void;
  const response = new Promise(resolve => { finish = resolve; });
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [task] })
    .mockReturnValueOnce(response);
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText(task.title);
  selectFilter(filter);
  fireEvent.click(screen.getByRole('checkbox', { name: task.title }));
  expect(screen.getByText(task.title)).toBeTruthy();
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(completed);
  expect(fetcher).toHaveBeenLastCalledWith('/api/todos/1', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ completed: !completed }),
  }));
  finish({ ok: true, json: async () => ({ ...task, completed: !completed }) });
  await screen.findByText(empty);
  expect(screen.queryByText(task.title)).toBeNull();
  expectSelected(filter);
  selectFilter(opposite);
  expect((screen.getByRole('checkbox', { name: task.title }) as HTMLInputElement).checked).toBe(!completed);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([false, true])('retains state and visibility on a failed PATCH (completed=%s)', async completed => {
  const task = { id: '1', title: 'Read a book', completed };
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [task] })
    .mockResolvedValueOnce({ ok: false });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText(task.title);
  const filter = completed ? 'Completed' : 'Active';
  selectFilter(filter);
  fireEvent.click(screen.getByRole('checkbox'));
  expect((await screen.findByRole('alert')).textContent).toBe('Could not save your changes. Please try again.');
  expect((screen.getByRole('checkbox', { name: task.title }) as HTMLInputElement).checked).toBe(completed);
  expectSelected(filter);
  selectFilter(completed ? 'Active' : 'Completed');
  expect(screen.queryByText(task.title)).toBeNull();
  selectFilter('All');
  expect(visibleTitles()).toEqual([task.title]);
});

it('keeps Completed selected while adding and deleting, with appropriate empty messages', async () => {
  const task = { id: '1', title: 'Read a book', completed: false };
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, json: async () => task })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...task, completed: true }) })
    .mockResolvedValueOnce({ ok: true, status: 204 });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText(/A fresh start/);
  selectFilter('Completed');
  expect(screen.getByText(/A fresh start/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('New task'), { target: { value: task.title } });
  fireEvent.click(screen.getByRole('button', { name: /Add task/ }));
  await screen.findByText('No completed tasks.');
  expectSelected('Completed');
  expect(screen.queryByRole('checkbox')).toBeNull();
  selectFilter('All');
  expect(visibleTitles()).toEqual([task.title]);
  selectFilter('Active');
  expect(visibleTitles()).toEqual([task.title]);
  fireEvent.click(screen.getByRole('checkbox'));
  await screen.findByText('No active tasks.');
  selectFilter('Completed');
  fireEvent.click(screen.getByRole('button', { name: `Delete ${task.title}` }));
  await screen.findByText(/A fresh start/);
  expectSelected('Completed');
  selectFilter('All');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(4);
});
