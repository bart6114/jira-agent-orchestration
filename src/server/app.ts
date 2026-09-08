import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function createApp(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0)');
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  const row = (value: Record<string, unknown>) => ({ ...value, completed: Boolean(value.completed) });
  app.get('/api/todos', (_req, res) => {
    res.json(db.prepare('SELECT * FROM todos ORDER BY rowid').all().map(row));
  });
  app.post('/api/todos', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 200) { res.status(400).json({ error: 'Use a title between 1 and 200 characters.' }); return; }
    const id = randomUUID();
    db.prepare('INSERT INTO todos (id, title) VALUES (?, ?)').run(id, title);
    res.status(201).json({ id, title, completed: false });
  });
  app.patch('/api/todos/:id', (req, res) => {
    if (typeof req.body?.completed !== 'boolean') { res.status(400).json({ error: 'completed must be a boolean.' }); return; }
    const result = db.prepare('UPDATE todos SET completed = ? WHERE id = ?').run(Number(req.body.completed), req.params.id);
    if (!result.changes) { res.status(404).json({ error: 'Task not found.' }); return; }
    res.json(row(db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id)!));
  });
  app.delete('/api/todos/:id', (req, res) => {
    const result = db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
    res.status(result.changes ? 204 : 404).end();
  });
  return { app, close: () => db.close() };
}
