function reviewPage(id,scroll=true){
  const ids=['reviewEntry','reviewGoods','reviewDocument','reviewUsIntake','reviewConfirmDialog','detailDialog','authDialog','accountDialog','reserveDialog','buyerDialog','compareDialog','inquiryDialog'];
  for(const p of ids)$(p).hidden=p!==id;
  root.querySelector('main.wrap').hidden=id!=='cars';
  $('toast').hidden=true;
  const goods=id==='reviewGoods',entry=id==='reviewEntry';
  $('accountButton').hidden=goods||entry;
  for(const [nav,active] of [['navGoods',goods],['navCars',!goods&&!entry]]){
    $(nav).classList.toggle('active',active);$(nav).setAttribute('aria-current',active?'page':'false');
  }
  if(scroll&&root.scrollIntoView)root.scrollIntoView({block:'start',behavior:'auto'});
}
function open(id){reviewPage(id)}
function close(id){if(!$(id).hidden){$(id).hidden=true;reviewPage('cars')}}
let reviewConfirmResolve=null;
function reviewMedia(o,index=0){const image=(o.review_images||[o.review_image])[index];return image?`<img src="${image}" alt="${esc(o.title)} — фото из сохранённого среза" loading="lazy">`:`<span class="review-filler"><small>Фото автомобиля не предоставлено</small></span>`}
function reviewNav(target){if(reviewConfirmResolve){reviewConfirmResolve(false);reviewConfirmResolve=null}state.pending=null;reviewPage(target==='entry'?'reviewEntry':target==='goods'?'reviewGoods':'cars')}
function reviewConfirm(message){$('reviewConfirmMessage').textContent=message;reviewPage('reviewConfirmDialog');return new Promise(resolve=>{reviewConfirmResolve=resolve})}
for(const [id,value] of [['reviewConfirmYes',true],['reviewConfirmNo',false]])$(id).addEventListener('click',()=>{const resolve=reviewConfirmResolve;reviewConfirmResolve=null;reviewPage('accountDialog');if(resolve)resolve(value)});
$('reviewWidth').addEventListener('click',()=>{const expanded=root.classList.toggle('expanded');$('reviewWidth').textContent=expanded?'Мобильная ширина':'На всю ширину'});
$('reviewData').addEventListener('change',async()=>{review.setMode($('reviewData').value);clearComparison();state.detailId=null;state.pending=null;$('reviewScenario').hidden=review.mode!=='test';$('reviewScenarioField').hidden=review.mode!=='test';$('reviewMode').textContent=review.mode==='test'?'Тестовый просмотр · цены вымышленные · без оплаты':review.mode==='intake'?'Лоты США · срез 10.10.2026 · только цена выкупа':'Срез источников · заявки только для проверки · без обновления и оплаты';if(review.mode==='intake'){renderIntake();reviewPage('reviewUsIntake');return}reviewPage('cars');await loadCatalog()});
$('reviewScenario').addEventListener('change',async()=>{const selected=state.pending||state.reservation?.id||state.offers.find(o=>o.country===state.country)?.id;try{review.simulate($('reviewScenario').value,selected)}catch(e){toast(e.message);return}await loadCatalog();if(!$('accountDialog').hidden)await account();else if(!$('detailDialog').hidden)detail(selected);toast('Тестовое состояние применено к выбранной машине.');});
function renderIntake(){
  $('reviewIntakeCards').innerHTML=review.intake().map(o=>`<article class="car-card"><div class="car-media">${o.review_image?`<img src="${o.review_image}" alt="${esc(o.title)} — фото лота источника" loading="lazy">`:'<span class="no-photo">Фото источника не сохранено</span>'}<span class="badge">США / реальный срез</span></div><div class="car-body"><span class="status">Кандидат для сметы · бронирование недоступно</span><h3>${esc(o.title)}</h3><p class="specs">${o.year} · ${Number(o.mileage_km).toLocaleString('ru-RU')} км</p><p class="specs">${esc(o.location)}</p><div class="price-area"><span class="price-label">Buy Now · только выкуп лота</span><strong class="price">${Number(o.source_price).toLocaleString('en-US')} USD</strong><p class="price-hint">Полный бюджет в рублях не рассчитан.</p></div><button class="outline cursor-interaction" data-intake-detail="${esc(o.id)}">VIN, состояние и источник</button></div></article>`).join('');
}
$('reviewFill').addEventListener('click',()=>{const f=$('authForm');f.elements.name.value='Тестовый покупатель';f.elements.email.value='review@example.test';f.elements.password.value='Review-only-2026';$('authError').textContent='Тестовые поля заполнены. Ознакомьтесь с документами и отметьте согласие самостоятельно.'});
$('reviewBuyerFill').addEventListener('click',()=>{const f=$('buyerForm');f.elements.full_name.value='Тестов Иван Иванович';f.elements.phone.value='+7 999 000-00-00';$('buyerError').textContent='Данные вымышленные. Подтвердите пункт доставки и согласие самостоятельно.'});
let returnPage='cars';
function reviewDocument(title,body,back='cars',print=false){returnPage=back;$('reviewDocumentContent').innerHTML=`<span class="eyebrow">TE GROUP / ДОКУМЕНТЫ</span><h1>${esc(title)}</h1>${body}`;$('reviewPrint').hidden=!print;reviewPage('reviewDocument')}
$('reviewDocumentBack').addEventListener('click',()=>reviewPage(returnPage));
$('reviewPrint').addEventListener('click',()=>{if(typeof window.print==='function')window.print()});
function reviewInvoice(b){
  const q=b.snapshot.quote,c=b.snapshot.customer;
  return `<p class="notice">${b.invoice_status==='void'?'Черновик аннулирован.':'Тестовый черновик. Реквизиты и сумма аванса не утверждены.'} Оплате не подлежит.</p><div class="review-document-lines"><div><span>Покупатель</span>${esc(b.preparation?.buyer?.full_name||c.name)} · ${esc(c.email)}</div><div><span>Автомобиль</span>${esc(b.snapshot.offer.title)}</div><div><span>Бронь</span>${esc(b.id)}</div><div><span>Аванс</span>Сумма не установлена</div><div><span>Банк и реквизиты</span>Ожидают утверждения компании</div></div>${quoteHtml(q)}<p>Счет относится к авансу компании. Самостоятельные расходы российского покупателя оплачиваются отдельно.</p>`;
}
function reviewContract(b){
  return `<p class="notice">Тестовый проект. Требует утверждения и отдельного подписания сторонами.</p><p>Покупатель: ${esc(b.preparation.buyer?.full_name||b.snapshot.customer.name)}. Бронь: ${esc(b.id)}.</p><h2>${esc(b.snapshot.offer.title)}</h2>${quoteHtml(b.snapshot.quote)}<p>${esc(b.snapshot.delivery?.note||'Срок поставки согласуется в договоре.')}</p>${preparationHtml(b)}<h2>Обязанности сторон</h2><p>Компания продает автомобиль с доставкой до согласованного таможенного терминала / СВХ. Российский покупатель выполняет импорт для личного пользования, оплачивает свои импортные платежи и дальнейшую доставку.</p><p>До подписания согласуются сроки, возврат и зачет аванса, риски отказа продавца, состояние автомобиля и стоимость ремонта. Передача данных не заменяет подпись.</p>${review.legal['contract-terms']}`;
}
root.addEventListener('click',e=>{
  const intake=e.target.closest('[data-intake-detail]');if(intake){const o=review.intake().find(o=>o.id===intake.dataset.intakeDetail);if(!o)return;reviewDocument(o.title,`<p class="notice">Реальный срез CarsFromUSA от ${date(o.updated_at)}. Доступность и документы не подтверждены TE GROUP.</p><p><b>${Number(o.source_price).toLocaleString('en-US')} USD</b> — цена Buy Now, только выкуп.</p><p>${esc(o.price_basis)}</p>${teVehicleCondition(o,esc)}<p>Местонахождение: ${esc(o.location)}. Планируемые торги по данным источника: ${date(o.source_expires_at)}.</p><p><a href="${esc(o.source_url)}" target="_blank" rel="noopener noreferrer">Открыть лот источника ↗</a></p>`,'reviewUsIntake');return}
  const nav=e.target.closest('[data-review-nav]');if(nav){reviewNav(nav.dataset.reviewNav);return}
  const a=e.target.closest('a');if(!a||!root.contains(a))return;
  const href=a.getAttribute('href');
  if(href==='/'||href==='/goods/'||href==='/cars/'){e.preventDefault();reviewNav(href==='/'?'entry':href==='/goods/'?'goods':'cars');return}
  const l=href?.match(/^\/legal\/(privacy|consent|reservation|contract-consent|contract-template)\/?$/);
  if(l){e.preventDefault();const p=['authDialog','reserveDialog','buyerDialog','inquiryDialog','accountDialog','detailDialog'].find(x=>!$(x).hidden)||'cars';reviewDocument({privacy:'Конфиденциальность и обработка данных',consent:'Заявление о создании кабинета',reservation:'Условия бронирования','contract-consent':'Запрос подготовки договора','contract-template':'Проект договора купли продажи'}[l[1]],review.legal[l[1]],p);return}
  const b=href?.match(/^\/api\/bookings\/([^/]+)\/(invoice|contract)$/);
  if(b){e.preventDefault();try{const booking=review.booking(b[1]);reviewDocument(b[2]==='invoice'?`Черновик счета № TE-${String(booking.invoice_id).padStart(6,'0')}`:'Проект договора и смета',b[2]==='invoice'?reviewInvoice(booking):reviewContract(booking),'accountDialog',true)}catch(err){toast(err.message)}return}
  if(href==='/api/account/export'){e.preventDefault();const d=review.export();reviewDocument('Мои данные',`<p>Данные текущего тестового просмотра. После перезагрузки они исчезнут.</p><p>Имя: ${esc(d.profile.name)}. Email: ${esc(d.profile.email)}.</p><p>Заявок: ${d.inquiries.length}. Бронирований: ${d.bookings.length}. Кабинет: ${d.profile.withdrawn?'ограничен по запросу':'активен'}.</p>`,'accountDialog');return}
  if(href==='/cars/operations/'){e.preventDefault();reviewDocument('Работа сотрудника',`<p>В полной локальной версии сотрудник подтверждает доступность у продавца, утверждает смету, оформляет договор и фиксирует банковское подтверждение оплаты.</p><p>В автономном просмотре клиент не может подтвердить сам себе договор или платеж.</p>`);return}
});
state.country='all';$('countries').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.country==='all');b.setAttribute('aria-pressed',String(b.dataset.country==='all'))});
$('countries').addEventListener('click',()=>{$('countries').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.country===state.country)))});

reviewPage('reviewEntry',false);
