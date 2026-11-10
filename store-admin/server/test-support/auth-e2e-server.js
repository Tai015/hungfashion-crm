import express from 'express';
import { pool } from '../src/db.js';
import authRouter from '../src/routes/auth.js';

const app = express();
const port = Number(process.env.E2E_API_PORT || 5000);

app.use(express.json({ limit: '100kb' }));
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: true });
  } catch {
    res.status(503).json({ status: 'error', database: false });
  }
});
app.use('/api/auth', authRouter);

const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Auth E2E API listening on 127.0.0.1:${port}\n`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
