import catalog from './catalog.json' with { type: 'json' };
const allowedIds = new Set(catalog.map(x => x.id));
const origins = new Set(['https://tegroup.cc', 'https://www.tegroup.cc']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validate(value) {
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'event_id,offer_ids') return null;
  if (typeof value.event_id !== 'string' || !uuid.test(value.event_id) || !Array.isArray(value.offer_ids) || value.offer_ids.length < 1 || value.offer_ids.length > 30) return null;
  if (value.offer_ids.some(id => typeof id !== 'string' || !allowedIds.has(id))) return null;
  return { event_id: value.event_id, offer_ids: [...new Set(value.offer_ids)].sort() };
}
async function boundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('empty');
  let size = 0, chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw Error('too large'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
    const reply = status => new Response(null, { status, headers });
    if (new URL(request.url).pathname !== '/api/document-events') return reply(404);
    if (!origins.has(origin)) return reply(403);
    headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST'; headers['Access-Control-Allow-Headers'] = 'Content-Type';
      return reply(204);
    }
    if (request.method !== 'POST') return reply(405);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(415);
    let event;
    try { event = validate(await boundedJson(request)); } catch { return reply(400); }
    if (!event) return reply(400);
    if (!env.STATS_DB) return reply(503);
    const selection = JSON.stringify(event.offer_ids), day = new Date().toISOString().slice(0, 10);
    try {
      await env.STATS_DB.batch([
        env.STATS_DB.prepare('INSERT OR IGNORE INTO document_events(event_id, day, selection) VALUES (?, ?, ?)').bind(event.event_id, day, selection),
        ...event.offer_ids.map(id => env.STATS_DB.prepare('INSERT OR IGNORE INTO document_models(event_id, offer_id) SELECT event_id, ? FROM document_events WHERE event_id = ? AND selection = ?').bind(id, event.event_id, selection))
      ]);
      return reply(204);
    } catch { return reply(503); }
  }
};
