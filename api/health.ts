import type { IncomingMessage, ServerResponse } from 'http';
import { handleHealth } from '../src/lib/serverAiHandlers';

export default function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse
) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  const result = handleHealth();
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.body));
}
