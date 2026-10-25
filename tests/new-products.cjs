const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.TE_PDF_TEST_OUT||path.resolve(root,'../../deliverables/integration-fixes-2026-10-25/pdf');fs.mkdirSync(out,{recursive:true});
const c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,atob,btoa};c.window=c;c.self=c;vm.createContext(c);
for(const n of ['vendor','settings','payment-instructions','premium-pdf','local-documents','order-documents','balance-invoice','order-balance'])vm.runInContext(fs.readFileSync(path.join(root,'auto-src',n+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'assets/live-pricing.js'),'utf8'),c);
const data=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers,rates=JSON.parse(fs.readFileSync(path.join(root,'assets/currency-rates.json'))),api=c.TEPaymentInstructions,local=c.TELocalDocuments,settings=c.TEDocumentSettings;
const buyer={buyer_type:'company',company_name:'ООО «Тестовый покупатель»',company_inn:'7701234567',company_address:'Москва, улица Примерная, дом 1',full_name:'Образцов Иван Иванович',signatory_role:'Директор',signatory_basis:'Устава',phone:'+79990000000',email:'review@example.test',transfer_terms_confirmed:true,transfer_place:'Бишкек, тестовый склад, дом 1',document_type:'Паспорт РФ',passport_series:'0000',passport_number:'000000',passport_issued_by:'Тестовый орган',passport_issue_date:'2020-01-01',address:'Москва, улица Примерная, дом 1'};
const decode=x=>Uint8Array.from(Buffer.from(x,'base64')),resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
const select=(id,qty,d)=>({...c.TELivePricing.priced(data.find(x=>x.id===id),d,rates),quantity:qty});
const normalize=s=>s.normalize('NFKC').replace(/[\u2011-\u2014]/g,'-').replace(/\s/g,'');
(async()=>{
 globalThis.DOMMatrix??=class DOMMatrix{};const pdfjs=await import(path.join(root,'auto-src/pdfjs/pdf.min.mjs'));pdfjs.GlobalWorkerOptions.workerSrc=path.join(root,'auto-src/pdfjs/pdf.worker.min.mjs');
 const cases=[['new-machinery','RU','company','split',[['new25:semi-container-new',1],['new25:semi-tipper',1],['new25:mixer-sicoma',1]]],['product-single','RU','individual','split',[['new25:maxtrax',1]]],['product-quantity','RU','company','split',[['new25:royal',2],['new25:prinsu',2]]],['mixed-order','KG','company','split',[['new25:maxtrax',3],['new25:prinsu',1],[data.find(x=>x.asset_type==='car'&&!x.source_expired&&x.vin).id,1]]],['product-full','KG','company','full',[['new25:royal',1]]]];
 cases.push(['completed-assortment','RU','company','split',[['new25:dometic',2],['new25:body-a7-bkm',1],['new25:body-a3',1],['new25:body-taycan',1]]],['industrial-assortment','KG','company','split',[['new25:plant-portapour',1],['new25:semi-berger',1]]]);
 cases.push(['verified-closure','RU','company','split',[['new25:ikon-e70',2],['new25:semi-esge',1]]]);
 cases.push(['factory-kits','RU','company','split',[['new25:plant-ms',1],['new25:mixer-bhs',2],['new25:pump-ls450',1]]],['vip-complete','KG','company','split',[['new25:vip-w447',1],['new25:vip-multivan',1],['new25:vip-maybach',1]]],['photo-replacements','RU','company','full',[['new25:ethos',1],['new25:qian-tp06b',1]]],['remaining-equipment','RU','company','split',[['new25:semi-frigo',1],['new25:pump-bsa',1],['new25:pump-sp750',1],['new25:pump-tk',1]]],['factory-dosing','KG','company','split',[['new25:plant-turmac',1],['new25:plant-jr',1],['new25:plant-rex',1],['new25:mixer-conele',2]]]);
 cases.push(['bulk-accessories','RU','company','split',[['new25:rotopax',125],['new25:maxtrax',70]]],['bulk-full','KG','company','full',[['new25:rotopax',100]]]);
 cases.push(['mass-market-split','RU','company','split',[['mass25:camry70-21',2],['mass25:corolla12',1],['mass25:civic11',2],['mass25:k5-gtline',1]]],['mass-market-full','KG','individual','full',[['mass25:camry70-18',1],['mass25:rav4-5',1],['mass25:mazda6-gj',1],['mass25:accord10',1]]],['mass-market-parts','RU','company','split',[['mass25:civic11-front',10],['mass25:civic11-side',5],['mass25:civic11-rear',3]]]);
 const results=[];
 for(const [name,destination_country,buyer_type,payment_option,selection] of cases){
  const items=selection.map(([id,n])=>select(id,n,destination_country)),total=items.reduce((s,o)=>s+api.listingAmountRub(o)*100,0),now=Date.now();
  const snapshot=local.makeSnapshot({id:'test-order',order_items:items},{...buyer,buyer_type,destination_country,payment_option},settings,now,now),frozen=JSON.stringify(snapshot),docs=[snapshot,...(payment_option==='split'?[api.scheduledBalance(snapshot)]:[])];
  if(name==='mass-market-split'){assert.equal(snapshot.order_items.length,4);assert.ok(snapshot.order_groups.every(g=>g.compact));}
  assert.equal(api.orderAmount(snapshot),total);assert.equal(docs.reduce((s,x)=>s+api.invoiceAmount(x),0),total);
  assert.deepEqual(Array.from(snapshot.order_groups,g=>g.quantity),selection.map(x=>x[1]));
  const expectedQr=docs.map(s=>api.requisitesQr(s)),actualQr=[];
  const qrFactory=(...args)=>{const qr=c.qrcode(...args),add=qr.addData;qr.addData=(v,...rest)=>{actualQr.push(v);return add.call(qr,v,...rest)};return qr};Object.defineProperty(qrFactory,'stringToBytes',{get:()=>c.qrcode.stringToBytes,set:v=>c.qrcode.stringToBytes=v});
  const bytes=await local.createPdf(snapshot,'bundle',{...resources,qrcode:qrFactory});assert.deepEqual(actualQr,expectedQr);assert.ok(bytes.length<2000000);
  const job=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}),pdf=await job.promise;let text='';
  for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')+'\n';
  const meta=JSON.parse(new TextDecoder().decode((await pdf.getAttachments())['TE-ORDER.json'].content));
  for(const item of items.filter(x=>x.asset_type==='product')){assert.ok(normalize(text).includes(normalize(item.configuration)));assert.ok(text.includes(item.serial||item.product_code));for(const note of item.purchase_notes||[])assert.ok(normalize(text).includes(normalize(note)), item.id+': purchase note missing');}
  if(name==='product-single')assert.ok(!text.includes('Автомобиль / год'));
  if(payment_option==='split'){
   const imported=await c.TEBalanceInvoice.importPdf(bytes,settings,pdfjs);assert.equal(imported.total_kopecks,total);
   const today=c.TEBalanceInvoice.today(now),balance=c.TEBalanceInvoice.makeBalance(imported,{contract_signed:true,advance_confirmed:true,ready_confirmed:true,balance_unpaid:true,advance_date:today,ready_date:today,advance_reference:'Тестовый платёж',ready_reference:'Тестовое подтверждение',notice_received_date:today,notice_receipt_reference:'Тестовое получение'},settings,now);
   assert.equal(api.invoiceAmount(balance),total/2);assert.equal(balance.invoice_number,snapshot.document_number+'-INV-2');
   if(name==='bulk-accessories'){assert.equal(snapshot.order_items.length,2);assert.ok(pdf.numPages<=10);const altered=structuredClone(meta);altered.groups[0].quantity++;assert.throws(()=>c.TEOrderBalance.verify(altered,text,settings));}
   const bad=structuredClone(meta);bad.items.find(x=>x.offer.asset_type==='product').offer.configuration='Подменённый комплект';assert.throws(()=>c.TEOrderBalance.verify(bad,text,settings));
  }
  fs.writeFileSync(path.join(out,name+'.pdf'),bytes);assert.equal(JSON.stringify(snapshot),frozen);
  results.push({name,total:total/100,pages:pdf.numPages,bytes:bytes.length,qr_amounts:docs.map(x=>api.invoiceAmount(x)/100),quantities:selection.map(x=>x[1])});await job.destroy();
 }
 const aud=data.find(x=>x.pricing?.currency==='AUD'),without=structuredClone(rates);delete without.rates.AUD;
 for(const destination of ['RU','KG']){assert.equal(c.TELivePricing.amount(aud,without,destination).rub,null);assert.equal(api.listingAmountRub(c.TELivePricing.priced(aud,destination,without)),null);assert.throws(()=>api.paymentSchedule(c.TELivePricing.priced(aud,destination,without),'full'));}
 assert.equal(api.listingAmountRub({...data.find(x=>x.id==='new25:maxtrax'),quantity:99}),api.listingAmountRub(data.find(x=>x.id==='new25:maxtrax'))*99);
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:true,cases:results}));
})().catch(e=>{console.error(e);process.exit(1)});
