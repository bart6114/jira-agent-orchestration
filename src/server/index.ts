import { mkdirSync } from 'node:fs';
import express from 'express';
import { createApp } from './app.js';
mkdirSync('data', { recursive: true });
const { app } = createApp(process.env.DATABASE_PATH || 'data/todos.db');
app.use(express.static('dist'));
const port = Number(process.env.PORT || 3001);
app.listen(port, '127.0.0.1', () => console.log(`Small Things: http://127.0.0.1:${port}`));
