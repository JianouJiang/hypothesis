import { env } from 'cloudflare:workers';
import { Market } from '../../../lib/engine.js';

const allowedOrigins = new Set([
  'https://jianoujiang.github.io',
  'https://polymarket-physics.jianou-works.chatgpt.site',
]);

function headers(request: Request) {
  const origin = request.headers.get('Origin');
  const result: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
  if (origin && (allowedOrigins.has(origin) || origin === new URL(request.url).origin || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))) result['Access-Control-Allow-Origin'] = origin;
  return result;
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: { ...headers(request), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '3600' } });
}

async function handle(request: Request) {
  const responseHeaders = headers(request);
  const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: responseHeaders });
  if (request.headers.has('Origin') && !responseHeaders['Access-Control-Allow-Origin']) return json(403, { error: 'This market is not available from that origin.' });
  const route = new URL(request.url).pathname.split('/').pop();
  if (request.method === 'GET' && route !== 'session') return json(404, { error: 'Not found.' });
  if (request.method === 'POST' && !['order', 'cancel', 'reset'].includes(route || '')) return json(404, { error: 'Not found.' });
  if (!env.DB) return json(503, { error: 'The shared market is initializing. Please try again.' });
  const database = env.DB;
  let token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (token && !/^[a-f0-9]{48}$/.test(token)) token = '';
  let input: any = {};
  try {
    if (request.method === 'POST') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json(415, { error: 'Expected a JSON trade request.' });
      const body = await request.text();
      if (body.length > 4096) return json(413, { error: 'Request too large.' });
      input = JSON.parse(body);
      if (!token) return json(401, { error: 'Reconnect to restore your guest wallet.' });
    }
    // The seed never leaves the server. Rebuilding a state snapshot advances the
    // simulation to wall-clock time, including after an idle period or restart.
    for (let attempt = 0; attempt < 10; attempt++) {
      let row = await database.prepare('SELECT revision, state FROM markets WHERE id = ?').bind('bitcoin').first<{ revision: number; state: string }>();
      if (!row) {
        const initial = new Market();
        await database.prepare('INSERT OR IGNORE INTO markets (id, revision, state, updated) VALUES (?, 0, ?, ?)')
          .bind('bitcoin', JSON.stringify(initial.state), Date.now()).run();
        row = await database.prepare('SELECT revision, state FROM markets WHERE id = ?').bind('bitcoin').first<{ revision: number; state: string }>();
        if (!row) throw new Error('Market is initializing. Try again.');
      }
      const previousState = JSON.parse(row.state);
      const previousTick = previousState.round.lastTick;
      const previousRound = previousState.round.id;
      const market = new Market({ state: previousState });
      let created = false;
      if (!token || !Object.hasOwn(market.state.players, token)) {
        if (request.method === 'POST') return json(401, { error: 'Guest session expired. Refresh to reconnect.' });
        if (!token) token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
        market.addPlayer(token);
        created = true;
      }
      let result;
      if (request.method === 'POST') {
        if (route === 'order') result = market.place(token, input);
        if (route === 'cancel') market.cancel(token, input.orderId);
        if (route === 'reset') market.reset(token);
      }
      const snapshot = market.snapshot(token);
      const changed = created || request.method === 'POST' || previousTick !== market.state.round.lastTick || previousRound !== market.state.round.id;
      if (changed) {
        const update = await database.prepare('UPDATE markets SET state = ?, revision = revision + 1, updated = ? WHERE id = ? AND revision = ?')
          .bind(JSON.stringify(market.state), Date.now(), 'bitcoin', row.revision).run();
        // An overlapping trade won the race. Re-read and validate against its
        // committed balance/book. No side effects escape a losing transaction.
        if (update.meta.changes !== 1) continue;
      }
      return json(200, { token, transport: 'poll', result, snapshot });
    }
    return json(409, { error: 'The market is busy. Please try your order again.' });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : 'The request could not be completed.' });
  }
}

export const GET = handle;
export const POST = handle;
