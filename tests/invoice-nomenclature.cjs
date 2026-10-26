// Frozen itemisation, payment wording and QR must describe the same purchase.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),src=process.env.TE_DOCUMENT_SOURCE_DIR||path.join(root,'auto-src');
const c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,atob,btoa};c.window=c;c.self=c;vm.createContext(c);
for(const name of ['vendor','settings','payment-instructions','premium-pdf','local-documents','order-documents','balance-invoice','order-balance'])vm.runInContext(fs.readFileSync(path.join(src,name+'.js'),'utf8'),c);
const api=c.TEPaymentInstructions,settings=c.TEDocumentSettings,offers=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers;
const by=title=>({...offers.find(o=>o.title===title),customer_price_rub:100001,display_price_rub:100001,source_price_rub:100001,quote:null});
const buyer={buyer_type:'company',company_name:'ООО «Проверка номенклатуры»',company_inn:'7701234567',company_address:'Москва, улица Примерная, 1',full_name:'Тестов Иван Иванович',signatory_role:'Директор',signatory_basis:'Устава',phone:'+79990000000',email:'review@example.test',transfer_terms_confirmed:true,destination_country:'RU',payment_option:'split'};
const decode=x=>Uint8Array.from(Buffer.from(x,'base64')),resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
const now=Date.parse('2026-10-26T12:00:00+03:00'),basket=order_items=>({id:'invoice-test-order',order_items});
const mixed=basket([{...by('Mikasa MVC-50GB'),quantity:3},{...by('Furukawa FX25SS'),quantity:2},by('Denyo DCA-60LSIE')]);
const product=offers.find(x=>x.id==='mass25:camry70-21'),car=by('Honda Civic Sport');
const cases=[['equipment-full',by('Denyo DCA-60LSIE'),'full'],['single-equipment',by('Denyo DCA-60LSIE'),'split'],['single-car',car,'split'],['equipment-real-values',basket([{...by('Mikasa MVC-50GB'),quantity:3,customer_price_rub:43171},{...by('Furukawa FX25SS'),quantity:2,customer_price_rub:133119},{...by('Denyo DCA-60LSIE'),customer_price_rub:1583635}]),'split'],['equipment-advance',mixed,'split'],['product-advance',basket([{...product,quantity:2}]),'split'],['mixed-advance',basket([car,{...product,quantity:2},by('Furukawa FX25SS')]),'split'],['long-full',basket(offers.filter(o=>o.asset_type==='product'&&!o.source_expired).slice(0,25)),'full']];
(async()=>{
 globalThis.DOMMatrix??=class DOMMatrix{};const pdfjs=await import(path.join(root,'auto-src/pdfjs/pdf.min.mjs'));pdfjs.GlobalWorkerOptions.workerSrc=path.join(root,'auto-src/pdfjs/pdf.worker.min.mjs');
 const output=process.env.PDF_OUTPUT_DIR;if(output)fs.mkdirSync(output,{recursive:true});const results=[];
 for(const [label,offer,option]of cases){
  const snapshot=c.TELocalDocuments.makeSnapshot(offer,{...buyer,payment_option:option},settings,now,now),before=JSON.stringify(snapshot),lines=api.invoiceLines(snapshot);
  assert.equal(lines.reduce((n,x)=>n+x.total_kopecks,0),api.orderAmount(snapshot));
  const variants=[['1',snapshot]];if(option==='split')variants.push(['2',api.scheduledBalance(snapshot)]);
  for(const [stage,s]of variants){
   const purpose=api.purpose(s),qr=api.requisitesQr(s);assert.ok(purpose.length<=210);assert.ok(!purpose.includes('товары по Спецификации'));assert.ok(qr.includes('|Purpose='+purpose+'|'));assert.equal(Number(qr.split('|Sum=')[1]),api.invoiceAmount(s));
   assert.match(purpose,stage==='2'?/^Доплата 50%/:option==='split'?/^Аванс 50%/:/^Оплата/);
   if(label==='equipment-advance')assert.ok(purpose.includes('виброплита')&&purpose.includes('гидромолот')&&purpose.includes('генератор'));
   const bytes=await c.TELocalDocuments.createPdf(s,'invoice',resources),task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}),pdf=await task.promise;let text='';
   for(let i=1;i<=pdf.numPages;i++){const content=await(await pdf.getPage(i)).getTextContent();for(const item of content.items){assert.ok(item.transform[5]>=15&&item.transform[5]<=820,'text beyond print area');}text+=content.items.map(x=>x.str).join(' ')+'\n';}
   const compact=x=>x.normalize('NFKC').replace(/[\u2011-\u2014]/g,'-').replace(/\s/g,'');for(const row of lines){assert.ok(compact(text).includes(compact(row.title)),row.title);assert.ok(compact(text).includes(compact(row.category)),row.category);}
   if(lines.length<=3)assert.equal(pdf.numPages,1,'Compact invoice for up to three positions');
   for(const row of lines){const fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n/100);assert.ok(compact(text).includes(compact(row.quantity+' шт. '+fmt(row.unit_kopecks)+' '+fmt(row.total_kopecks))),'Quantity/unit/line total in visible invoice');}
   assert.ok(compact(text).includes(compact(purpose.replace(/[\u2011\u2012\u2013\u2014]/g,'-'))),JSON.stringify({purpose,text}));
   assert.equal(JSON.stringify(snapshot),before);if(output)fs.writeFileSync(path.join(output,label+'-'+stage+'.pdf'),bytes);
   results.push({case:label,stage,pages:pdf.numPages,lines:lines.length,purpose,qr_amount:api.invoiceAmount(s),bytes:bytes.length});await task.destroy();
  }
  if(label.startsWith('single-')){const bytes=await c.TELocalDocuments.createPdf(snapshot,'bundle',resources);const imported=await c.TEBalanceInvoice.importPdf(bytes,settings,pdfjs);assert.equal(imported.offer.title,snapshot.offer.title);assert.equal(imported.offer.equipment_kind,snapshot.offer.equipment_kind||null);assert.equal(imported.total_kopecks,api.orderAmount(snapshot));}
  if(label==='product-advance'){
   const bytes=await c.TELocalDocuments.createPdf(snapshot,'bundle',resources),task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}),pdf=await task.promise,meta=JSON.parse(new TextDecoder().decode((await pdf.getAttachments())['TE-ORDER.json'].content));
   let bundleText='';for(let page=1;page<=pdf.numPages;page++)bundleText+=(await(await pdf.getPage(page)).getTextContent()).items.map(x=>x.str).join(' ')+'\n';assert.ok(c.TEOrderBalance.verify(meta,bundleText,settings));
   assert.equal(meta.items[0].offer.equipment_kind,product.equipment_kind);assert.equal(meta.items[0].offer.category,product.category);assert.equal(meta.groups[0].quantity,2);await task.destroy();
   const restored=c.TEBalanceInvoice.makeBalance({...meta,source_sha256:'a'.repeat(64),offer:snapshot.offer},{contract_signed:true,advance_confirmed:true,ready_confirmed:true,balance_unpaid:true,advance_date:'2026-10-26',advance_reference:'Тестовый платёж',ready_date:'2026-10-26',ready_reference:'Тестовая готовность'},settings,now);
   assert.equal(api.invoiceLines(restored)[0].category,product.equipment_kind);assert.equal(api.invoiceLines(restored)[0].quantity,2);assert.ok(api.purpose(restored).includes(product.equipment_kind.toLowerCase()));
  }
 }
 if(output)fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:true,cases:results}));
})().catch(e=>{console.error(e.stack);process.exit(1)});
