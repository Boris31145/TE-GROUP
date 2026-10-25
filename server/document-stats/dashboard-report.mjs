import {moscowDay, REPORT_TIMEZONE} from './time.mjs';
import catalog from './catalog.json' with {type:'json'};
const mapping=JSON.stringify(catalog.map(x=>({id:x.id,model:x.title,year:x.year||null,type:x.asset_type==='car'?'car':x.asset_type==='product'?'product':'equipment'})));
export function periodFor(search, now=new Date()) {
 const mode=search.get('mode')||'month', today=moscowDay(now);
 const value=search.get('period')||(mode==='day'?today:today.slice(0,7));
 if(mode!=='day'&&mode!=='month')throw Error('Invalid mode');
 if(!(mode==='day'?/^20\d{2}-\d{2}-\d{2}$/:/^20\d{2}-\d{2}$/).test(value))throw Error('Invalid date');
 const from=mode==='day'?value:value+'-01';
 const date=new Date(from+'T00:00:00Z');
 if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==from)throw Error('Invalid date');
 const to=mode==='day'?from:new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
 return {mode,value,from,to,today,month:today.slice(0,7)+'-01',days:mode==='day'?1:Number(to.slice(-2))};
}
export async function readReport(db, search, now=new Date()) {
 const p=periodFor(search,now);
 const results=await db.batch([
  db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(day_timezone = 'UTC'),0) AS legacy_utc, MIN(day) AS first_day, COALESCE(SUM(day = ?),0) AS today, COALESCE(SUM(day >= ? AND day <= ?),0) AS month FROM document_events").bind(p.today,p.month,p.today),
  db.prepare('SELECT day, COUNT(*) AS count FROM document_events WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day').bind(p.from,p.to),
  db.prepare(`WITH names AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.model') AS model,json_extract(value,'$.year') AS year,json_extract(value,'$.type') AS type FROM json_each(?)) SELECT COALESCE(n.model,m.offer_id) AS model,COALESCE(n.type,'equipment') AS type,MIN(n.year) AS year_min,MAX(n.year) AS year_max,GROUP_CONCAT(DISTINCT m.offer_id) AS offer_ids,COUNT(DISTINCT e.event_id) AS count FROM document_models m JOIN document_events e USING(event_id) LEFT JOIN names n ON n.id=m.offer_id WHERE e.day >= ? AND e.day <= ? GROUP BY COALESCE(n.model,m.offer_id),COALESCE(n.type,'equipment') ORDER BY count DESC,model`).bind(mapping,p.from,p.to)
 ]);
 const summary=results[0].results[0];
 const byDay=new Map(results[1].results.map(x=>[x.day,Number(x.count)]));
 const series=Array.from({length:p.days},(_,i)=>{const day=p.mode==='day'?p.from:p.from.slice(0,8)+String(i+1).padStart(2,'0');return{day,count:byDay.get(day)||0};});
 const rows=results[2].results.map(x=>({id:x.offer_ids.split(',').sort().join(', '),offer_count:x.offer_ids.split(',').length,model:x.model,year:x.year_min===x.year_max?x.year_min:x.year_min+'–'+x.year_max,type:x.type,count:Number(x.count)}));
 return {period:{mode:p.mode,value:p.value,from:p.from,to:p.to,timezone:REPORT_TIMEZONE},updated_at:now.toISOString(),legacy:{utc_day_only:Number(summary.legacy_utc)},summary:{today:Number(summary.today),month:Number(summary.month),total:Number(summary.total),period:series.reduce((n,x)=>n+x.count,0),first_day:summary.first_day},series,models:rows};
}
