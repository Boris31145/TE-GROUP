(()=>{'use strict';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('ru-RU');
const today=()=>new Date().toISOString().slice(0,10);
let mode='month',category='all',data=null,sequence=0,controller=null;
$('logout').addEventListener('click',async()=>{try{const res=await fetch('/owner/statistics/logout',{method:'POST',credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error();location.replace('/owner/statistics/login');}catch{setError('Не удалось выйти. Повторите попытку.');}});
$('period').value=today().slice(0,7);
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
  const name=document.createElement('div'),title=document.createElement('span'),meta=document.createElement('span');title.className='model-name';title.textContent=row.model;meta.className='model-meta';meta.textContent=[row.year,row.type==='car'?'Автомобиль':'Оборудование',row.offer_count>1?row.offer_count+' предложения':null].filter(Boolean).join(' · ');name.append(title,meta);cell.append(name);td.append(cell);
  const type=document.createElement('td');type.className='type-label';type.textContent=row.type==='car'?'Автомобили':'Оборудование';const count=document.createElement('td');count.className='number';count.textContent=fmt.format(row.count);tr.append(td,type,count);$('modelRows').append(tr);
 }
 $('empty').hidden=rows.length>0;
 const actualEmpty=data&&data.models.length===0;
 $('emptyTitle').textContent=actualEmpty?'Пока нет оформлений':'Модели не найдены';
 $('emptyText').textContent=actualEmpty?'За выбранный период комплекты ещё не формировали. Новые оформления появятся здесь автоматически.':'Попробуйте другое название или выберите категорию «Все».';
 $('modelCount').textContent='Показано моделей: '+rows.length+' из '+(data?.models.length||0)+'. Количество относится к выбранному периоду.';
 $('export').disabled=!rows.length;
}
function renderChart(){
 const rows=data.series, width=Math.max(280,$('chart').clientWidth),height=$('chart').clientHeight,left=30,right=8,top=15,bottom=30,max=Math.max(1,...rows.map(x=>x.count)),usable=height-top-bottom,step=(width-left-right)/rows.length,bar=Math.min(46,step*.62);
 const todayValue=today();let svg='<svg viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" aria-hidden="true">';
 for(const tick of (max===1?[1,0]:[max,Math.ceil(max/2),0])){const y=top+usable*(1-tick/max);svg+='<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y+'" y2="'+y+'"/><text x="0" y="'+(y+4)+'">'+tick+'</text>';}
 for(const [i,row] of rows.entries()){const h=row.count/max*usable,x=left+step*i+(step-bar)/2,y=top+usable-h;svg+='<rect class="bar '+(row.day===todayValue?'bar-today':'')+'" x="'+x+'" y="'+y+'" width="'+bar+'" height="'+h+'" rx="2"><title>'+row.day+': '+row.count+'</title></rect>';if(rows.length===1||i===0||i===rows.length-1||(i+1)%5===0)svg+='<text x="'+(x+bar/2)+'" y="'+(height-6)+'" text-anchor="middle">'+Number(row.day.slice(-2))+'</text>';}
 $('chart').innerHTML=svg+'</svg>';
 $('chart').setAttribute('aria-label',rows.map(x=>dateText(x.day)+': '+x.count+' оформлений').join('; '));
 $('chartTitle').textContent=data.period.mode==='day'?'Оформления за день':'Оформления по дням';
 $('chartNote').textContent=data.summary.period===0?'За этот период оформлений пока нет.':'Даты по UTC. Повторные скачивания и два счёта не увеличивают число оформлений.';
}
function render(){
 $('todayTotal').textContent=fmt.format(data.summary.today);$('monthTotal').textContent=fmt.format(data.summary.month);$('periodTotal').textContent=fmt.format(data.summary.period);
 $('periodCaption').textContent=data.period.mode==='day'?dateText(data.period.from):dateText(data.period.from,{month:'long',year:'numeric'});
 $('periodSubtitle').textContent='за выбранный '+(data.period.mode==='day'?'день':'месяц');
 const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(data.updated_at));$('updated').textContent='Обновлено в '+time;
 renderChart();renderModels();
}
async function load(){
 if(!$('period').value||!$('period').checkValidity()){setError('Выберите корректный '+(mode==='day'?'день.':'месяц.'));return;}
 const current=++sequence;controller?.abort();const active=new AbortController();controller=active;document.body.dataset.loading='true';
 const timer=setTimeout(()=>active.abort(),15000);
 try{
  const response=await fetch('/owner/statistics/report?'+new URLSearchParams({mode,period:$('period').value}),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:active.signal});
  if(current!==sequence)return;
  if(response.status===401||response.status===403){setError('Сессия завершилась. Войдите снова, чтобы увидеть статистику.',true);return;}
  if(!response.ok)throw Error('status');
  if(!response.headers.get('content-type')?.includes('application/json')){setError('Для просмотра статистики нужно войти снова.',true);return;}
  const fresh=await response.json();if(current!==sequence)return;data=fresh;setError('');render();
 }catch(e){if(current===sequence){setError(data?'Не удалось обновить. Ниже показаны данные на момент последнего успешного обновления.':'Не удалось загрузить статистику. Проверьте соединение или войдите снова.');$('relogin').hidden=false;$('updated').textContent=data?'Данные не обновлены':'Нет соединения';}}
 finally{clearTimeout(timer);if(current===sequence)document.body.dataset.loading='false';}
}
function setMode(next){if(mode===next)return;const old=$('period').value;mode=next;$('modeDay').setAttribute('aria-pressed',String(mode==='day'));$('modeMonth').setAttribute('aria-pressed',String(mode==='month'));$('period').type=mode==='day'?'date':'month';$('period').value=mode==='day'?(old===today().slice(0,7)?today():old+'-01'):old.slice(0,7);document.querySelector('label[for="period"]').textContent=mode==='day'?'Выберите день':'Выберите месяц';void load();}
$('modeDay').addEventListener('click',()=>setMode('day'));$('modeMonth').addEventListener('click',()=>setMode('month'));$('period').addEventListener('change',()=>void load());$('refresh').addEventListener('click',()=>void load());$('retry').addEventListener('click',()=>void load());$('search').addEventListener('input',renderModels);
for(const button of document.querySelectorAll('[data-type]'))button.addEventListener('click',()=>{category=button.dataset.type;for(const b of document.querySelectorAll('[data-type]'))b.setAttribute('aria-pressed',String(b===button));renderModels();});
$('export').addEventListener('click',()=>{if(!data)return;const quote=x=>'"'+String(x??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"';const rows=[['Период с (UTC)','Период по (UTC)','Модель','Код предложения','Категория','Оформлений'],...filtered().map(x=>[data.period.from,data.period.to,x.model,x.id,x.type==='car'?'Автомобили':'Оборудование',x.count])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='TE-GROUP-statistics-'+data.period.value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
new ResizeObserver(()=>{if(data)renderChart();}).observe($('chart'));
setInterval(()=>{if(!document.hidden)void load();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});void load();
})();
