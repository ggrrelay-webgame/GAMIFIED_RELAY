import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadDatabase, mergeDatabase, resetDatabase, syncEventEmitter } from './server/syncStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = express();

app.use(express.json({ limit: '10mb' }));

// CORS & Mobile Host headers
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Basic health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Gamified Grammar Relay', timestamp: new Date().toISOString() });
});

// Real-Time Server-Sent Events (SSE) Stream for Standing Desk & All Groups
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  const db = loadDatabase();
  res.write(
    `data: ${JSON.stringify({
      type: 'init',
      appState: db.appState,
      logData: db.logData,
      lastUpdated: db.lastUpdated,
    })}\n\n`
  );

  const onSync = (data: any) => {
    try {
      res.write(
        `data: ${JSON.stringify({
          type: 'sync',
          appState: data.appState,
          logData: data.logData,
          lastUpdated: data.lastUpdated,
        })}\n\n`
      );
    } catch {
      // client disconnected
    }
  };

  syncEventEmitter.on('sync', onSync);

  const pinger = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pinger);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pinger);
    syncEventEmitter.off('sync', onSync);
  });
});

// Multi-phone synchronization endpoints
app.get('/api/sync', (_req, res) => {
  const db = loadDatabase();
  res.json({
    success: true,
    appState: db.appState,
    logData: db.logData,
    surveys: db.appState.surveyResponses || [],
    lastUpdated: db.lastUpdated,
  });
});

app.post('/api/sync', (req, res) => {
  try {
    const updated = mergeDatabase(req.body || {});
    res.json({
      success: true,
      appState: updated.appState,
      logData: updated.logData,
      surveys: updated.appState.surveyResponses || [],
      lastUpdated: updated.lastUpdated,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Sync failed' });
  }
});

app.get('/api/state', (_req, res) => {
  const db = loadDatabase();
  res.json(db.appState);
});

app.post('/api/state', (req, res) => {
  try {
    const updated = mergeDatabase({ clientState: req.body });
    res.json(updated.appState);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Update state failed' });
  }
});

app.get('/api/logs', (_req, res) => {
  const db = loadDatabase();
  res.json(db.logData);
});

app.post('/api/logs', (req, res) => {
  try {
    const newLogs = Array.isArray(req.body) ? req.body : req.body?.logs || [];
    const updated = mergeDatabase({ newLogs });
    res.json(updated.logData);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Log submission failed' });
  }
});

app.post('/api/reset', (req, res) => {
  try {
    const updated = resetDatabase(req.body?.appState, req.body?.logData);
    res.json({
      success: true,
      appState: updated.appState,
      logData: updated.logData,
      lastUpdated: updated.lastUpdated,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Reset failed' });
  }
});

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

  if (hasDist) {
    // Production mode on Render: Serve pre-built static files from dist
    console.log('[SERVER] Serving production static files from dist/');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Development mode: Mount Vite middleware with allowedHosts: true
    console.log('[SERVER] dist/ not found, mounting Vite middleware mode...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Gamified Grammar Relay running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
