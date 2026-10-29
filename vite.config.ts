import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'url';
import { loadDatabase, mergeDatabase, resetDatabase, syncEventEmitter } from './server/syncStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function apiSyncPlugin(): Plugin {
  return {
    name: 'api-sync-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api')) {
          return next();
        }

        // Set JSON & CORS headers for mobile clients
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        const pathname = url.split('?')[0];

        // Real-Time Server-Sent Events (SSE) Stream for Standing Desk & All Groups
        if (pathname === '/api/events') {
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
              // ignore write if closed
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
          return;
        }

        if (pathname === '/api/health') {
          res.statusCode = 200;
          return res.end(JSON.stringify({ status: 'ok', app: 'Gamified Grammar Relay' }));
        }

        if (pathname === '/api/sync' || pathname === '/api/state' || pathname === '/api/logs') {
          if (req.method === 'GET') {
            const db = loadDatabase();
            if (pathname === '/api/state') {
              res.statusCode = 200;
              return res.end(JSON.stringify(db.appState));
            }
            if (pathname === '/api/logs') {
              res.statusCode = 200;
              return res.end(JSON.stringify(db.logData));
            }
            res.statusCode = 200;
            return res.end(
              JSON.stringify({
                success: true,
                appState: db.appState,
                logData: db.logData,
                surveys: db.appState.surveyResponses || [],
                lastUpdated: db.lastUpdated,
              })
            );
          }

          if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', (chunk) => {
              bodyStr += chunk;
            });
            req.on('end', () => {
              try {
                const payload = bodyStr ? JSON.parse(bodyStr) : {};
                const updated = mergeDatabase(payload);
                res.statusCode = 200;
                return res.end(
                  JSON.stringify({
                    success: true,
                    appState: updated.appState,
                    logData: updated.logData,
                    surveys: updated.appState.surveyResponses || [],
                    lastUpdated: updated.lastUpdated,
                  })
                );
              } catch (err: any) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: err?.message || 'Invalid JSON' }));
              }
            });
            return;
          }
        }

        if (pathname === '/api/reset' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', () => {
            try {
              const payload = bodyStr ? JSON.parse(bodyStr) : {};
              const updated = resetDatabase(payload.appState, payload.logData);
              res.statusCode = 200;
              return res.end(
                JSON.stringify({
                  success: true,
                  appState: updated.appState,
                  logData: updated.logData,
                  surveys: updated.appState.surveyResponses || [],
                  lastUpdated: updated.lastUpdated,
                })
              );
            } catch (err: any) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: err?.message || 'Invalid JSON' }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  return {
    base: '/',
    plugins: [react(), tailwindcss(), apiSyncPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // Allow all hosts so Render (*.onrender.com) and mobile devices are never blocked
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: '0.0.0.0',
      port: port,
      allowedHosts: true as const,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
