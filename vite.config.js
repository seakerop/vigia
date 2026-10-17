import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { yahooProxy } from './api/_lib/yahoo.js';
import storeHandler from './api/store.js';

// En dev, el mismo código de api/ sirve /api/yahoo y /api/store desde el dev
// server (en producción lo hacen las funciones de Vercel). VIGIA_DEV deja
// pasar sin token cuando no hay VIGIA_TOKEN configurado en local.
process.env.VIGIA_DEV = '1';

// Adapta un handler estilo Vercel (req.query, req.body, res.status().json())
// al middleware de connect que usa el dev server.
function adapt(handler) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    req.query = Object.fromEntries(url.searchParams);
    if (req.method !== 'GET') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }
    }
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
    };
    await handler(req, res);
  };
}

function apiMiddleware() {
  return {
    name: 'vigia-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/yahoo', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const data = await yahooProxy(Object.fromEntries(url.searchParams));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(e.message || e) }));
        }
      });
      server.middlewares.use('/api/store', adapt(storeHandler));
    },
  };
}

export default defineConfig({
  plugins: [react(), apiMiddleware()],
  server: { port: 5176, strictPort: true },
});
