import type { IncomingMessage, ServerResponse } from 'http';
import { handleReverseGeocode } from '../src/lib/serverAiHandlers';

export default async function handler(
  req: IncomingMessage & { method?: string; url?: string },
  res: ServerResponse
) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
  const lat = parsedUrl.searchParams.get('lat');
  const lon = parsedUrl.searchParams.get('lon');

  const result = await handleReverseGeocode(lat, lon);
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(JSON.stringify(result.body));
}
