/* Browser-only document generation. No customer data leaves this module. */
(function(global){
  'use strict';
  const country={US:'США',KR:'Республика Корея',CN:'Китай'};
  const buyerFields=['full_name','phone','email','address','document_type','passport_series','passport_number','passport_issued_by','passport_issue_date','passport_department_code'];
  function validateBuyer(input){
    const buyer=Object.fromEntries(buyerFields.map(key=>[key,String(input[key]||'').trim()]));
    if(buyer.full_name.length<5||buyer.full_name.length>160)throw Error('Укажите фамилию, имя и отчество при наличии.');
    buyer.phone=buyer.phone.replace(/[\s()-]/g,'');
    if(!/^\+\d{10,15}$/.test(buyer.phone))throw Error('Укажите телефон с кодом страны, например +7 999 000-00-00.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)||buyer.email.length>200)throw Error('Проверьте email.');
    if(buyer.address.length<10||buyer.address.length>400)throw Error('Укажите полный адрес покупателя.');
    if(!['Паспорт РФ','Иной документ'].includes(buyer.document_type))throw Error('Выберите документ, удостоверяющий личность.');
    if(buyer.document_type==='Паспорт РФ'){
      buyer.passport_series=buyer.passport_series.replace(/\s/g,'');buyer.passport_number=buyer.passport_number.replace(/\s/g,'');
      if(!/^\d{4}$/.test(buyer.passport_series)||!/^\d{6}$/.test(buyer.passport_number))throw Error('Паспорт РФ: укажите серию из 4 цифр и номер из 6 цифр.');
      if(buyer.passport_department_code&&!/^\d{3}-\d{3}$/.test(buyer.passport_department_code))throw Error('Код подразделения указывается в формате 000-000.');
    }else if(buyer.passport_number.length<3||buyer.passport_number.length>30||buyer.passport_series.length>20)throw Error('Проверьте серию и номер документа.');
    if(buyer.passport_issued_by.length<5||buyer.passport_issued_by.length>250)throw Error('Укажите орган, выдавший документ.');
    const issued=new Date(buyer.passport_issue_date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(buyer.passport_issue_date)||!Number.isFinite(issued.getTime())||issued.toISOString().slice(0,10)!==buyer.passport_issue_date||issued.getTime()>Date.now())throw Error('Проверьте дату выдачи документа.');
    if(Object.values(buyer).some(v=>/[\x00-\x1f\x7f]/.test(v)))throw Error('Удалите служебные символы из полей.');
    buyer.identity=[buyer.document_type,buyer.passport_series,buyer.passport_number,'выдан '+buyer.passport_issued_by,buyer.passport_issue_date.split('-').reverse().join('.'),buyer.passport_department_code&&'код '+buyer.passport_department_code].filter(Boolean).join(', ');
    return buyer;
  }
  function makeSnapshot(offer,input,settings,acceptedAt,now=Date.now()){
    if(!acceptedAt)throw Error('Сначала подтвердите отдельное согласие на обработку данных.');
    if(!offer||!country[offer.country]||offer.source_expired||offer.availability==='reserved')throw Error('Автомобиль недоступен для оформления.');
    const buyer=validateBuyer(input);
    if(offer.vin&&offer.quote?.vin&&offer.vin.toUpperCase()!==offer.quote.vin.toUpperCase())throw Error('VIN автомобиля и сметы не совпадает. Оформление остановлено.');
    const localDate=global.TEPaymentInstructions.moscowDate(now).split('.').reverse().join('');
    const id='TE-'+localDate+'-'+global.crypto.randomUUID();
    const selectedOffer=structuredClone(offer);
    if(selectedOffer.vin&&!/^[A-HJ-NPR-Z0-9]{17}$/i.test(selectedOffer.vin)){selectedOffer.vin_mask=selectedOffer.vin;selectedOffer.vin=null;}
    return {id,document_number:id.slice(0,20).toUpperCase(),created_at:now,accepted_at:acceptedAt,consent_version:settings.consent_version,contract_version:settings.contract_version,
      offer:selectedOffer,buyer,company:structuredClone(settings.operator),payment:global.TEPaymentInstructions.validateBank(settings.payment),
      payment_terms:{amount_kopecks:global.TEPaymentInstructions.invoiceAmount({offer:selectedOffer}),currency:'RUB',basis:'selected_listing',price_captured_at:now},
      contract_terms:structuredClone(settings.contract),consent_text:settings.consent_text,
      draft:true,delivery_note:'Поставка — 2–4 календарных месяца со дня поступления согласованного аванса по заключённому договору.',
      blockers:['Индивидуальные условия и применимые налоговые условия подтверждаются при подписании договора.',
        'ФИО представителя и основание полномочий указываются до подписания.',
        ...(!offer.bookable||!offer.quote||offer.quote_expires<=now/1000||offer.stale?['Доступность и окончательная цена требуют подтверждения TE GROUP.']:[])]};
  }
  async function createPdf(snapshot,kind,resources){
    if(global.TEPremiumPdf)return global.TEPremiumPdf.create(snapshot,resources,kind);
    throw Error('Не загружен фирменный шаблон PDF. Обновите страницу.');
  }

  global.TELocalDocuments={buyerFields,validateBuyer,makeSnapshot,createPdf};
})(typeof window!=='undefined'?window:globalThis);
