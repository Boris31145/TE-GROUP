(()=>{'use strict';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('ru-RU');
const moscowDay=(now=new Date())=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
const today=()=>moscowDay();
let followCurrent=true;
const currentPeriod=()=>['day','week'].includes(mode)?today():today().slice(0,7);
let mode='month',category='all',data=null,sequence=0,controller=null;
$('logout').addEventListener('click',async()=>{try{const res=await fetch('/owner/statistics/logout',{method:'POST',credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error();location.replace('/owner/statistics/login');}catch{setError('Не удалось выйти. Повторите попытку.');}});
$('period').value=today().slice(0,7);
const shiftDay=(day,offset)=>new Date(+new Date(day+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
$('rangeFrom').value=shiftDay(today(),-6);$('rangeTo').value=today();
function queryFor(){return mode==='range'?{mode,from:$('rangeFrom').value,to:$('rangeTo').value}:{mode,period:$('period').value};}
function reportMatches(){const q=queryFor();return data&&data.period.mode===mode&&(mode==='range'?data.period.from===q.from&&data.period.to===q.to:data.period.value===q.period);}
const dateText=(day,opts={day:'numeric',month:'long'})=>new Intl.DateTimeFormat('ru-RU',{...opts,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
$('todayDate').textContent=dateText(today(),{day:'numeric',month:'short'});
$('monthName').textContent=dateText(today(),{month:'long'});
function setError(message,login=false){$('error').hidden=!message;$('errorText').textContent=message||'';$('relogin').hidden=!login;$('retry').hidden=login;document.body.dataset.stale=String(!!message);}
function filtered(){const query=$('search').value.trim().toLocaleLowerCase('ru');return(data?.models||[]).filter(x=>(category==='all'||x.type===category)&&(!query||(x.model+' '+x.id+' '+(x.year||'')).toLocaleLowerCase('ru').includes(query)));}
function renderModels(){
 const rows=filtered();$('modelRows').replaceChildren();
 for(const [i,row] of rows.entries()){
  const tr=document.createElement('tr'),td=document.createElement('td'),cell=document.createElement('div');cell.className='model-cell';
  const rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');cell.append(rank);
  const name=document.createElement('div'),title=document.createElement('span'),meta=document.createElement('span');title.className='model-name';title.textContent=row.model;meta.className='model-meta';meta.textContent=[row.year,row.type==='car'?'Автомобиль':row.type==='product'?'Товар':'Оборудование',row.offer_count>1?row.offer_count+' предложения':null].filter(Boolean).join(' · ');name.append(title,meta);cell.append(name);td.append(cell);
  const type=document.createElement('td');type.className='type-label';type.textContent=row.type==='car'?'Автомобили':row.type==='product'?'Дооснащение и товары':'Оборудование';const count=document.createElement('td');count.className='number';count.textContent=fmt.format(row.count);tr.append(td,type,count);$('modelRows').append(tr);
 }
 $('empty').hidden=rows.length>0;
 const actualEmpty=data&&data.models.length===0;
 $('emptyTitle').textContent=actualEmpty?'Пока нет оформлений':'Модели не найдены';
 $('emptyText').textContent=actualEmpty?'За выбранный период комплекты ещё не формировали. Новые оформления появятся здесь автоматически.':'Попробуйте другое название или выберите категорию «Все».';
 $('modelCount').textContent='Показано моделей: '+rows.length+' из '+(data?.models.length||0)+'. Количество относится к выбранному периоду.';
 $('export').disabled=!rows.length||!reportMatches()||document.body.dataset.loading==='true';
}
function renderChart(){
 let rows=data.series;const monthly=rows.length>90;if(monthly){const buckets=new Map();for(const row of rows){const day=row.day.slice(0,7)+'-01';buckets.set(day,(buckets.get(day)||0)+row.count);}rows=[...buckets].map(([day,count])=>({day,count}));}
 const width=Math.max(220,$('chart').clientWidth),height=$('chart').clientHeight,left=30,right=8,top=15,bottom=30,max=Math.max(1,...rows.map(x=>x.count)),usable=height-top-bottom,step=(width-left-right)/rows.length,bar=Math.min(46,step*.62),labelEvery=Math.max(1,Math.ceil(rows.length/Math.max(2,Math.floor((width-left-right)/55))));
 const todayValue=today();let svg='<svg viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" aria-hidden="true">';
 for(const tick of (max===1?[1,0]:[max,Math.ceil(max/2),0])){const y=top+usable*(1-tick/max);svg+='<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y+'" y2="'+y+'"/><text x="0" y="'+(y+4)+'">'+tick+'</text>';}
 for(const [i,row] of rows.entries()){const h=row.count/max*usable,x=left+step*i+(step-bar)/2,y=top+usable-h;svg+='<rect class="bar '+(row.day===todayValue?'bar-today':'')+'" x="'+x+'" y="'+y+'" width="'+bar+'" height="'+h+'" rx="2"><title>'+row.day+': '+row.count+'</title></rect>';if(rows.length===1||i===0||i===rows.length-1||(i%labelEvery===0&&i<rows.length-labelEvery))svg+='<text x="'+(x+bar/2)+'" y="'+(height-6)+'" text-anchor="middle">'+(monthly?row.day.slice(5,7)+'.'+row.day.slice(2,4):['range','week'].includes(data.period.mode)?row.day.slice(8)+'.'+row.day.slice(5,7):Number(row.day.slice(-2)))+'</text>';}
 $('chart').innerHTML=svg+'</svg>';
 $('chart').setAttribute('aria-label',rows.map(x=>dateText(x.day,monthly?{month:'long',year:'numeric'}:undefined)+': '+x.count+' оформлений').join('; '));
 $('chartTitle').textContent=data.period.mode==='day'?'Оформления за день':monthly?'Оформления по месяцам':'Оформления по дням';
 $('chartNote').textContent=data.summary.period===0?'За этот период оформлений пока нет.':'Московское время (UTC+3). Повторные скачивания и два счёта не увеличивают число оформлений.';
}
function render(){
 const reportDay=moscowDay(new Date(data.updated_at));
 $('todayDate').textContent=dateText(reportDay,{day:'numeric',month:'short'});
 $('monthName').textContent=dateText(reportDay,{month:'long'});
 $('legacyNote').hidden=!data.legacy?.utc_day_only;
 $('legacyNote').textContent='Оформлений до перехода на МСК: '+fmt.format(data.legacy?.utc_day_only||0)+'. Для них сохранены прежние даты UTC: точное время ранее не записывалось.';
 $('todayTotal').textContent=fmt.format(data.summary.today);$('monthTotal').textContent=fmt.format(data.summary.month);$('periodTotal').textContent=fmt.format(data.summary.period);
 $('periodCaption').textContent=['range','week'].includes(data.period.mode)?dateText(data.period.from,{day:'numeric',month:'short',year:'numeric'})+' — '+dateText(data.period.to,{day:'numeric',month:'short',year:'numeric'}):data.period.mode==='day'?dateText(data.period.from):dateText(data.period.from,{month:'long',year:'numeric'});
 $('periodSubtitle').textContent='за выбранный '+(data.period.mode==='day'?'день':data.period.mode==='month'?'месяц':'период');
 const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(data.updated_at));$('updated').textContent='Обновлено в '+time+' МСК';
 renderChart();renderModels();
}
async function load(){
 const current=++sequence;controller?.abort();document.body.dataset.loading='false';
 $('export').disabled=true;
 if(followCurrent&&mode!=='range')$('period').value=currentPeriod();
 if(mode==='range'){
  if(!$('rangeFrom').value||!$('rangeTo').value||!$('rangeFrom').checkValidity()||!$('rangeTo').checkValidity()){setError('Укажите обе даты периода.');return;}
  if($('rangeFrom').value>$('rangeTo').value){setError('Дата начала должна быть не позже даты окончания.');return;}
 }else if(!$('period').value||!$('period').checkValidity()){setError('Выберите корректную дату.');return;}
 const active=new AbortController();controller=active;document.body.dataset.loading='true';
 const timer=setTimeout(()=>active.abort(),15000);
 try{
  const response=await fetch('/owner/statistics/report?'+new URLSearchParams(queryFor()),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:active.signal});
  if(current!==sequence)return;
  if(response.status===401||response.status===403){setError('Сессия завершилась. Войдите снова, чтобы увидеть статистику.',true);return;}
  if(!response.ok)throw Error('status');
  if(!response.headers.get('content-type')?.includes('application/json')){setError('Для просмотра статистики нужно войти снова.',true);return;}
  const fresh=await response.json();if(current!==sequence)return;data=fresh;setError('');render();
 }catch(e){if(current===sequence){setError(data?'Не удалось обновить. Ниже показаны данные на момент последнего успешного обновления.':'Не удалось загрузить статистику. Проверьте соединение или войдите снова.');$('relogin').hidden=false;$('updated').textContent=data?'Данные не обновлены':'Нет соединения';}}
 finally{clearTimeout(timer);if(current===sequence){document.body.dataset.loading='false';if(data)renderModels();}}
}
function setMode(next){
 if(mode===next)return;
 const previous=mode,old=$('period').value;mode=next;
 for(const [name,id] of [['day','modeDay'],['week','modeWeek'],['month','modeMonth'],['range','modeRange']])$(id).setAttribute('aria-pressed',String(mode===name));
 $('rangeControl').hidden=mode!=='range';$('period').parentElement.hidden=mode==='range';
 if(mode==='range'){
  if(data&&previous!=='range'){$('rangeFrom').value=data.period.from;$('rangeTo').value=data.period.to;}
  followCurrent=false;
 }else{
  const anchor=previous==='range'?$('rangeTo').value:previous==='month'?(old===today().slice(0,7)?today():old+'-01'):old;
  $('period').type=mode==='month'?'month':'date';$('period').value=mode==='month'?anchor.slice(0,7):anchor;
  document.querySelector('label[for="period"]').textContent=mode==='day'?'Выберите день':mode==='week'?'7 дней по':'Выберите месяц';
  followCurrent=$('period').value===currentPeriod();
 }
 void load();
}
for(const [name,id] of [['day','modeDay'],['week','modeWeek'],['month','modeMonth'],['range','modeRange']])$(id).addEventListener('click',()=>setMode(name));
$('period').addEventListener('change',()=>{followCurrent=$('period').value===currentPeriod();void load();});
for(const id of ['rangeFrom','rangeTo'])$(id).addEventListener('change',()=>{followCurrent=false;void load();});
$('refresh').addEventListener('click',()=>void load());$('retry').addEventListener('click',()=>void load());$('search').addEventListener('input',renderModels);
for(const button of document.querySelectorAll('[data-type]'))button.addEventListener('click',()=>{category=button.dataset.type;for(const b of document.querySelectorAll('[data-type]'))b.setAttribute('aria-pressed',String(b===button));renderModels();});
$('export').addEventListener('click',()=>{if(!data||!reportMatches()||$('export').disabled)return;const quote=x=>'"'+String(x??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"';const rows=[['Период с (МСК)','Период по (МСК)','Модель','Код предложения','Категория','Оформлений'],...filtered().map(x=>[data.period.from,data.period.to,x.model,x.id,x.type==='car'?'Автомобили':x.type==='product'?'Дооснащение и товары':'Оборудование',x.count])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='TE-GROUP-statistics-'+(data.period.mode==='week'?'week-'+data.period.from+'_'+data.period.to:data.period.value)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
new ResizeObserver(()=>{if(data)renderChart();}).observe($('chart'));
setInterval(()=>{if(!document.hidden)void load();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});void load();
})();
