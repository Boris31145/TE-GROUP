// Review adapter only. No requests, no persistence and no actual reservations/payments.
function createReview(seed, actual, legal) {
  let user=null, profiles=new Map(), bookings=[], inquiries=[], mode='actual', sequence=0;
  const offers=structuredClone(seed.offers);
  const now=()=>Math.floor(Date.now()/1000);
  const clone=x=>structuredClone(x);
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  function expire(){for(const b of bookings)if(['reserved','contract_review','contract_accepted'].includes(b.status)&&b.expires<=now()){b.status='expired';b.invoice_status='void'}}
  function publicOffer(o){expire();const held=bookings.some(b=>b.offer_id===o.id&&!['expired','cancelled'].includes(b.status));return {...clone(o),bookable:!o.stale&&!held&&o.quote_expires>now(),availability:held?'reserved':(o.stale||o.quote_expires<=now())?'unconfirmed':'confirmed'}}
  function owned(id){expire();const b=bookings.find(b=>b.id===id&&b.user_id===user?.id);if(!b)throw Error('Бронирование не найдено.');return b}
  function conflict(message){const e=Error(message);e.status=409;throw e}
  function preparation(b){const buyer=b.buyer||null;const q=b.snapshot.quote;const documents=[['supplier','Подтверждение продавца','Тестовое подтверждение продавца'],['inspection','Осмотр и состояние автомобиля',q.inspection_reference],['export','Экспортные документы',q.export_document_reference]].map(([kind,label,reference])=>({kind,label,reference:b.documentsVerified?'ТЕСТОВОЕ подтверждение / '+label:reference||'',status:b.documentsVerified?'verified':reference?'received':'missing',note:b.documentsVerified?'Симуляция проверки, реального документа нет':'',revision:0}));const blockers=(buyer?[]:['Покупатель не передал данные для договора']).concat(documents.filter(d=>d.status!=='verified').map(d=>d.label+': требуется проверка сотрудника'));return {buyer:clone(buyer),revision:b.buyerRevision||0,submitted_at:b.buyerSubmitted||null,documents,blockers,ready:!blockers.length,return_note:b.returnNote||null}}
  function visibleBooking(b){return {...clone(b),preparation:preparation(b)}}
  return {
    legal, get mode(){return mode}, setMode(value){mode=value},
    intake(){return clone((actual.intake||[]).map(o=>({...o,review_image:actual.offers.find(x=>x.id===o.id)?.review_images?.[0]})))},
    simulate(kind,id){
      if(mode!=='test')return;
      if(['docs_verified','details_returned'].includes(kind)){
        expire();const b=bookings.findLast(b=>b.user_id===user?.id&&b.status==='contract_review');
        if(!b)throw Error('Сначала передайте данные покупателя на оформление.');
        if(kind==='docs_verified')b.documentsVerified=true;
        else{b.status='reserved';b.returnNote='ТЕСТ: уточните ФИО покупателя по документу перед оформлением.'}
        return;
      }
      if(kind==='hold_expired'){const b=bookings.findLast(b=>b.user_id===user?.id&&['reserved','contract_review','contract_accepted'].includes(b.status));if(b){b.expires=now()-1;expire()}return}
      const o=offers.find(o=>o.id===id)||offers.find(o=>o.country==='US');const base=seed.offers.find(x=>x.id===o.id);
      // Only simulated competitor bookings may be removed by the reviewer.
      bookings=bookings.filter(b=>!b.simulated);
      const version=o.version+1;Object.assign(o,clone(base),{version,stale:false,quote_expires:now()+86400});
      if(kind==='price_changed'){o.quote.vehicle_rub+=150000;o.quote.company_rub+=150000;o.quote.total_rub+=150000;o.source_price_rub+=150000}
      if(kind==='stale')o.stale=true;
      if(kind==='quote_expired')o.quote_expires=now()-1;
      if(kind==='held')bookings.push({id:'simulated-other-customer',user_id:'another-review-user',offer_id:o.id,status:'reserved',expires:now()+3600,simulated:true});
    },
    async api(url,d){
      if(url==='/api/session')return {user:clone(user),csrf:'offline-review',legal_version:'2026-10-10.legal.3',contract_consent_version:'2026-10-10.contract-request.2',mode:'review'};
      if(url==='/api/catalog'){
        const rows=mode==='test'?offers.map(publicOffer):clone(actual.offers);
        return {offers:rows,mix:Object.fromEntries(['US','KR','CN'].map(c=>[c,{available:rows.filter(o=>o.country===c).length}])),sources:mode==='test'?[{source:'Тестовый сценарий',message:'Вымышленные предложения и цены. Обновления источников здесь не выполняются.',attempted:seed.generated_at}]:clone(actual.sources)};
      }
      if(url==='/api/register'){
        if(!d.consent||d.legal_version!=='2026-10-10.legal.3')throw Error('Подтвердите заявление о создании кабинета.');
        const email=String(d.email||'').trim().toLowerCase(),name=String(d.name||'').trim();
        if(!name||name.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)throw Error('Проверьте имя и email.');
        if(!d.password||d.password.length<12||d.password.length>128)throw Error('Пароль должен содержать от 12 до 128 символов.');
        if(profiles.has(email))throw Error('Этот email уже зарегистрирован в текущем просмотре.');
        const p={id:'review-user-'+profiles.size,email,name,role:'customer',withdrawn:false};
        profiles.set(email,{profile:p,passwordHash:await hash(d.password)});user=p;return {};
      }
      if(url==='/api/login'){
        const p=profiles.get(String(d.email).trim().toLowerCase());
        if(!p||p.passwordHash!==await hash(d.password))throw Error('Неверный email или пароль.');user=p.profile;return {};
      }
      if(url==='/api/logout'){user=null;return {}}
      if(!user)throw Error('Войдите в кабинет.');
      if(url==='/api/inquiries'&&!d)return {inquiries:clone(inquiries.filter(r=>r.user_id===user.id))};
      if(url==='/api/inquiries'&&d){
        if(user.withdrawn)throw Error('Кабинет ограничен. Новые заявки недоступны.');
        if(!d.confirmed||d.request_version!=='2026-10-10.selection.1')throw Error('Подтвердите запрос подготовки предложения.');
        const rows=mode==='test'?offers.map(publicOffer):actual.offers;const o=rows.find(o=>o.id===d.offer_id);
        if(!o||o.version!==d.version)conflict('Предложение изменилось. Откройте актуальную карточку.');
        if(o.source_expired||o.availability==='reserved')conflict('Автомобиль недоступен для выбора.');
        const phone=String(d.phone||'').trim(),digits=phone.replace(/\D/g,''),city=String(d.city||'').trim();
        if(!/^\+?[0-9 ()-]{10,24}$/.test(phone)||digits.length<10||digits.length>15||city.length<2||city.length>120)throw Error('Проверьте телефон и город доставки.');
        const old=inquiries.find(r=>r.user_id===user.id&&r.offer_id===o.id&&['pending','proposal'].includes(r.status));if(old)return clone(old);
        const r={id:'review-inquiry-'+(++sequence),user_id:user.id,offer_id:o.id,status:'pending',created:now(),snapshot:clone(o),contact:{phone:'+'+digits,city},proposal_current:false,reply:null};inquiries.push(r);return clone(r);
      }
      const inquiry=url.match(/^\/api\/inquiries\/([^/]+)$/);
      if(inquiry&&d){const r=inquiries.find(r=>r.id===inquiry[1]&&r.user_id===user.id);if(!r)throw Error('Заявка не найдена.');if(d.action!=='cancel')throw Error('Действие доступно сотруднику.');r.status='cancelled';return clone(r)}
      if(url==='/api/bookings'){expire();return {bookings:bookings.filter(b=>b.user_id===user.id).map(visibleBooking)}}
      if(url==='/api/reserve'){
        if(mode!=='test')throw Error('В срезе источников бронирование недоступно.');
        if(user.withdrawn)throw Error('Кабинет ограничен по вашему запросу. Новое бронирование недоступно.');
        const previous=bookings.find(b=>b.user_id===user.id&&b.idempotency===d.idempotency);
        if(previous){if(previous.offer_id!==d.offer_id)throw Error('Ключ брони уже использован.');return clone(previous)}
        const o=offers.find(x=>x.id===d.offer_id);if(!o)throw Error('Предложение снято с продажи.');
        if(d.version!==o.version)conflict('Цена или условия изменились. Откройте актуальную карточку и подтвердите новую смету.');
        if(d.terms_version!=='2026-10-10.legal.3')throw Error('Условия бронирования изменились.');
        if(!publicOffer(o).bookable)conflict('Автомобиль уже забронирован либо смета недействительна.');
        const b={id:'review-booking-'+(++sequence),user_id:user.id,offer_id:o.id,status:'reserved',created:now(),expires:now()+3600,idempotency:d.idempotency,invoice_id:sequence,invoice_status:'draft',invoice_amount:null,snapshot:{offer:clone(o),quote:clone(o.quote),customer:{name:user.name,email:user.email},version:o.version,delivery:{minimum_months:2,note:'Срок поставки — от двух месяцев. Точный срок и начало его отсчета согласуются в договоре.'}}};
        bookings.push(b);for(const r of inquiries)if(r.user_id===user.id&&r.offer_id===o.id&&['pending','proposal'].includes(r.status))r.status='booked';return clone(b);
      }
      if(url==='/api/account/request'){
        if(d.kind==='withdraw')user.withdrawn=true;
        return {request_id:'review-request-'+(++sequence)};
      }
      const m=url.match(/^\/api\/bookings\/([^/]+)\/(cancel|request_contract|prepare_contract)$/);
      if(m){const b=owned(m[1]);if(m[2]==='cancel'){
        if(!['reserved','contract_review','contract_accepted'].includes(b.status))throw Error('Эту бронь уже нельзя отменить.');b.status='cancelled';b.invoice_status='void';
      }else if(m[2]==='prepare_contract'){
        if(user.withdrawn)throw Error('Кабинет ограничен по вашему запросу. Передача новых данных недоступна.');
        if(b.status!=='reserved')conflict('Изменение данных сейчас недоступно. Обновите кабинет.');
        if(!d.consent||d.consent_version!=='2026-10-10.contract-request.2')throw Error('Подтвердите запрос подготовки договора.');
        if(!d.destination_confirmed)throw Error('Подтвердите пункт доставки из зафиксированной сметы.');
        const name=String(d.full_name||'').trim(),phone=String(d.phone||'').trim(),digits=phone.replace(/\D/g,'');
        if(name.length<5||name.length>160||name.split(/\s+/).length<2||/[\u0000-\u001f]/.test(name))throw Error('Укажите фамилию и имя; отчество — при наличии.');
        if(!/^\+?[0-9 ()-]{10,24}$/.test(phone)||digits.length<10||digits.length>15)throw Error('Проверьте номер телефона, включая код страны.');
        if(d.revision!==(b.buyerRevision||0))conflict('Данные изменились. Обновите кабинет.');
        if(Object.keys(d).some(k=>!['full_name','phone','destination_confirmed','consent','consent_version','revision'].includes(k)))throw Error('Форма содержит неподдерживаемые поля.');
        b.buyer={full_name:name,phone:'+'+digits,email:user.email,destination:b.snapshot.quote.destination};b.buyerRevision=(b.buyerRevision||0)+1;b.buyerSubmitted=now();b.status='contract_review';
      }else{if(b.status!=='reserved'||!b.buyer)throw Error('Сначала заполните данные для договора.');b.status='contract_review'}return visibleBooking(b)}
      throw Error('Действие не предусмотрено в просмотре.');
    },
    booking(id){return visibleBooking(owned(id))},
    export(){return {profile:clone(user),inquiries:clone(inquiries.filter(r=>r.user_id===user?.id)),bookings:clone(bookings.filter(b=>b.user_id===user?.id))}}
  };
}
