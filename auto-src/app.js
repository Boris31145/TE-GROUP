(()=>{'use strict';const root=document.getElementById('tegroup-mobile-review');
const initialCar=new URLSearchParams(location.search).get('car');
// Public snapshots only. No simulated customer database or registration.
function createReview(seed,actual,legal){
  let mode='actual',rows=structuredClone(seed.offers);
  return {
    get mode(){return mode},legal,
    setMode(value){mode=['actual','test','intake'].includes(value)?value:'actual';rows=structuredClone(seed.offers)},
    intake(){return structuredClone(actual.intake||[])},
    async api(url){
      if(url!=='/api/catalog')throw Error('Кабинет отключен. Данные не отправляются.');
      return mode==='test'?{...structuredClone(seed),offers:structuredClone(rows)}:structuredClone(actual);
    },
    simulate(scenario,id){const o=rows.find(o=>o.id===id);if(!o)return;
      if(scenario==='normal'){const original=seed.offers.find(x=>x.id===id);Object.assign(o,structuredClone(original))}
      else if(scenario==='price_changed'){o.quote.total_rub+=150000;o.quote.company_rub+=150000;o.quote.vehicle_rub+=150000;o.version++}
      else if(scenario==='stale'){o.stale=true;o.bookable=false}
      else if(scenario==='quote_expired'){o.quote_expires=1;o.bookable=false}
      else if(scenario==='held'){o.availability='reserved';o.bookable=false}
    }
  };
}

const payload=window.TECatalogSnapshot;const review=createReview(payload.seed,payload.actual,payload.legal);
'use strict';
const TEGroupMarket={
  US:{title:'США',lead:'Автомобили от 2 млн ₽. Индивидуальный расчёт доставки и импорта.'},
  KR:{title:'Корея',lead:'Свежие автомобили с небольшим пробегом и понятными характеристиками.'},
  CN:{title:'Китай',lead:'Новые и подержанные автомобили в современных комплектациях.'}
};
function teCountryFlag(code){
  const start='<svg class="country-flag" width="18" height="12" viewBox="0 0 27 18" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">';
  const star=(cx,cy,r,angle=-Math.PI/2)=>{let d='';for(let k=0;k<10;k++){const a=angle+k*Math.PI/5,rr=k%2?r*.381966:r;d+=(k?' L ':'M ')+(cx+Math.cos(a)*rr).toFixed(4)+' '+(cy+Math.sin(a)*rr).toFixed(4);}return d+' Z';};
  if(code==='US'){
    let flag=start+'<rect width="27" height="18" fill="#fff"/>';
    for(let row=0;row<7;row++)flag+='<rect x="0" y="'+(row*2*18/13)+'" width="27" height="'+(18/13)+'" fill="#b52a38"/>';
    flag+='<rect width="11.88" height="'+(18*7/13)+'" fill="#253b65"/>';
    for(let row=0;row<9;row++)for(let col=0;col<(row%2?5:6);col++)flag+='<path fill="#fff" d="'+star((col*2+(row%2?2:1))*11.88/12,(row+1)*18*7/130,.38)+'"/>';
    return flag+'</svg>';
  }
  if(code==='CN'){
    let flag=start+'<rect width="27" height="18" fill="#cd2b2b"/><path fill="#ffe36b" d="'+star(4.5,4.5,2.7)+'"/>';
    [[9,1.8],[10.8,3.6],[10.8,6.3],[9,8.1]].forEach(([x,y])=>{flag+='<path fill="#ffe36b" d="'+star(x,y,.9,Math.atan2(4.5-y,4.5-x))+'"/>';});
    return flag+'</svg>';
  }
  if(code==='KR'){
    let flag=start+'<rect width="27" height="18" fill="#fff"/><circle cx="13.5" cy="9" r="4.4" fill="#c93344"/><path d="M9.1 9a4.4 4.4 0 0 0 8.8 0 2.2 2.2 0 0 0-4.4 0 2.2 2.2 0 0 1-4.4 0" fill="#2a5687"/>';
    const trigrams=[[5.4,4.4,-45,[1,1,1]],[21.6,4.4,45,[0,1,0]],[5.4,13.6,45,[1,0,1]],[21.6,13.6,-45,[0,0,0]]];
    for(const [cx,cy,angle,bars]of trigrams){flag+='<g transform="translate('+cx+' '+cy+') rotate('+angle+')" stroke="#28332e" stroke-width=".65">';bars.forEach((solid,row)=>{const y=(row-1)*1.05;flag+='<path d="'+(solid?'M-2.1 '+y+'H2.1':'M-2.1 '+y+'H-.45 M.45 '+y+'H2.1')+'"/>';});flag+='</g>';}
    return flag+'</svg>';
  }
  return '';
}
function teMarketHtml(code,escape){const market=TEGroupMarket[code];return market?`<p class="muted">${escape(market.lead)}</p>`:'';}
function teVehicleCondition(o,escape){
  if(o.country!=='US'&&!o.damage&&!o.title_status)return '';
  const names={'Rear End':'Задняя часть','Front End':'Передняя часть','Minor Dent/Scratches':'Незначительные вмятины / царапины','Minor Dents/Scratches':'Незначительные вмятины / царапины','Normal Wear':'Естественный износ','Salvage':'Документ Salvage','Clean Title':'Чистый титул (Clean Title)'};
  const fields=[['Состояние',o.damage],['Документы',o.title_status],['Осмотр',o.quote?.inspection_reference||o.inspection_note],['Восстановление',o.quote?.repair_rub!=null?Number(o.quote.repair_rub).toLocaleString('ru-RU')+' ₽':null]].filter(([,value])=>value);
  return `<details class="vehicle-section condition"><summary>Состояние и документы</summary>${fields.map(([key,value])=>`<div class="quote-line"><span>${escape(key)}</span><strong>${escape(names[value]||value)}</strong></div>`).join('')}<p>История, правовой статус и состояние проверяются до покупки. Известные повреждения и необходимые работы фиксируются в спецификации.</p></details>`;
}

'use strict';
// The local invoice freezes the same whole-rouble amount shown in the catalogue.
function teOfferVin(o){
  return [o.quote?.vin,o.vin].map(v=>String(v||'').trim().toUpperCase()).find(v=>/^[A-HJ-NPR-Z0-9]{17}$/.test(v))||'';
}
function teRubPrice(o){
  return globalThis.TEPaymentInstructions.listingAmountRub(o);
}
function teSearchOffer(o,query){
  const q=query.trim().toLocaleLowerCase('ru-RU');if(!q)return true;
  if([o.title,o.source_id,o.source].some(v=>String(v||'').toLocaleLowerCase('ru-RU').includes(q)))return true;
  // A short lot number must not match a common VIN prefix across every car.
  const vin=q.replace(/[\s-]/g,'');return vin.length>=6&&teOfferVin(o).toLowerCase().includes(vin);
}
function teVehicleKey(o){return teOfferVin(o)?'VIN:'+teOfferVin(o).toUpperCase():o.id}
function tePriceChange(before,after){
  if(before.quote&&after.quote&&before.quote.total_rub!==after.quote.total_rub)return {kind:'quote',before:before.quote.total_rub,after:after.quote.total_rub};
  if(before.quote&&!after.quote)return {kind:'invalidated'};
  if(!before.quote&&after.quote)return {kind:'approved'};
  if(!before.quote&&!after.quote&&teRubPrice(before)!==teRubPrice(after))return {kind:'source',before:teRubPrice(before),after:teRubPrice(after)};
  return null;
}
function teComparisonRows(o){
  const q=o.quote;
  return [
    ['country','Страна отправления',o.country],['year','Год',o.year||null],
    ['mileage','Пробег, км',o.mileage_km==null?null:(o.mileage_approx?'≈ ':'')+Number(o.mileage_km).toLocaleString('ru-RU')],
    ['vin','VIN',teOfferVin(o)||null],['fuel','Топливо',o.fuel||null],['power','Мощность, л.с.',o.power_hp||null],['util','Утильсбор',o.source_breakdown?.util_rub??null],
    ['company','Платёж компании',q?.company_rub??null],['import','Импорт и другие расходы покупателя',q?.buyer_costs_rub??null],
    ['repair','Ремонт за счёт покупателя',q?.repair_rub??null],
    ['destination','Пункт доставки',q?.destination||null],
    ['condition','Повреждения',o.damage||null],['documents','Документы автомобиля',o.title_status||null]
  ];
}

'use strict';
const $=id=>root.querySelector('#'+id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(value);
const date=value=>new Date(value*1000).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК';
const countryName={US:'США',KR:'Корея',CN:'Китай'};

let state={offers:[],country:'all',comparison:new Map(),detailId:null};
async function api(url){return review.api(url)}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000)}
function price(o){return teRubPrice(o)}
function shownPrice(o){return price(o)!=null?money(price(o)):'Расчёт стоимости'}
function vehiclePriceLabel(o){return o.quote?'Бюджет по смете':o.source_currency==='USD'?'Стоимость автомобиля':'Ориентировочный бюджет'}
function countryLabel(code){return `<span class="country-label">${countryName[code]}</span>`}

function selectable(o){return !!o&&!o.source_expired&&o.availability!=='reserved'}
function importHtml(o){
  const b=o.source_breakdown||{},a=o.import_check||{};
  const items=[['vehicle_rub','Автомобиль'],['delivery_rub','Доставка'],['duty_rub','Таможенная пошлина'],['util_rub','Утилизационный сбор'],['customs_fee_rub','Таможенный сбор'],['excise_rub','Акциз'],['vat_rub','НДС']].filter(([key])=>b[key]!=null).map(([key,label])=>[label,b[key]]);
  const service=[b.broker_rub,b.source_commission_rub].filter(v=>v!=null);if(service.length)items.push(['Оформление и сопровождение',service.reduce((sum,value)=>sum+Number(value),0)]);
  const rows=items.map(([label,value])=>`<div class="quote-line"><span>${esc(label)}</span><strong>${money(value)}</strong></div>`).join('');
  const lowUtil=b.util_rub===3400||b.util_rub===5200;
  const review=o.import_review_required?'<p>Для гибридного автомобиля итоговый утильсбор уточняется по мощности силовой установки и документам.</p>':'';
  return `<details class="vehicle-section"><summary>Состав стоимости</summary>${review}${rows||'<p>Доставка, пошлина, утильсбор и другие расходы рассчитываются индивидуально.</p>'}${rows?'<p>Расчётный бюджет. Состав расходов и порядок платежей фиксируются в договоре.</p>':''}${lowUtil?'<p>Утильсбор рассчитан для личного ввоза при соблюдении условий льготы.</p>':''}${o.source_currency==='USD'&&!o.quote?'<p>Указана стоимость автомобиля в рублях. Доставка, импортные платежи и возможное восстановление рассчитываются отдельно.</p>':''}</details>${(a.benchmarks||[]).length?`<details class="vehicle-section"><summary>Условия расчёта утильсбора</summary>${a.benchmarks.map(x=>`<div class="quote-line"><span>Общий тариф ${x.year}</span><strong>${money(x.min_rub)}${x.min_rub!==x.max_rub?' – '+money(x.max_rub):''}</strong></div>`).join('')}<p>Ставка зависит от даты оформления, возраста, двигателя, категории и условий ввоза. ${o.power_hp>160&&o.engine_kind==='ICE'?'Для обычного ДВС мощнее 160 л.с. льготная ставка не применяется.':''}</p><p><a href="${esc(a.rules_url)}" target="_blank" rel="noopener noreferrer">Действующие ставки</a></p></details>`:''}`;
}
function quoteHtml(q){if(!q)return '';const row=(key,label,total=false)=>`<div class="quote-line ${total?'total':''}"><span>${label}</span><strong>${q[key]==null?'Уточняется':money(q[key])}</strong></div>`;return `<details class="vehicle-section"><summary>Состав стоимости</summary>${row('vehicle_rub','Автомобиль')}${row('delivery_rub','Доставка')}${row('company_fee_rub','Организация поставки')}${row('company_rub','К оплате TE GROUP',true)}${row('buyer_costs_rub','Самостоятельные импортные расходы')}${q.repair_rub?row('repair_rub','Восстановление'):''}<p>Место передачи: ${esc(q.destination)}. ${esc(q.terms)}</p></details>`}

function mediaHtml(o,index=0){return reviewMedia(o,index)}
function galleryHtml(o){const images=(o.review_images||o.image_urls||[o.image_url]).filter(Boolean);return `<div class="car-media detail-media" id="galleryMain">${mediaHtml(o)}</div>${images.length>1?`<div class="gallery-thumbs" aria-label="Фотографии этого автомобиля">${images.map((url,i)=>`<button type="button" data-photo="${i}" aria-label="Фото ${i+1}" aria-pressed="${i===0}">${mediaHtml(o,i)}</button>`).join('')}</div>`:''}`}
function imageFallback(container){container.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.replaceWith(Object.assign(document.createElement('span'),{className:'no-photo',textContent:'Фотография недоступна'}))}))}
function dialogVisible(id){return !$(id).hidden}
function toggleComparison(id){
  if(state.comparison.has(id))state.comparison.delete(id);
  else{const o=state.offers.find(o=>o.id===id);if(!o)return;if([...state.comparison.values()].some(x=>teVehicleKey(x.offer)===teVehicleKey(o)))return toast('Этот VIN уже добавлен в сравнение.');if(state.comparison.size===3)return toast('Можно сравнить до трёх автомобилей. Уберите один из выбранных.');state.comparison.set(id,{offer:structuredClone(o),missing:false,change:null})}
  render();renderComparison();
}
function syncComparison(){for(const [id,entry]of state.comparison){const o=state.offers.find(o=>o.id===id);if(o){entry.change=tePriceChange(entry.offer,o)||entry.change;entry.offer=structuredClone(o);entry.missing=false}else entry.missing=true}renderComparison()}
function comparisonNotice(entry){const c=entry.change;if(entry.missing)return 'Машина больше не входит в текущую подборку. Ниже — последние сохранённые сведения; бронирование недоступно.';if(!c)return '';return c.kind==='quote'?`Смета обновилась: ${money(c.before)} → ${money(c.after)}. Новая бронь потребует подтверждения новой цены.`:c.kind==='source'?`Стоимость обновилась: ${money(c.before)} → ${money(c.after)}.`:c.kind==='invalidated'?'Предыдущая смета больше не действует. Требуется новое подтверждение.':'Для автомобиля появилась утверждённая смета.'}
function renderComparison(){
  const entries=[...state.comparison.values()];$('compareBar').hidden=!entries.length;$('compareCount').textContent=`Выбрано для сравнения: ${entries.length} из 3`;
  $('compareCards').innerHTML=entries.length?entries.map(entry=>{const o=entry.offer;const note=comparisonNotice(entry);return `<article class="comparison-car"><span class="eyebrow">${countryLabel(o.country)}</span><h3>${esc(o.title)}</h3><button type="button" class="text-button" data-remove-compare="${esc(o.id)}">Убрать из сравнения</button>${note?`<p class="notice">${esc(note)}</p>`:''}<div class="compare-price"><span>${vehiclePriceLabel(o)}</span><strong>${shownPrice(o)}</strong></div><dl>${teComparisonRows(o).map(([key,label,value])=>`<div><dt>${esc(label)}</dt><dd>${value===null?'Уточняется':['company','import','repair','util'].includes(key)?money(value):key==='country'?countryName[value]:esc(value)}</dd></div>`).join('')}</dl><button class="primary" data-compare-book="${esc(o.id)}" ${selectable(o)&&!entry.missing?'':'disabled'}>Забронировать</button></article>`}).join(''):'<div class="empty"><h3>Ничего не выбрано</h3><p>Добавьте до трёх машин для сравнения.</p></div>';
}

