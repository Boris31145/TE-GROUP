// Real PDF extraction protects compact layouts and fractional-kopeck instalments.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,atob,btoa};c.window=c;c.self=c;vm.createContext(c);
for(const n of ['vendor','settings','payment-instructions','premium-pdf','local-documents','order-documents','balance-invoice','order-balance'])vm.runInContext(fs.readFileSync(path.join(root,'auto-src',n+'.js'),'utf8'),c);

vm.runInContext(fs.readFileSync(path.join(root,'assets/live-pricing.js'),'utf8'),c);
(async()=>{
 const api=c.TEPaymentInstructions,settings=c.TEDocumentSettings,decode=x=>Uint8Array.from(Buffer.from(x,'base64')),resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
 const offers=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers,rates=JSON.parse(fs.readFileSync(path.join(root,'assets/currency-rates.json')));
 const chosen=[['Mikasa MVC-50GB',3],['Furukawa FX25SS',2],['Denyo DCA-60LSIE',1]];
 const buyer={buyer_type:'company',company_name:'ООО «Тестовый смешанный заказ»',company_inn:'7701234567',company_address:'Москва, улица Примерная, 1',full_name:'Тестов Иван Иванович',signatory_role:'Директор',signatory_basis:'Устава',phone:'+79990000000',email:'review@example.test',transfer_terms_confirmed:true,transfer_place:'Бишкек, тестовый склад, улица Примерная, 1'};
 globalThis.DOMMatrix??=class DOMMatrix {};
 const pdfjs=await import(path.join(root,'auto-src/pdfjs/pdf.min.mjs'));pdfjs.GlobalWorkerOptions.workerSrc=path.join(root,'auto-src/pdfjs/pdf.worker.min.mjs');
 const results=[];
 for(const destination_country of ['RU','KG'])for(const payment_option of ['full','split']){
  const items=chosen.map(([title,quantity])=>({...c.TELivePricing.priced(offers.find(x=>x.title===title),destination_country,rates),quantity}));
  const basket=items.reduce((sum,x)=>sum+api.listingAmountRub(x),0),now=Date.now(),s=c.TELocalDocuments.makeSnapshot({id:'mixed-quantity',order_items:items},{...buyer,destination_country,payment_option},settings,now,now);
  assert.equal(s.order_items.length,6);assert.equal(s.order_groups.length,3);assert.equal(api.orderAmount(s),basket*100);
  assert.deepEqual(Array.from(s.order_groups,x=>x.quantity),[3,2,1]);
  for(const [i,group]of s.order_groups.entries()){assert.equal(group.unit_kopecks,api.listingAmountRub({...items[i],quantity:1})*100);assert.equal(group.total_kopecks,group.unit_kopecks*group.quantity);}
  const docs=[s,...(payment_option==='split'?[api.scheduledBalance(s)]:[])],qrs=docs.map(doc=>api.requisitesQr(doc));
  assert.equal(docs.reduce((sum,doc)=>sum+api.invoiceAmount(doc)+(doc.payment_terms.settlement?.vat_kopecks||0),0),basket*100);
  for(const [i,qr]of qrs.entries()){assert.equal(Number(qr.split('|Sum=')[1]),api.invoiceAmount(docs[i]));assert.ok(qr.includes(s.document_number));assert.ok(qr.includes('|PersonalAcc='+settings.payment.account+'|'));}
  // The actual PDF renderer must receive exactly these QR payloads, in invoice order.
  const renderedQr=[];const trackingQr=(...args)=>{const qr=c.qrcode(...args),add=qr.addData;qr.addData=(data,...rest)=>{renderedQr.push(data);return add.call(qr,data,...rest)};return qr;};Object.defineProperty(trackingQr,'stringToBytes',{get:()=>c.qrcode.stringToBytes,set:value=>{c.qrcode.stringToBytes=value}});
  const bytes=await c.TELocalDocuments.createPdf(s,'bundle',{...resources,qrcode:trackingQr});assert.deepEqual(renderedQr,qrs);assert.ok(bytes.length<2000000);
  const job=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}),pdf=await job.promise;let text='';
  for(let page=1;page<=pdf.numPages;page++)text+=(await(await pdf.getPage(page)).getTextContent()).items.map(x=>x.str).join(' ')+'\n';
  const meta=JSON.parse(new TextDecoder().decode((await pdf.getAttachments())['TE-ORDER.json'].content));
  assert.ok(text.includes('Цена за шт., руб.'));assert.ok(text.includes('Кол-во, шт.'));assert.ok(text.includes('Сумма, руб.'));
  const normalized=text.replace(/\s/g,''),money=value=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:value%100?2:0,maximumFractionDigits:2}).format(value/100).replace(/\s/g,'');
  assert.ok(normalized.includes('Общаястоимостьтоваровсоставляет'+money(basket*100)+'руб.'));
  for(const group of meta.groups)assert.ok(normalized.includes((group.title+group.quantity+money(group.unit_kopecks)+money(group.total_kopecks)).replace(/\s/g,'')));
  if(payment_option==='split'){
   assert.ok(c.TEOrderBalance.verify(meta,text,settings));
   for(const change of [m=>m.groups[0].quantity++,m=>m.groups[0].unit_kopecks++,m=>m.groups[0].item_ids[0]=m.groups[1].item_ids[0]]){const bad=structuredClone(meta);change(bad);assert.throws(()=>c.TEOrderBalance.verify(bad,text,settings));}
   const badVisible=text.replace('Сводный расчёт','Сводный расчёт изменён').replace('Mikasa MVC-50GB','Подменённая модель');assert.throws(()=>c.TEOrderBalance.verify(meta,badVisible,settings));
  }
  const result={destination_country,payment_option,basket,rows:meta.groups,first:api.invoiceAmount(docs[0])/100,second:docs[1]?api.invoiceAmount(docs[1])/100:0,pages:pdf.numPages,bytes:bytes.length,qr:qrs};results.push(result);
  if(process.env.PDF_OUTPUT_DIR&&payment_option==='split'){fs.mkdirSync(process.env.PDF_OUTPUT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PDF_OUTPUT_DIR,'mixed-'+destination_country+'.pdf'),bytes);}
  await job.destroy();
  const frozen=JSON.stringify(s);items[0].quantity=6;items[0].customer_price_rub=1;assert.equal(JSON.stringify(s),frozen);
 }
 if(process.env.PDF_OUTPUT_DIR)fs.writeFileSync(path.join(process.env.PDF_OUTPUT_DIR,'checks.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({passed:'mixed quantities 3/2/1, basket, grouped unit prices, contract, full/split, actual PDF, both QR payloads, import and tamper rejection',cases:results.map(({rows,qr,...x})=>x)}));
})().catch(e=>{console.error(e);process.exit(1)});
