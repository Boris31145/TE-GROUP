import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import worker from '../server/document-stats/worker.mjs';
import {moscowDay} from '../server/document-stats/time.mjs';
import {periodFor,readReport} from '../server/document-stats/dashboard-report.mjs';
const NativeDate=Date;let clock='2026-10-31T20:59:59.999Z';
class TestDate extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return +new NativeDate(clock);}}
const db=new DatabaseSync(':memory:');
// Migrate a populated pre-MSK database without rewriting or recreating its rows.
const schema=fs.readFileSync(new URL('../server/document-stats/schema.sql',import.meta.url),'utf8');
db.exec(schema.replace(",\n  day_timezone TEXT NOT NULL DEFAULT 'UTC'",''));
const legacy=randomUUID(),offer='mass25:camry70-21';
db.prepare('INSERT INTO document_events VALUES(?,?,?)').run(legacy,'2026-10-24',JSON.stringify([offer]));
db.prepare('INSERT INTO document_models VALUES(?,?)').run(legacy,offer);
db.exec(fs.readFileSync(new URL('../server/document-stats/migrations/0001_moscow_days.sql',import.meta.url),'utf8'));
assert.equal(db.prepare('SELECT day_timezone FROM document_events').get().day_timezone,'UTC');
const env={STATS_DB:{prepare(sql){return{bind(...values){return{sql,values}}};},async batch(statements){db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.values)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}}};
const record=async id=>{const res=await worker.fetch(new Request('https://tegroup.cc/api/document-events',{method:'POST',headers:{Origin:'https://tegroup.cc','Content-Type':'application/json'},body:JSON.stringify({event_id:id,offer_ids:[offer]})}),env);assert.equal(res.status,204);};
const report=period=>readReport(env.STATS_DB,new URLSearchParams(period),new NativeDate(clock));
globalThis.Date=TestDate;
try{
 for(const [instant,day] of [
  ['2026-10-30T20:59:59.999Z','2026-10-30'],['2026-10-30T21:00:00.000Z','2026-10-31'],
  ['2026-10-31T20:59:59.999Z','2026-10-31'],['2026-10-31T21:00:00.000Z','2026-11-01'],
  ['2026-12-31T20:59:59.999Z','2026-12-31'],['2026-12-31T21:00:00.000Z','2027-01-01'],
  ['2028-02-28T21:00:00.000Z','2028-02-29'],['2028-02-29T21:00:00.000Z','2028-03-01']
 ]){
  clock=instant;const id=randomUUID();await record(id);assert.equal(moscowDay(),day);
  const before=db.prepare('SELECT * FROM document_events WHERE event_id=?').get(id);
  assert.equal(before.day,day);assert.equal(before.day_timezone,'Europe/Moscow');
  clock=new NativeDate(+new NativeDate(instant)+86400000).toISOString();
  await Promise.all([record(id),record(id),record(id)]);
  assert.deepEqual(db.prepare('SELECT * FROM document_events WHERE event_id=?').get(id),before);
 }
 // A retry of an old event also retains its historical date and marker.
 await record(legacy);assert.equal(db.prepare('SELECT day FROM document_events WHERE event_id=?').get(legacy).day,'2026-10-24');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM document_events').get().n,9);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM document_models').get().n,9);
 clock='2026-10-31T21:00:00.000Z';
 assert.equal(periodFor(new URLSearchParams('mode=day')).value,'2026-11-01');
 assert.equal(periodFor(new URLSearchParams()).value,'2026-11');
 const oct=await report('mode=month&period=2026-10'),nov=await report('mode=month&period=2026-11');
 assert.equal(oct.summary.period,4);assert.equal(nov.summary.period,1);
 assert.equal(nov.summary.today,1);assert.equal(nov.summary.month,1);
 assert.equal(oct.legacy.utc_day_only,1);assert.equal(oct.period.timezone,'Europe/Moscow');
 for(const month of ['2026-10','2026-11','2026-12','2027-01','2028-02','2028-03']){
  const m=await report('mode=month&period='+month);let sum=0;
  for(const {day,count} of m.series){const d=await report('mode=day&period='+day);assert.equal(d.summary.period,count);sum+=count;}
  assert.equal(sum,m.summary.period);assert.equal(m.models.reduce((n,r)=>n+r.count,0),sum);
 }
 // Run the actual dashboard script against a small DOM adapter and mocked network.
 const elements=new Map(),listeners={},timers=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',clientWidth:800,clientHeight:200,dataset:{},children:[],listeners:{},setAttribute(){},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]},checkValidity(){return !!this.value},addEventListener(k,f){this.listeners[k]=f}});return elements.get(id)};
 const queries=[];let pending=[];clock='2026-10-31T20:59:59.999Z';
 const context={Date:TestDate,Intl,URLSearchParams,AbortController,Blob,URL,console,setTimeout,clearTimeout,setInterval:f=>timers.push(f),ResizeObserver:class{observe(){}},document:{body:{dataset:{}},hidden:false,getElementById:element,querySelector:()=>element('periodLabel'),querySelectorAll:()=>[],createElement:tag=>element('created'+Math.random()),addEventListener:(k,f)=>listeners[k]=f},fetch:async url=>{queries.push(url);const p=report(url.split('?')[1]);pending.push(p);return{ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:()=>p};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../server/document-stats/dashboard/app.js',import.meta.url),'utf8'),context);
 const flush=async()=>{await Promise.all(pending);await new Promise(r=>setImmediate(r));pending=[]};await flush();
 assert.equal(element('period').value,'2026-10');element('modeDay').listeners.click();await flush();assert.equal(element('period').value,'2026-10-31');
 clock='2026-10-31T21:00:00.000Z';timers[0]();await flush();assert.equal(element('period').value,'2026-11-01');assert.match(element('todayDate').textContent,/1/);assert.match(element('updated').textContent,/00:00 МСК/);
 element('modeMonth').listeners.click();await flush();assert.equal(element('period').value,'2026-11');
 element('period').value='2026-10';element('period').listeners.change();await flush();clock='2026-11-30T21:00:00Z';timers[0]();await flush();assert.equal(element('period').value,'2026-10');
 assert.match(element('legacyNote').textContent,/1/);assert.equal(element('legacyNote').hidden,false);
 assert.ok(queries.some(q=>q.includes('period=2026-11-01')));
 console.log('PASS: MSK midnight, month/year/leap-day boundaries; day totals sum to month; retries keep first date; legacy rows retained; actual dashboard rollover and historical period selection.');
}finally{globalThis.Date=NativeDate;db.close();}