function clearComparison(){state.comparison.clear();render();renderComparison()}
function sourceUrl(o){try{const u=new URL(o.source_url);if(u.protocol==='https:')return u.href}catch{}return null}
function offerStatus(o){if(o.availability==='reserved')return 'Уже забронирован';if(o.source_expired)return 'Предложение завершено';if(o.stale)return 'Условия фиксируются в договоре';if(o.quote&&o.quote_expires<=Date.now()/1000)return 'Срок сметы истек';return o.bookable?'Доступность подтверждена':'Условия фиксируются в договоре'}
function render(){
  $('marketIntro').hidden=state.country==='all';$('marketIntro').innerHTML=teMarketHtml(state.country,esc);
  let offers=state.offers.filter(o=>(state.country==='all'||o.country===state.country)&&(price(o)==null||price(o)<=Number($('budget').value))&&teSearchOffer(o,$('search').value));const sorting=$('sort').value;offers.sort((a,b)=>sorting==='price'?(price(a)??Infinity)-(price(b)??Infinity):sorting==='year'?(b.year||0)-(a.year||0):Number(b.bookable)-Number(a.bookable)||(price(a)??Infinity)-(price(b)??Infinity));$('resultCount').textContent=`${offers.length} автомобилей в подборке`;
  $('cards').innerHTML=offers.length?offers.map(o=>`<article class="car-card"><div class="car-media">${mediaHtml(o)}</div><div class="car-body"><div class="card-kicker"><span>${countryLabel(o.country)}</span><span>ПОД ЗАКАЗ</span></div><h3>${esc(o.title)}</h3><p class="specs">${esc(o.year||'Год уточняется')} · ${o.mileage_km==null?'Пробег уточняется':(o.mileage_approx?'≈ ':'')+Number(o.mileage_km).toLocaleString('ru-RU')+' км'}${o.power_hp?' · '+esc(o.power_hp)+' л.с.':''}</p><div class="price-area"><span class="price-label">${vehiclePriceLabel(o)}</span><strong class="price">${shownPrice(o)}</strong></div><p class="card-note">${o.source_breakdown?.util_rub!=null?'Расчётный утильсбор '+money(o.source_breakdown.util_rub):o.quote?'Доставка 2–4 месяца':'Доставка и импорт рассчитываются отдельно'}</p><div class="card-actions"><button class="primary" data-detail="${esc(o.id)}">Открыть автомобиль</button></div></div></article>`).join(''):`<div class="empty"><h3>${state.offers.length?'Нет машин с такими параметрами':'Подборка готовится'}</h3><p>${state.offers.length?'Измените страну, бюджет или поисковый запрос.':'Новые автомобили появятся после проверки предложения.'}</p></div>`;
  imageFallback($('cards'));$('countries').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.country===state.country)));
}
async function loadCatalog(){const request=state.catalogRequest=(state.catalogRequest||0)+1;try{const d=await api('/api/catalog');if(request!==state.catalogRequest)return;state.offers=d.offers;state.staticCatalog=!!d.static_snapshot;syncComparison();if(state.detailId&&dialogVisible('detailDialog'))refreshDetail();$('catalogError').hidden=true;for(const c of ['US','KR','CN'])$('count'+c).textContent=d.mix[c].available;$('updated').textContent=state.offers.length?'Обновлено: '+date(Math.max(...state.offers.map(o=>o.updated_at))):'Нет доступной выгрузки';$('sources').textContent='В каталоге указана дата обновления. Условия выбранного автомобиля фиксируются в договоре.';render()}catch(e){if(request!==state.catalogRequest)return;$('catalogError').textContent=e.message;$('catalogError').hidden=false;$('resultCount').textContent='Каталог недоступен'}}
function detailSignature(o){return JSON.stringify([o.title,o.source_id,o.year,o.mileage_km,o.mileage_approx,o.fuel,o.engine_cc,o.power_hp,o.engine_kind,o.source_breakdown,o.import_check,o.quote,o.quote_expires,o.customer_price_rub,o.display_price_rub,o.source_price_rub,o.source_price,o.source_currency,o.price_basis,o.vin,o.damage,o.title_status,o.inspection_note,o.repair_note,o.description,o.image_url,o.image_urls,o.updated_at,o.bookable,offerStatus(o)])}
function detail(id,changed=false){
  const o=state.offers.find(o=>o.id===id);if(!o)return;state.detailId=id;state.detailSignature=detailSignature(o);const url=sourceUrl(o);const vin=teOfferVin(o);
  const facts=[['Год',o.year||'Уточняется'],['Пробег',o.mileage_km==null?'Уточняется':(o.mileage_approx?'≈ ':'')+Number(o.mileage_km).toLocaleString('ru-RU')+' км'],['Мощность',o.power_hp?o.power_hp+' л.с.':'Уточняется']];
  const technical=[['Топливо',o.fuel],['Двигатель',o.engine_cc?Number(o.engine_cc).toLocaleString('ru-RU')+' см³':null],['Трансмиссия',o.transmission]].filter(([,v])=>v&&v!=='Уточняется');
  const vinBlock=vin?`<label class="vin-field">VIN автомобиля<input readonly id="detailVin" value="${esc(vin)}" aria-label="VIN автомобиля"></label>`:`<div class="vehicle-meta"><small>Идентификация автомобиля</small><p>Полный VIN предоставим до подписания договора.</p></div>`;
  $('detailContent').innerHTML=`<p class="notice" id="detailUpdate" ${changed?'':'hidden'}>Предложение обновилось. Проверьте актуальную стоимость.</p><div class="vehicle-layout"><section class="vehicle-visual"><div class="vehicle-heading"><span class="eyebrow">${countryLabel(o.country)} / ПОД ЗАКАЗ</span><h2>${esc(o.title)}</h2></div>${galleryHtml(o)}<div class="vehicle-highlights">${facts.map(([label,value])=>`<div><small>${label}</small>${esc(value)}</div>`).join('')}</div></section><aside class="vehicle-purchase"><section class="vehicle-summary"><span class="price-label">${vehiclePriceLabel(o)}</span><strong class="price">${shownPrice(o)}</strong><div class="vehicle-inclusions"><span>Доставка 2–4 месяца</span>${o.source_breakdown?.util_rub!=null?`<span>Расчётный утильсбор ${money(o.source_breakdown.util_rub)}</span>`:''}</div>${o.source_currency==='USD'&&!o.quote?'<p class="vehicle-price-caption">Доставка и импорт рассчитываются отдельно.</p>':''}</section>${vinBlock}<div class="detail-actions"><button type="button" class="outline" id="detailCompare" aria-pressed="${state.comparison.has(id)}">${state.comparison.has(id)?'В сравнении':'+ К сравнению'}</button><button class="primary" id="detailBook" ${selectable(o)?'':'disabled'}>Забронировать</button></div><p class="purchase-caption">Договор и инвойс — в одном PDF, без регистрации.</p></aside><section class="vehicle-information" aria-label="Подробности автомобиля">${technical.length?`<details class="vehicle-section"><summary>Характеристики</summary>${technical.map(([label,value])=>`<div class="quote-line"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</details>`:''}${teVehicleCondition(o,esc)}${o.quote?quoteHtml(o.quote):importHtml(o)}<details class="vehicle-section"><summary>Доставка и оформление</summary><p>Доставка — 2–4 календарных месяца после согласованного аванса. Договор и счёт оформляются для выбранного автомобиля. Закрепление автомобиля у продавца подтверждает TE GROUP.</p><p>При замене характеристики и VIN согласуются с вами. Изменение цены — в пределах ±15% первоначальной суммы, с возвратом переплаты или доплатой по счёту.</p></details></section></div>`;
  $('detailBook').addEventListener('click',()=>startSelection(id));$('detailCompare').addEventListener('click',()=>{toggleComparison(id);$('detailCompare').setAttribute('aria-pressed',String(state.comparison.has(id)));$('detailCompare').textContent=state.comparison.has(id)?'В сравнении':'+ К сравнению'});$('detailContent').querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click',()=>{$('galleryMain').innerHTML=mediaHtml(o,Number(b.dataset.photo));$('detailContent').querySelectorAll('[data-photo]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));imageFallback($('galleryMain'))}));imageFallback($('detailContent'));open('detailDialog');
}
function refreshDetail(){const o=state.offers.find(o=>o.id===state.detailId);if(!o){$('detailBook').disabled=true;$('detailUpdate').hidden=false;$('detailUpdate').textContent='Машина больше не входит в текущую подборку. Ниже — последние показанные сведения. Бронирование недоступно.';return}if(state.detailSignature!==detailSignature(o))detail(o.id,true)}
$('countries').addEventListener('click',e=>{const b=e.target.closest('[data-country]');if(!b)return;state.country=b.dataset.country;$('countries').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));render()});for(const id of ['search','budget','sort'])$(id).addEventListener(id==='search'?'input':'change',render);
$('reset').addEventListener('click',()=>{state.country='all';$('search').value='';$('budget').value='6000000';$('sort').value='recommended';$('countries').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x.dataset.country==='all'));render()});
$('cards').addEventListener('click',e=>{const d=e.target.closest('[data-detail]'),b=e.target.closest('[data-book]'),c=e.target.closest('[data-compare]');if(c)toggleComparison(c.dataset.compare);if(d)detail(d.dataset.detail);if(b)startSelection(b.dataset.book)});
root.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.close==='documentDialog')clearDocumentData();close(b.dataset.close)}));
loadCatalog().then(()=>{if(window.TE_PUBLIC_SITE&&initialCar){if(state.offers.some(o=>o.id===initialCar))detail(initialCar);else toast('Автомобиль не найден в текущей подборке.')}}).catch(e=>toast(e.message));
$('compareOpen').addEventListener('click',()=>{renderComparison();open('compareDialog')});$('compareClear').addEventListener('click',clearComparison);
$('compareCards').addEventListener('click',e=>{const remove=e.target.closest('[data-remove-compare]'),book=e.target.closest('[data-compare-book]');if(remove)toggleComparison(remove.dataset.removeCompare);if(book)startSelection(book.dataset.compareBook)});

function startSelection(id){return startDocument(id)}

'use strict';
let documentFlow={offer:null,acceptedAt:null,snapshot:null,urls:[],generating:false,generation:0};
function documentStage(stage){
  for(const [n,id]of [[1,'documentConsent'],[2,'documentBuyer'],[3,'documentResult']]){
    $(id).hidden=n!==stage;$('docStep'+n).classList.toggle('active',n===stage);
  }
}
function revokeDocumentDownloads(){for(const url of documentFlow.urls)URL.revokeObjectURL(url);documentFlow.urls=[];$('documentDownloads').innerHTML='';}
function clearDocumentData(){
  documentFlow.generation++;revokeDocumentDownloads();documentFlow.offer=null;documentFlow.snapshot=null;documentFlow.acceptedAt=null;documentFlow.generating=false;
  $('documentForm').reset();$('documentConsentCheck').checked=false;$('documentIntent').checked=false;
  for(const id of ['documentFormError','documentConsentError','documentResultName','documentCar'])$(id).textContent='';
  $('documentGenerate').disabled=false;documentStage(1);
}
function startDocument(id){
  const o=state.offers.find(o=>o.id===id);if(!selectable(o))return toast('Автомобиль сейчас недоступен.');
  clearDocumentData();documentFlow.offer=structuredClone(o);
  $('documentCar').innerHTML=`<h3>${esc(o.title)}</h3><p>${countryName[o.country]} · ${esc(o.year)}</p><p class="selection-price">${shownPrice(o)}</p><p class="delivery-term">Поставка — 2–4 месяца</p>`;
  $('localConsentText').textContent=window.TEDocumentSettings.consent_text;
  close('detailDialog');close('compareDialog');open('documentDialog');
}
$('documentContinue').addEventListener('click',()=>{
  if(!$('documentConsentCheck').checked||!$('documentIntent').checked){$('documentConsentError').textContent='Подтвердите отдельное согласие и намерение оформить автомобиль.';return}
  documentFlow.acceptedAt=Date.now();$('documentConsentError').textContent='';documentStage(2);
});
$('documentBack').addEventListener('click',()=>{documentFlow.acceptedAt=null;$('documentConsentCheck').checked=false;$('documentIntent').checked=false;documentStage(1);});
$('documentForm').addEventListener('submit',async e=>{
  e.preventDefault();if(documentFlow.generating)return;
  const f=e.currentTarget;$('documentFormError').textContent='';
  if(!documentFlow.acceptedAt||!$('documentConsentCheck').checked||!$('documentIntent').checked){documentStage(1);$('documentConsentError').textContent='Согласие нужно подтвердить до заполнения.';return}
  const current=state.offers.find(o=>o.id===documentFlow.offer?.id);
  if(!current||!selectable(current)||detailSignature(current)!==detailSignature(documentFlow.offer)){$('documentFormError').textContent='Предложение изменилось или стало недоступно. Закройте оформление и откройте актуальную карточку.';return}
  const generation=++documentFlow.generation;documentFlow.generating=true;$('documentGenerate').disabled=true;
  try{
    const input=Object.fromEntries(window.TELocalDocuments.buyerFields.map(k=>[k,f.elements[k].value]));
    const snapshot=window.TELocalDocuments.makeSnapshot(documentFlow.offer,input,window.TEDocumentSettings,documentFlow.acceptedAt);
    const bytes=Uint8Array.from(atob(window.TEDocumentSettings.font_base64),c=>c.charCodeAt(0));
    const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    const resources={PDFLib:window.PDFLib,fontkit:window.fontkit,font:bytes,fontBold:decode(window.TEDocumentSettings.font_bold_base64),signatureMarks:decode(window.TEDocumentSettings.signature_marks_base64),qrcode:window.qrcode};
    const data=await window.TELocalDocuments.createPdf(snapshot,'bundle',resources);
    if(generation!==documentFlow.generation)return;
    revokeDocumentDownloads();documentFlow.snapshot=snapshot;
    $('documentResultName').textContent=snapshot.buyer.full_name+' · '+snapshot.offer.title;
    const url=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));documentFlow.urls.push(url);
    $('documentDownloads').innerHTML=`<a class="document-download" href="${esc(url)}" download="${snapshot.document_number}-documents.pdf"><span><strong>Договор и инвойс с QR</strong><small>Один PDF · спецификация и согласие включены · ${Math.ceil(data.length/1024)} КБ</small></span><span>Скачать ↓</span></a>`;
    documentStage(3);
  }catch(error){if(generation===documentFlow.generation)$('documentFormError').textContent=error.message||'Не удалось сформировать PDF. Попробуйте ещё раз.';}
  finally{if(generation===documentFlow.generation){documentFlow.generating=false;$('documentGenerate').disabled=false;}}
});
$('documentEdit').addEventListener('click',()=>{documentFlow.generation++;revokeDocumentDownloads();documentFlow.snapshot=null;documentStage(2);});
$('documentClear').addEventListener('click',()=>{clearDocumentData();close('documentDialog');});
$('documentDialog').addEventListener('cancel',()=>clearDocumentData());
window.addEventListener('pagehide',clearDocumentData);
$('documentTestFill').addEventListener('click',()=>{const f=$('documentForm');for(const [key,value]of Object.entries({full_name:'Тестов Иван Иванович',phone:'+7 999 000-00-00',email:'review@example.test',address:'Тестовый адрес, Россия, Москва, ул. Примерная, 1',document_type:'Паспорт РФ',passport_series:'0000',passport_number:'000000',passport_issued_by:'Тестовый орган — вымышленные данные',passport_issue_date:'2020-01-15',passport_department_code:'000-000'}))f.elements[key].value=value;});

function reviewPage(id,scroll=true){
  if(window.TE_PUBLIC_SITE&&id==='cars')history.replaceState(null,'','/cars/');
  if(window.TE_PUBLIC_SITE&&id==='detailDialog'&&state.detailId)history.replaceState(null,'','/cars/?car='+encodeURIComponent(state.detailId));
  const ids=['reviewEntry','reviewGoods','reviewDocument','reviewUsIntake','detailDialog','compareDialog','documentDialog'];
  for(const p of ids)$(p).hidden=p!==id;
  root.querySelector('main.wrap').hidden=id!=='cars';$('toast').hidden=true;
  const goods=id==='reviewGoods',entry=id==='reviewEntry';
  for(const [nav,active]of [['navGoods',goods],['navCars',!goods&&!entry]]){$(nav).classList.toggle('active',active);$(nav).setAttribute('aria-current',active?'page':'false')}
  if(scroll&&root.scrollIntoView)root.scrollIntoView({block:'start',behavior:'auto'});
}
function open(id){reviewPage(id)}
function close(id){if(!$(id).hidden){$(id).hidden=true;reviewPage('cars')}}
function reviewMedia(o,index=0){const image=(o.review_images||[o.review_image])[index];return image?`<img src="${image}" alt="${esc(o.title)}" loading="lazy">`:'<span class="review-filler"><small>Фото автомобиля не предоставлено</small></span>'}
function reviewNav(target){clearDocumentData();if(target==='goods'){window.location.assign(window.TE_GOODS_URL||'https://tegroup.cc/');return}if(window.TE_PUBLIC_SITE){window.location.assign(target==='entry'?'/':'/cars/');return}reviewPage(target==='entry'?'reviewEntry':'cars')}
$('reviewWidth').addEventListener('click',()=>{const expanded=root.classList.toggle('expanded');$('reviewWidth').textContent=expanded?'Мобильная ширина':'На всю ширину'});
$('reviewData').addEventListener('change',async()=>{clearDocumentData();review.setMode($('reviewData').value);clearComparison();state.detailId=null;$('reviewScenario').hidden=review.mode!=='test';$('reviewScenarioField').hidden=review.mode!=='test';$('reviewMode').textContent=review.mode==='test'?'Тестовый каталог · документы для проверки':'Сохранённые объявления · PDF на вашем устройстве';if(review.mode==='intake'){renderIntake();reviewPage('reviewUsIntake');return}reviewPage('cars');await loadCatalog()});
$('reviewScenario').addEventListener('change',async()=>{const selected=documentFlow.offer?.id||state.detailId||state.offers.find(o=>o.country===state.country)?.id;review.simulate($('reviewScenario').value,selected);await loadCatalog();toast('Тестовое состояние применено к выбранной машине.');});
function renderIntake(){
  $('reviewIntakeCards').innerHTML=review.intake().map(o=>`<article class="car-card"><div class="car-body"><span class="eyebrow">США / реальный срез</span><h3>${esc(o.title)}</h3><p>${o.year} · ${Number(o.mileage_km).toLocaleString('ru-RU')} км</p><strong class="price">${Number(o.source_price).toLocaleString('en-US')} USD</strong><p class="muted">Только выкуп лота. Полный бюджет и наличие требуют подтверждения.</p><a href="${esc(o.source_url)}" target="_blank" rel="noopener noreferrer">Источник ↗</a></div></article>`).join('');
}
let returnPage='cars';
function reviewDocument(title,body,back='cars'){returnPage=back;$('reviewDocumentContent').innerHTML=`<h1>${esc(title)}</h1>${body}`;reviewPage('reviewDocument')}
$('reviewDocumentBack').addEventListener('click',()=>reviewPage(returnPage));
$('reviewPrint').hidden=true;
root.addEventListener('click',e=>{
  const nav=e.target.closest('[data-review-nav]');if(nav){reviewNav(nav.dataset.reviewNav);return}
  const a=e.target.closest('a');if(!a||!root.contains(a))return;const href=a.getAttribute('href');
  if(href==='/'||href==='/goods/'||href==='/cars/'){e.preventDefault();reviewNav(href==='/'?'entry':href==='/goods/'?'goods':'cars');return}
  const legal=href?.match(/^\/legal\/(privacy|local-consent|reservation|contract-template)\/?$/);
  if(legal){e.preventDefault();const back=['documentDialog','detailDialog','compareDialog'].find(x=>!$(x).hidden)||'cars';reviewDocument({privacy:'Конфиденциальность и обработка данных','local-consent':'Отдельное согласие',reservation:'Условия оформления','contract-template':'Проект договора'}[legal[1]],review.legal[legal[1]],back);}
});
$('documentTestFill').hidden=!!window.TE_PUBLIC_SITE;
reviewPage(window.TE_PUBLIC_SITE&&location.pathname.startsWith('/cars')?'cars':'reviewEntry',false);

})();
