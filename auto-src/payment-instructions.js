/* Browser-local bank requisites and purpose. No network or customer storage.
 * ST00012 carries actual requisites, not an acquiring/SBP URL or payment status.
 */
(function(global){
  'use strict';
  const fail=message=>{throw Error(message)};
  function field(value,label,max=210){
    const s=String(value??'').trim();
    if(!s||s.length>max||/[|\x00-\x1f\x7f]/.test(s))fail('Проверьте поле «'+label+'».');
    return s;
  }
  function moscowDate(timestamp){
    if(!Number.isFinite(timestamp))fail('Не указана дата договора.');
    return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(timestamp));
  }
  function validateBank(b){
    if(!b||b.currency!=='RUB')fail('Для этого счета требуются рублевые реквизиты.');
    field(b.beneficiary_name,'Получатель',160);field(b.bank_name,'Банк',100);
    if(!/^\d{9}$/.test(b.bic)||!/^\d{20}$/.test(b.account)||!/^\d{20}$/.test(b.correspondent_account))fail('Неверный формат счета или БИК.');
    const control=s=>[...s].reduce((sum,c,i)=>sum+Number(c)*[7,1,3][i%3],0)%10;
    if(control(b.bic.slice(-3)+b.account)||control('0'+b.bic.slice(4,6)+b.correspondent_account))fail('Не совпадает контрольная цифра банковского счета.');
    if(!/^\d{10}$/.test(b.russian_inn)||[...b.russian_inn.slice(0,9)].reduce((n,c,i)=>n+Number(c)*[2,4,10,3,5,9,4,6,8][i],0)%11%10!==Number(b.russian_inn[9]))fail('Неверный российский ИНН получателя.');
    if(!/^\d{9}$/.test(b.kpp))fail('Неверный КПП получателя.');
    return structuredClone(b);
  }
  function purpose(snapshot,{kind='payment',taxClause=null,contractDate=snapshot.created_at}={}){
    const action={payment:'Оплата',advance:'Аванс',balance:'Доплата'}[kind];
    if(!action)fail('Не указан вид платежа.');
    const number=field(snapshot.document_number||snapshot.id,'Номер договора',50);
    // Do not omit a VIN or silently cut a contract number to fit a bank field.
    const car=field(snapshot.offer.title,'Автомобиль',100);
    const vin=snapshot.offer.quote?.vin||snapshot.offer.vin;
    if(vin&&!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin))fail('Проверьте VIN для назначения платежа.');
    let text=action+' за автомобиль '+car+(vin?', VIN '+vin.toUpperCase():'')+' по договору купли-продажи № '+number+' от '+moscowDate(contractDate)+'.';
    if(taxClause)text+=' '+field(taxClause,'Налоговая оговорка',70);
    return field(text,'Назначение платежа',210);
  }
  function draft(snapshot){
    const bank=validateBank(snapshot.payment);
    return {bank,purpose:purpose(snapshot),amount_kopecks:invoiceAmount(snapshot),currency:'RUB',payable:false,qr_payload:requisitesQr(snapshot),
      qr_note:'Получатель, назначение и сумма из выбранного объявления заполняются из QR. Оплачивайте после подписания договора.'};
  }
  function listingAmountRub(offer){
    const value=[offer.quote?.total_rub,offer.customer_price_rub,offer.display_price_rub,offer.source_price_rub].find(v=>typeof v==='number'&&Number.isFinite(v)&&v>0);
    // The catalogue displays whole roubles. Freeze exactly that displayed amount.
    return value===undefined?null:Math.round(value);
  }
  function invoiceAmount(snapshot){
    const frozen=snapshot.payment_terms?.amount_kopecks;
    const rub=listingAmountRub(snapshot.offer);
    const amount=frozen===undefined?rub*100:frozen;
    if(!Number.isSafeInteger(amount)||amount<=0)fail('В объявлении отсутствует корректная цена в рублях. Счёт не сформирован.');
    return amount;
  }
  function requisitesQr(snapshot){
    const b=validateBank(snapshot.payment);
    const fields=[['Name',field(b.beneficiary_name,'Получатель',160)],['PersonalAcc',b.account],
      ['BankName',field(b.bank_name,'Банк',45)],['BIC',b.bic],['CorrespAcc',b.correspondent_account],
      ['PayeeINN',b.russian_inn],['KPP',b.kpp],['Purpose',purpose(snapshot)],['Sum',String(invoiceAmount(snapshot))]];
    // Sum uses integer kopecks, from the same frozen order as the printed invoice.
    return 'ST00012|'+fields.map(([key,value])=>key+'='+value).join('|');
  }
  // Trusted issuing service only. This builds a provider-neutral request, not
  // a VTB API call. Amounts and authorizations must come from the signed order,
  // never from a browser form or a catalogue's indicative price.
  function bankRequest(snapshot,terms){
    const bank=validateBank(snapshot.payment),t=terms||{};
    if(t.contract_signed!==true||t.company_approved!==true||!t.approval_reference)fail('Нужны подписанный договор и утвержденный платеж.');
    if(!Number.isSafeInteger(t.amount_kopecks)||t.amount_kopecks<=0)fail('Не согласована сумма счета в копейках.');
    if(!Number.isSafeInteger(t.remaining_company_kopecks)||t.amount_kopecks>t.remaining_company_kopecks)fail('Счет превышает остаток к оплате компании.');
    if(t.currency!=='RUB')fail('Валюта счета не совпадает с реквизитами.');
    if(!['sbp','bank_transfer'].includes(t.method))fail('Выберите согласованный с банком способ оплаты.');
    if(t.method==='sbp'&&t.amount_kopecks>bank.qr.sbp_max_amount_kopecks)fail('Сумма превышает лимит одной операции СБП. Выберите банковский перевод.');
    field(t.tax_clause,'Налоговая оговорка',70);
    const number=field(snapshot.document_number||snapshot.id,'Номер договора',50);
    const invoice=field(t.invoice_number,'Номер счета',70);
    return {reference:invoice,contract_number:number,contract_date:moscowDate(t.contract_date),
      amount_kopecks:t.amount_kopecks,currency:'RUB',method:t.method,
      purpose:purpose(snapshot,{kind:t.kind,taxClause:t.tax_clause,contractDate:t.contract_date}),
      beneficiary:{name:bank.beneficiary_name,inn:bank.russian_inn,kpp:bank.kpp,account:bank.account,bic:bank.bic,correspondent_account:bank.correspondent_account},
      qr_format:'bank_issued_upc',approval_reference:field(t.approval_reference,'Основание утверждения',100)};
  }
  global.TEPaymentInstructions={validateBank,moscowDate,purpose,draft,requisitesQr,bankRequest,listingAmountRub,invoiceAmount};
})(typeof window!=='undefined'?window:globalThis);
