import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import worker from '../server/document-stats/worker.mjs';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('server/document-stats/catalog.json', root)));
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('server/document-stats/schema.sql', root), 'utf8'));
db.exec(fs.readFileSync(new URL('server/document-stats/model-report.sql', root), 'utf8'));
const env = { STATS_DB: {
  prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
  async batch(statements) {
    db.exec('BEGIN');
    try { for (const s of statements) db.prepare(s.sql).run(...s.values); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
} };
const event = { event_id: randomUUID(), offer_ids: [catalog[0].id, catalog[1].id] };
function request(body, origin='https://tegroup.cc', method='POST') {
  return new Request('https://tegroup.cc/api/document-events', { method, headers: { Origin: origin, 'Content-Type':'application/json' }, ...(method==='POST'?{body:JSON.stringify(body)}:{}) });
}
assert.equal((await worker.fetch(request(event), env)).status, 204);
assert.equal((await worker.fetch(request(event), env)).status, 204);
assert.equal(db.prepare('SELECT COUNT(*) n FROM document_events').get().n, 1);
assert.equal(db.prepare('SELECT COUNT(*) n FROM document_models').get().n, 2);
// Replayed ID with a different basket cannot add models to the old event.
await worker.fetch(request({...event,offer_ids:[catalog[2].id]}),env);
assert.equal(db.prepare('SELECT COUNT(*) n FROM document_models').get().n, 2);
assert.equal((await worker.fetch(request({...event,buyer:{name:'Do not collect'}}),env)).status,400);
assert.equal((await worker.fetch(request({...event,offer_ids:['invented']}),env)).status,400);
assert.equal((await worker.fetch(request({...event,event_id:'TE-CUSTOMER-CONTRACT'}),env)).status,400);
assert.equal((await worker.fetch(request(event,'https://example.test'),env)).status,403);
assert.equal((await worker.fetch(request(null,'https://tegroup.cc','GET'),env)).status,405);
assert.equal((await worker.fetch(request(event),{})).status,503);
assert.equal((await worker.fetch(request(null,'https://tegroup.cc','OPTIONS'),env)).status,204);
assert.equal((await worker.fetch(request({padding:'x'.repeat(5000)}),env)).status,400);
assert.equal(db.prepare('SELECT model FROM model_statistics WHERE offer_id=?').get(catalog[0].id).model,catalog[0].title);
assert.equal(db.prepare('SELECT COUNT(*) n FROM document_events').get().n,1);
const secondEvent={event_id:randomUUID(),offer_ids:[catalog[0].id,catalog[0].id]};
assert.equal((await worker.fetch(request(secondEvent),env)).status,204);
assert.equal(db.prepare('SELECT COUNT(*) n FROM document_events').get().n,2);
assert.equal(db.prepare('SELECT generated_document_sets FROM model_statistics WHERE offer_id=?').get(catalog[0].id).generated_document_sets,2);

const requests=[];
const ctx={location:{hostname:'tegroup.cc'},TEDocumentStatsEnabled:true,fetch:async (url,options)=>{requests.push({url,options});return{ok:true};},setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('assets/document-stats.js',root),'utf8'),ctx);
ctx.TEDocumentStats.record(event.event_id,[{id:catalog[0].id,buyer:{name:'Never sent'},vin:'Never sent'}]);
ctx.TEDocumentStats.record(event.event_id,[{id:catalog[0].id}]);
await new Promise(resolve=>setImmediate(resolve));
ctx.TEDocumentStats.record(event.event_id,[{id:catalog[0].id}]);
assert.equal(requests.length,1);
assert.deepEqual(JSON.parse(requests[0].options.body),{event_id:event.event_id,offer_ids:[catalog[0].id]});
assert.equal(requests[0].options.credentials,'omit');
ctx.TEDocumentStatsEnabled=false;
ctx.TEDocumentStats.record(randomUUID(),[{id:catalog[0].id}]);
assert.equal(requests.length,1);
console.log('Statistics: idempotent orders, multi-model counts, PII rejection, private reads and disabled-mode checks passed.');

// Production pages load the counter with SRI, preserve same-origin CSP and use no browser storage.
for(const page of ['cars/index.html','equipment/index.html']){
 const html=fs.readFileSync(new URL(page,root),'utf8');
 assert.match(html,/src="\/assets\/document-stats-config\.js\?v=[a-f0-9]+" integrity="sha384-/);
 assert.match(html,/src="\/assets\/document-stats\.js\?v=[a-f0-9]+" integrity="sha384-/);
 assert.match(html,/connect-src 'self' blob:/);
}
assert.doesNotMatch(fs.readFileSync(new URL('assets/document-stats.js',root),'utf8'),/localStorage|sessionStorage|document\.cookie/);
console.log('Statistics production wiring, named-model report, fresh orders and oversized-body checks passed.');

// New catalogue entries are accepted and repeated downloads do not create orders.
for(const offer of catalog.filter(o=>o.id.startsWith('exp24-')||o.id.startsWith('budget24-'))){
 const fresh={event_id:randomUUID(),offer_ids:[offer.id]};
 assert.equal((await worker.fetch(request(fresh),env)).status,204);
 assert.equal((await worker.fetch(request(fresh),env)).status,204);
 assert.equal(db.prepare('SELECT generated_document_sets FROM model_statistics WHERE offer_id=?').get(offer.id).generated_document_sets,1);
 assert.equal(db.prepare('SELECT model FROM model_statistics WHERE offer_id=?').get(offer.id).model,offer.title);
}
console.log('All added equipment and car models accepted with correct report names and duplicate suppression.');
