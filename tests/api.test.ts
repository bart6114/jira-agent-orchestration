import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app';
describe('to-do API', () => {
  it('creates, completes, persists and deletes tasks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'todos-'));
    const file = join(dir, 'test.db');
    let server = createApp(file);
    try {
      const created = await request(server.app).post('/api/todos').send({ title: '  First task  ' }).expect(201);
      expect(created.body).toMatchObject({ title: 'First task', completed: false });
      await request(server.app).patch(`/api/todos/${created.body.id}`).send({ completed: true }).expect(200);
      server.close(); server = createApp(file);
      expect((await request(server.app).get('/api/todos')).body).toEqual([{ ...created.body, completed: true }]);
      await request(server.app).delete(`/api/todos/${created.body.id}`).expect(204);
      expect((await request(server.app).get('/api/todos')).body).toEqual([]);
    } finally { server.close(); rmSync(dir, { recursive: true }); }
  });
  it('rejects invalid changes and unknown tasks', async () => {
    const server = createApp();
    try {
      for (const title of ['', '   ', 'x'.repeat(201), 1]) await request(server.app).post('/api/todos').send({ title }).expect(400);
      await request(server.app).patch('/api/todos/missing').send({ completed: 'true' }).expect(400);
      await request(server.app).patch('/api/todos/missing').send({ completed: true }).expect(404);
      await request(server.app).delete('/api/todos/missing').expect(404);
    } finally { server.close(); }
  });
});
