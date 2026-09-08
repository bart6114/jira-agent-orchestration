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
  { id: '1', title: 'First active', completed: false },
  { id: '2', title: 'First completed', completed: true },
  { id: '3', title: 'Second active', completed: false },
  { id: '4', title: 'Second completed', completed: true },
];
const response = (value: unknown) => ({ ok: true, json: async () => value });
function selectFilter(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}
function expectSelected(name: string) {
  expect(screen.getAllByRole('button', { pressed: true })).toEqual([
    screen.getByRole('button', { name }),
  ]);
}
function visibleTitles() {
  return screen.queryAllByRole('checkbox').map(input => input.closest('label')?.textContent);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
it('filters locally in original order without losing tasks and resets to All on remount', async () => {
  const fetcher = vi.fn().mockImplementation(async () => response(mixedTasks));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<App />);
  await screen.findByText('First active');
  expectSelected('All');
  expect(screen.getByRole('group', { name: 'Filter tasks' })).toBeTruthy();
  expect(visibleTitles()).toEqual(mixedTasks.map(task => task.title));
  selectFilter('Active');
  expectSelected('Active');
  expect(visibleTitles()).toEqual(['First active', 'Second active']);
  selectFilter('Completed');
  expectSelected('Completed');
  expect(visibleTitles()).toEqual(['First completed', 'Second completed']);
  selectFilter('All');
  expect(visibleTitles()).toEqual(mixedTasks.map(task => task.title));
  expect(fetcher).toHaveBeenCalledTimes(1);
  selectFilter('Completed');
  view.unmount();
  render(<App />);
  await screen.findByText('First active');
  expectSelected('All');
  expect(visibleTitles()).toEqual(mixedTasks.map(task => task.title));
});
it('preserves loading and whole-list empty messages under every filter', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
  render(<App />);
  for (const filter of ['All', 'Active', 'Completed']) {
    selectFilter(filter);
    expect(screen.getByText('Loading your list…')).toBeTruthy();
    expect(screen.queryByText(/No (active|completed) tasks/)).toBeNull();
  }
  pending.resolve(response([]));
  await screen.findByText('A fresh start. Add your first task above.');
  for (const filter of ['All', 'Active', 'Completed']) {
    selectFilter(filter);
    expect(screen.getByText('A fresh start. Add your first task above.')).toBeTruthy();
  }
});
it.each(['Active', 'Completed'])('waits for PATCH success before removing a task from %s', async filter => {
  const completed = filter === 'Completed';
  const task = { id: '1', title: 'Changing task', completed };
  const pending = deferred<ReturnType<typeof response>>();
  const fetcher = vi.fn().mockResolvedValueOnce(response([task])).mockReturnValueOnce(pending.promise);
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText(task.title);
  selectFilter(filter);
  fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(completed);
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  expect(fetcher).toHaveBeenLastCalledWith('/api/todos/1', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ completed: !completed }),
  }));
  pending.resolve(response({ ...task, completed: !completed }));
  await screen.findByText(`No ${filter.toLowerCase()} tasks.`);
  expect(screen.queryByText(task.title)).toBeNull();
  expectSelected(filter);
  selectFilter(completed ? 'Active' : 'Completed');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(!completed);
  selectFilter('All');
  expect(visibleTitles()).toEqual([task.title]);
});
it.each([
  ['Active', 'http'], ['Active', 'network'],
  ['Completed', 'http'], ['Completed', 'network'],
])('preserves task and selected %s filter after a %s PATCH failure', async (filter, failure) => {
  const completed = filter === 'Completed';
  const fetcher = vi.fn().mockResolvedValueOnce(response([{ id: '1', title: 'Keep me', completed }]));
  if (failure === 'http') fetcher.mockResolvedValueOnce({ ok: false });
  else fetcher.mockRejectedValueOnce(new Error('offline'));
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText('Keep me');
  selectFilter(filter);
  fireEvent.click(screen.getByRole('checkbox'));
  expect((await screen.findByRole('alert')).textContent).toContain(failure === 'http' ? 'Could not save' : 'offline');
  expectSelected(filter);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(completed);
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false);
  selectFilter('All');
  expect(visibleTitles()).toEqual(['Keep me']);
});
it.each(['Active', 'Completed'])('retains %s while adding and deleting, including the last task', async filter => {
  const original = { id: '1', title: 'Original', completed: filter === 'Completed' };
  const added = { id: '2', title: 'Added', completed: false };
  const deletion = deferred<{ ok: boolean; status: number }>();
  const fetcher = vi.fn().mockResolvedValueOnce(response([original]))
    .mockResolvedValueOnce(response(added)).mockReturnValueOnce(deletion.promise)
    .mockResolvedValueOnce({ ok: true, status: 204 });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByText('Original');
  selectFilter(filter);
  fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Added' } });
  fireEvent.click(screen.getByRole('button', { name: /Add task/ }));
  await waitFor(() => expect((screen.getByLabelText('New task') as HTMLInputElement).value).toBe(''));
  expectSelected(filter);
  expect(visibleTitles()).toEqual(filter === 'Active' ? ['Original', 'Added'] : ['Original']);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Original' }));
  expect(screen.getByText('Original')).toBeTruthy();
  deletion.resolve({ ok: true, status: 204 });
  await waitFor(() => expect(screen.queryByText('Original')).toBeNull());
  expectSelected(filter);
  if (filter === 'Completed') expect(screen.getByText('No completed tasks.')).toBeTruthy();
  selectFilter('All');
  expect(visibleTitles()).toEqual(['Added']);
  selectFilter('Active');
  fireEvent.click(screen.getByRole('button', { name: 'Delete Added' }));
  await screen.findByText('A fresh start. Add your first task above.');
  expectSelected('Active');
  selectFilter('Completed');
  expect(screen.getByText('A fresh start. Add your first task above.')).toBeTruthy();
});
