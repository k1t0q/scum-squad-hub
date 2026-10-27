import { verifySession } from './session-auth.mjs';
// Isolated SCUM HUB migration Worker. Never expose squad records without verified sessions.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (request.method === 'GET' && url.pathname === '/health') {
      try {
        const result = await env.DB.prepare('SELECT 1 AS ok').first();
        return new Response(JSON.stringify({ service: 'scum-hub-migration', database: result?.ok === 1 ? 'ok' : 'unavailable' }), { status: result?.ok === 1 ? 200 : 503, headers });
      } catch {
        return new Response(JSON.stringify({ service: 'scum-hub-migration', database: 'unavailable' }), { status: 503, headers });
      }
    }
    if (url.pathname.startsWith('/api/')) {
      const identity = await verifySession(request, env);
      if (!identity) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
      return new Response(JSON.stringify({ error: 'not_implemented', message: 'Squad authorization is not yet enabled' }), { status: 501, headers });
    }
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });
  }
};
