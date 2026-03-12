/**
 * Outsiders Bot — Health Check Server
 *
 * Exposes GET /health for Docker/Railway probes and dashboard integration.
 */

import { createServer, type Server } from 'node:http';
import { log } from './logger.js';

const DEFAULT_PORT = 3001;

export interface HealthStats {
  startedAt: number;
  getStats?: () => Record<string, unknown>;
}

let server: Server | null = null;

export function startHealthServer(opts: HealthStats): void {
  const port = Number(process.env.HEALTH_PORT || process.env.PORT || DEFAULT_PORT);

  server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      const uptimeMs = Date.now() - opts.startedAt;
      const body = JSON.stringify({
        service: 'outsiders-bot',
        status: 'ok',
        uptime: `${Math.floor(uptimeMs / 1000)}s`,
        uptimeMs,
        ...opts.getStats?.(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    log.info('Health server listening on port %d', port);
  });

  server.on('error', (err) => {
    log.warn('Health server error: %s', err);
  });
}

export function stopHealthServer(): void {
  server?.close();
  server = null;
}
