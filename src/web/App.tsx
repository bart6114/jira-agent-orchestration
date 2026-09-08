import { useEffect, useState, type FormEvent } from 'react';
type Todo = { id: string; title: string; completed: boolean };
type Filter = 'All' | 'Active' | 'Completed';
async function request(path = '', options?: RequestInit) {
  const response = await fetch(`/api/todos${path}`, { ...options, headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error('Could not save your changes. Please try again.');
  return response.status === 204 ? null : response.json();
}
export function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<Filter>('All');
  const visibleTodos = todos.filter(todo => filter === 'All' || todo.completed === (filter === 'Completed'));
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { request().then(setTodos).catch(() => setError('Could not load tasks. Refresh to try again.')).finally(() => setLoading(false)); }, []);
  async function change(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    void change(async () => {
      const task = await request('', { method: 'POST', body: JSON.stringify({ title }) });
      setTodos(items => [...items, task]); setTitle('');
    });
  }
  return <main>
    <header><span className="mark" aria-hidden="true">s.</span><span>SMALL THINGS</span><span className="edition">A little room for progress</span></header>
    <section className="intro"><p className="eyebrow">ONE THING AT A TIME</p><h1>Make space<br/>for <em>what matters.</em></h1><p>A simple list. A clearer day.</p></section>
    <section className="tasks" aria-label="Your tasks">
      <div className="section-title"><h2>Your list</h2><span>KEEP IT SIMPLE</span></div>
      <form onSubmit={add}><label className="sr-only" htmlFor="title">New task</label><input id="title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="What would you like to get done?"/><button disabled={busy || loading || !title.trim()}>Add task <span aria-hidden="true">↗</span></button></form>
      {error && <p role="alert">{error}</p>}
      <div className="task-filters" role="group" aria-label="Filter tasks">
        {(['All', 'Active', 'Completed'] as const).map(option => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>{option}</button>)}
      </div>
      {loading ? <p className="empty">Loading your list…</p> : todos.length === 0 ? <p className="empty">A fresh start. Add your first task above.</p> : visibleTodos.length === 0 ? <p className="empty">{filter === 'Active' ? 'No active tasks.' : 'No completed tasks.'}</p> : <ul>{visibleTodos.map(todo => <li key={todo.id} className={todo.completed ? 'completed' : ''}>
        <label><input type="checkbox" checked={todo.completed} disabled={busy} onChange={() => void change(async () => { const updated = await request(`/${todo.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !todo.completed }) }); setTodos(items => items.map(t => t.id === todo.id ? updated : t)); })}/><span>{todo.title}</span></label>
        <button className="delete" disabled={busy} aria-label={`Delete ${todo.title}`} onClick={() => void change(async () => { await request(`/${todo.id}`, { method: 'DELETE' }); setTodos(items => items.filter(t => t.id !== todo.id)); })}>×</button>
      </li>)}</ul>}
    </section>
    <footer>Small steps count.<span>Built to grow, one task at a time.</span></footer>
  </main>;
}
