// Interaction checks with a minimal DOM harness; this is not browser/layout QA.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const html=fs.readFileSync('/workspace/tegroup-mobile-review-booking.html','utf8');
const nodes=new Map();
class Element {
  constructor(id){this.id=id;this.value='';this.hidden=false;this.dataset={};this.listeners={};this.attrs={};this.elements={};this.classes=new Set();this.classList={toggle:(v,force)=>{const set=force??!this.classes.has(v);set?this.classes.add(v):this.classes.delete(v);return set}}}
  set innerHTML(value){this.content=value;for(const m of value.matchAll(/\bid="([^"]+)"/g))nodes.set(m[1],new Element(m[1]))}
  get innerHTML(){return this.content||''}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  setAttribute(k,v){this.attrs[k]=v}
  querySelector(selector){if(selector.startsWith('#')){const e=nodes.get(selector.slice(1));assert(e,`Missing DOM element: ${selector}`);return e}if(selector==='main.wrap')return main;return null}
  querySelectorAll(selector){return this.id==='countries'&&selector==='button'?countries:selector==='[data-close]'?closes:[]}
  contains(){return true}
  reset(){for(const e of Object.values(this.elements)){e.value='';e.checked=false}}
  async fire(type,target=this){for(const fn of this.listeners[type]||[])await fn({preventDefault(){},currentTarget:this,target})}
}
for(const m of html.matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(m[1]);e.hidden=/\bhidden\b/.test(m[0]);nodes.set(e.id,e)}
const main=new Element('main'),root=nodes.get('tegroup-mobile-review');
const countries=['all','US','KR','CN'].map(c=>{const b=new Element(c);b.dataset.country=c;return b});
const closes=['detailDialog','authDialog','accountDialog','reserveDialog','buyerDialog','compareDialog','inquiryDialog'].map(id=>{const b=new Element('close');b.dataset.close=id;return b});
for(const [id,value] of Object.entries({budget:'6000000',sort:'recommended',reviewData:'test'}))nodes.get(id).value=value;
for(const name of ['name','email','password','consent'])nodes.get('authForm').elements[name]=new Element(name);
nodes.get('reserveForm').elements.terms=new Element('terms');
for(const name of ['phone','city','confirmed'])nodes.get('inquiryForm').elements[name]=new Element(name);
for(const name of ['full_name','phone','destination','consent'])nodes.get('buyerForm').elements[name]=new Element(name);
let js=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
js=js.replace(/\}\)\(\);\s*$/,`root.test={state,review,render,loadCatalog,loadSession,detail,startReserve,startInquiry,startSelection,account,buyerDetails,reviewContract,reviewInvoice,reviewNav,toggleComparison,clearComparison,syncComparison,teSearchOffer};})();`);
const context={document:{getElementById:id=>{assert.equal(id,root.id);return root},createElement:()=>new Element('created')},Intl,URL,Date,Math,Number,String,Array,Object,Map,Set,Uint8Array,TextEncoder,structuredClone,crypto:webcrypto,window:{print(){}},setTimeout:()=>0,clearTimeout(){},confirm:()=>true};
vm.runInNewContext(js,context);
(async()=>{
  await new Promise(resolve=>setImmediate(resolve));const t=root.test;
  assert(!nodes.get('reviewEntry').hidden);assert(main.hidden);assert(nodes.get('accountButton').hidden);
  assert(nodes.get('modeBanner').hidden);
  const go=async href=>{let prevented=false;const a={getAttribute:k=>k==='href'?href:null,closest:s=>s==='a'?a:null};for(const fn of root.listeners.click)await fn({target:a,preventDefault(){prevented=true}});assert(prevented)};
  await go('/goods/');assert(!nodes.get('reviewGoods').hidden);assert.equal(nodes.get('navGoods').attrs['aria-current'],'page');assert.equal(nodes.get('navCars').attrs['aria-current'],'false');assert(nodes.get('accountButton').hidden);
  await go('/cars/');assert(!main.hidden);assert.equal(nodes.get('navCars').attrs['aria-current'],'page');assert(!nodes.get('accountButton').hidden);
  await go('/');assert(!nodes.get('reviewEntry').hidden);await go('/cars/');
  assert(!/href="https:\/\/tegroup.cc\/"/.test(html));
  assert.match(nodes.get('cards').innerHTML,/Открыть автомобиль/);assert(!/data-book=|data-compare=/.test(nodes.get('cards').innerHTML));
  assert.equal(t.review.mode,'actual');assert.equal(t.state.country,'all');assert(t.state.offers.some(o=>o.country==='US'&&!o.quote&&o.source_currency==='USD'));assert(t.state.offers.every(o=>!o.bookable));
  t.review.setMode('test');t.state.country='US';await t.loadCatalog();assert.equal((nodes.get('cards').innerHTML.match(/<article /g)||[]).length,9);
  nodes.get('budget').value='3000000';t.render();assert.equal((nodes.get('cards').innerHTML.match(/<article /g)||[]).length,5);
  nodes.get('search').value='Does not exist';t.render();assert.match(nodes.get('cards').innerHTML,/Нет машин/);
  nodes.get('budget').value='6000000';nodes.get('search').value='';t.render();
  const us=t.state.offers.filter(x=>x.country==='US');
  nodes.get('search').value=us[0].quote.vin.toLowerCase();t.render();assert.equal((nodes.get('cards').innerHTML.match(/<article /g)||[]).length,1);
  nodes.get('search').value=us[0].quote.vin.replace(/(.{4})/g,'$1 ');t.render();assert.equal((nodes.get('cards').innerHTML.match(/<article /g)||[]).length,1);
  nodes.get('search').value=us[0].source_id;t.render();assert.equal((nodes.get('cards').innerHTML.match(/<article /g)||[]).length,1);nodes.get('search').value='';t.render();
  for(const o of us.slice(0,3))t.toggleComparison(o.id);
  assert.equal(t.state.comparison.size,3);assert(!nodes.get('compareBar').hidden);assert.equal((nodes.get('compareCards').innerHTML.match(/<article /g)||[]).length,3);
  t.toggleComparison(us[3].id);assert.equal(t.state.comparison.size,3);assert.match(nodes.get('toast').textContent,/до трёх/);
  await nodes.get('compareOpen').fire('click');assert(!nodes.get('compareDialog').hidden);assert(main.hidden);
  const originalBudget=us[0].quote.total_rub;t.review.simulate('price_changed',us[0].id);await t.loadCatalog();assert.match(nodes.get('compareCards').innerHTML,/Смета обновилась/);assert.equal(t.state.comparison.get(us[0].id).offer.quote.total_rub,originalBudget+150000);
  t.detail(us[0].id);assert.match(nodes.get('detailContent').innerHTML,/VIN конкретного автомобиля/);assert.match(nodes.get('detailContent').innerHTML,/Оплачиваете компании/);
  t.review.simulate('stale',us[0].id);await t.loadCatalog();assert.match(nodes.get('detailContent').innerHTML,/Данные устарели/);assert.match(nodes.get('detailContent').innerHTML,/Данные предложения обновились/);
  const api=t.review.api.bind(t.review);const oldCatalog=await api('/api/catalog');let delayed;
  t.review.api=(url,d)=>url==='/api/catalog'?new Promise(resolve=>{delayed=resolve}):api(url,d);
  const olderRequest=t.loadCatalog();t.review.api=api;t.review.simulate('normal',us[0].id);await t.loadCatalog();const currentVersion=t.state.offers.find(o=>o.id===us[0].id).version;delayed(oldCatalog);await olderRequest;assert.equal(t.state.offers.find(o=>o.id===us[0].id).version,currentVersion);assert.equal(t.state.offers.find(o=>o.id===us[0].id).stale,false);
  const remembered=structuredClone(t.state.offers);t.state.offers=t.state.offers.filter(o=>o.id!==us[0].id);t.syncComparison();assert.match(nodes.get('compareCards').innerHTML,/больше не входит/);assert.match(nodes.get('compareCards').innerHTML,new RegExp('data-compare-book="'+us[0].id+'" disabled'));
  t.state.offers=remembered;t.syncComparison();assert.equal(t.state.comparison.get(us[0].id).missing,false);t.clearComparison();assert(nodes.get('compareBar').hidden);
  const car=t.state.offers.find(x=>x.country==='US');t.detail(car.id);assert(!nodes.get('detailDialog').hidden);assert(main.hidden);assert.match(nodes.get('detailContent').innerHTML,/История и состояние/);
  await t.startReserve(car.id);assert(!nodes.get('authDialog').hidden);assert.equal(nodes.get('authForm').elements.consent.checked,undefined);
  await nodes.get('reviewFill').fire('click');const f=nodes.get('authForm');
  await f.fire('submit');assert.match(nodes.get('authError').textContent,/Подтвердите/);assert.equal(t.state.session,null);
  f.elements.consent.checked=true;await f.fire('submit');await new Promise(resolve=>setImmediate(resolve));assert(t.state.session);assert(!nodes.get('reserveDialog').hidden);
  await nodes.get('reserveForm').fire('submit');assert.equal((await t.review.api('/api/bookings')).bookings.length,0);
  nodes.get('reserveForm').elements.terms.checked=true;await nodes.get('reserveForm').fire('submit');
  assert(!nodes.get('buyerDialog').hidden);assert(nodes.get('accountDialog').hidden);assert.match(nodes.get('buyerSummary').innerHTML,/от двух месяцев/);assert.match(nodes.get('bookings').innerHTML,/черновик, оплате не подлежит/);
  let b=(await t.review.api('/api/bookings')).bookings[0];assert.equal(b.invoice_amount,null);assert.equal(b.snapshot.quote.total_rub,car.quote.total_rub);
  await closes.find(x=>x.dataset.close==='buyerDialog').fire('click');assert(!nodes.get('accountDialog').hidden);assert(nodes.get('buyerDialog').hidden);
  await t.buyerDetails(b.id);assert(!nodes.get('buyerDialog').hidden);assert.equal((await t.review.api('/api/bookings')).bookings.length,1);
  t.toggleComparison(car.id);t.review.simulate('price_changed',car.id);await t.loadCatalog();assert.equal(t.state.comparison.get(car.id).offer.quote.total_rub,car.quote.total_rub+150000);assert.equal((await t.review.api('/api/bookings')).bookings[0].snapshot.quote.total_rub,car.quote.total_rub);t.review.simulate('normal',car.id);await t.loadCatalog();t.clearComparison();
  assert.equal((await t.review.api('/api/reserve',{offer_id:car.id,version:car.version,idempotency:t.state.key,terms_version:t.state.legalVersion})).id,b.id);
  await assert.rejects(()=>t.review.api('/api/reserve',{offer_id:car.id,version:t.state.offers.find(o=>o.id===car.id).version,idempotency:'another-key-123456',terms_version:t.state.legalVersion}),/уже забронирован/);
  await assert.rejects(()=>t.review.api(`/api/bookings/${b.id}/request_contract`,{}),/заполните/);
  const frozen=JSON.stringify(b.snapshot);await t.buyerDetails(b.id);assert(!nodes.get('buyerDialog').hidden);assert(nodes.get('accountDialog').hidden);
  const bf=nodes.get('buyerForm');await nodes.get('reviewBuyerFill').fire('click');
  await bf.fire('submit');assert.equal((await t.review.api('/api/bookings')).bookings[0].status,'reserved');
  bf.elements.destination.checked=true;await bf.fire('submit');assert.equal((await t.review.api('/api/bookings')).bookings[0].status,'reserved');
  bf.elements.consent.checked=true;bf.elements.phone.value='123';await bf.fire('submit');assert.match(nodes.get('buyerError').textContent,/телефона/);
  bf.elements.phone.value='+7 999 000-00-00';await bf.fire('submit');b=(await t.review.api('/api/bookings')).bookings[0];assert.equal(b.status,'contract_review');assert.equal(b.preparation.buyer.phone,'+79990000000');assert.equal(JSON.stringify(b.snapshot),frozen);assert.equal(b.preparation.ready,false);assert(!nodes.get('accountDialog').hidden);
  assert.match(nodes.get('bookings').innerHTML,/Тестов Иван Иванович/);assert.match(t.reviewContract(b),/Тестов Иван Иванович/);assert.match(t.reviewInvoice(b),/Тестов Иван Иванович/);assert.match(nodes.get('bookings').innerHTML,/Шаг 3 из 3/);assert.equal(b.snapshot.delivery.minimum_months,2);
  await assert.rejects(()=>t.review.api(`/api/bookings/${b.id}/prepare_contract`,{}),/Изменение данных/);
  t.review.simulate('docs_verified',car.id);b=(await t.review.api('/api/bookings')).bookings[0];assert.equal(b.preparation.ready,true);
  t.review.simulate('details_returned',car.id);await t.account();b=(await t.review.api('/api/bookings')).bookings[0];assert.equal(b.status,'reserved');assert.match(nodes.get('bookings').innerHTML,/уточните ФИО/);
  await t.buyerDetails(b.id);assert.equal(bf.elements.full_name.value,'Тестов Иван Иванович');assert.equal(bf.elements.consent.checked,false);assert.equal(bf.elements.destination.checked,false);
  bf.elements.full_name.value='Тестов Петр Иванович';bf.elements.consent.checked=true;bf.elements.destination.checked=true;await bf.fire('submit');b=(await t.review.api('/api/bookings')).bookings[0];assert.equal(b.preparation.revision,2);assert.equal(JSON.stringify(b.snapshot),frozen);
  await t.review.api(`/api/bookings/${b.id}/cancel`,{});b=(await t.review.api('/api/bookings')).bookings[0];assert.equal(b.invoice_status,'void');await t.loadCatalog();assert(t.state.offers.find(x=>x.id===car.id).bookable);
  await t.startReserve(car.id);nodes.get('reserveForm').elements.terms.checked=true;
  t.review.simulate('price_changed',car.id);await nodes.get('reserveForm').fire('submit');
  assert.match(nodes.get('reserveError').textContent,/изменились/);assert.equal(nodes.get('reserveSubmit').disabled,true);assert.equal(nodes.get('reserveRefresh').hidden,false);
  await nodes.get('reserveRefresh').fire('click');assert.equal(nodes.get('detailDialog').hidden,false);assert(nodes.get('detailContent').innerHTML.includes(new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(car.quote.total_rub+150000)));
  await t.startReserve(car.id);assert.equal(nodes.get('reserveForm').elements.terms.checked,false);nodes.get('reserveForm').elements.terms.checked=true;await nodes.get('reserveForm').fire('submit');
  let latest=(await t.review.api('/api/bookings')).bookings.at(-1);assert.equal(latest.snapshot.quote.total_rub,car.quote.total_rub+150000);assert.equal(b.snapshot.quote.total_rub,car.quote.total_rub);
  t.review.simulate('hold_expired',car.id);latest=(await t.review.api('/api/bookings')).bookings.at(-1);assert.equal(latest.status,'expired');assert.equal(latest.invoice_status,'void');
  for(const scenario of ['stale','quote_expired','held']){t.review.simulate(scenario,car.id);await t.loadCatalog();assert.equal(t.state.offers.find(o=>o.id===car.id).bookable,false)}
  t.review.simulate('normal',car.id);await t.loadCatalog();assert.equal(t.state.offers.find(o=>o.id===car.id).bookable,true);
  await t.review.api('/api/logout',{});await assert.rejects(()=>t.review.api('/api/bookings'),/Войдите/);
  await assert.rejects(()=>t.review.api('/api/login',{email:'review@example.test',password:'incorrect-password'}),/Неверный/);
  await t.review.api('/api/login',{email:'review@example.test',password:'Review-only-2026'});
  t.review.setMode('actual');await t.loadCatalog();const preliminary=t.state.offers.find(o=>o.country==='US');const previousBookings=(await t.review.api('/api/bookings')).bookings.length;
  await t.startInquiry(preliminary.id);assert(!nodes.get('inquiryDialog').hidden);assert.match(nodes.get('inquirySummary').innerHTML,/USD/);
  const selection=nodes.get('inquiryForm');selection.elements.phone.value='+7 999 000-00-00';selection.elements.city.value='Москва';selection.elements.confirmed.checked=true;await selection.fire('submit');
  assert(!nodes.get('accountDialog').hidden);assert.match(nodes.get('inquiries').innerHTML,/Связываемся с продавцом/);assert.equal((await t.review.api('/api/inquiries')).inquiries.length,1);assert.equal((await t.review.api('/api/bookings')).bookings.length,previousBookings);
  const request=(await t.review.api('/api/inquiries')).inquiries[0];assert.equal(request.snapshot.source_price,preliminary.source_price);await assert.rejects(()=>t.review.api('/api/inquiries/'+request.id,{action:'proposal'}),/сотруднику/);
  await t.review.api('/api/inquiries/'+request.id,{action:'cancel'});await t.account();assert.match(nodes.get('inquiries').innerHTML,/Заявка отменена/);
  t.review.setMode('test');await t.review.api('/api/account/request',{kind:'withdraw'});await assert.rejects(()=>t.review.api('/api/reserve',{}),/Кабинет ограничен/);
  t.review.setMode('actual');await t.loadCatalog();assert.equal(t.state.offers.filter(x=>x.country==='US').length,7);assert(t.state.offers.every(x=>!x.bookable));
  const unquoted=t.state.offers.find(o=>o.country==='KR');t.toggleComparison(unquoted.id);await nodes.get('compareOpen').fire('click');assert.match(nodes.get('compareCards').innerHTML,/Не рассчитан/);assert.match(nodes.get('compareCards').innerHTML,/Оценка источника/);assert.match(nodes.get('compareCards').innerHTML,/Данные не предоставлены/);
  t.detail(unquoted.id);const changedSource=await api('/api/catalog');changedSource.offers.find(o=>o.id===unquoted.id).source_price_rub+=100000;t.review.api=async(url,d)=>url==='/api/catalog'?structuredClone(changedSource):api(url,d);await t.loadCatalog();assert.match(nodes.get('compareCards').innerHTML,/Оценка источника изменилась/);assert(nodes.get('detailContent').innerHTML.includes(new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(unquoted.source_price_rub+100000)));t.review.api=api;
  nodes.get('reviewData').value='intake';await nodes.get('reviewData').fire('change');assert.equal(nodes.get('reviewUsIntake').hidden,false);assert.equal((nodes.get('reviewIntakeCards').innerHTML.match(/<article /g)||[]).length,7);assert.match(nodes.get('reviewIntakeCards').innerHTML,/USD/);
  assert.equal(t.state.comparison.size,0);
  t.reviewNav('entry');assert(!nodes.get('reviewEntry').hidden);assert(main.hidden);
  assert(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(html));assert(Buffer.byteLength(html)<15_000_000);
  console.log('Passed: VIN/lot/model search, comparison limit/refresh/missing/unknown-price, open-detail refresh, out-of-order response protection; existing entry/catalog/auth/booking/invoice/buyer/documents/contract/expiry/privacy/USA intake flows. DOM harness only; no browser/layout QA.');
})().catch(e=>{console.error(e);process.exitCode=1});
