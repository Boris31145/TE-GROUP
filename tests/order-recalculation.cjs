// Real PDF extraction protects compact layouts and fractional-kopeck instalments.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,atob,btoa};c.window=c;c.self=c;vm.createContext(c);
for(const n of ['vendor','settings','payment-instructions','premium-pdf','local-documents','order-documents','balance-invoice','order-balance'])vm.runInContext(fs.readFileSync(path.join(root,'auto-src',n+'.js'),'utf8'),c);

vm.runInContext(fs.readFileSync(path.join(root,'assets/live-pricing.js'),'utf8'),c);

(async()=>{
 const api=c.TEPaymentInstructions,settings=c.TEDocumentSettings,decode=x=>Uint8Array.from(Buffer.from(x,'base64')),resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
 const offers=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers,rates=JSON.parse(fs.readFileSync(path.join(root,'assets/currency-rates.json')));
 const buyer={buyer_type:'company',company_name:'ООО «Проверка пересчёта»',company_inn:'7701234567',company_address:'Москва, улица Примерная, 1',full_name:'Тестов Иван Иванович',signatory_role:'Директор',signatory_basis:'Устава',phone:'+79990000000',email:'review@example.test',transfer_terms_confirmed:true,destination_country:'RU',payment_option:'split'};
 const basket={id:'te-basket',order_items:[['Mikasa MVC-50GB',3],['Furukawa FX25SS',2],['Denyo DCA-60LSIE',1]].map(([title,quantity])=>({...c.TELivePricing.priced(offers.find(x=>x.title===title),'RU',rates),quantity}))};
 const stages=[['initial',()=>{}],['increase',()=>basket.order_items[0].quantity=5],['decrease',()=>basket.order_items[0].quantity=2],['remove-generator',()=>basket.order_items.splice(2,1)],['one-model',()=>basket.order_items.splice(1,1)],['one-unit',()=>basket.order_items[0].quantity=1]];
 globalThis.DOMMatrix??=class DOMMatrix {};const pdfjs=await import(path.join(root,'auto-src/pdfjs/pdf.min.mjs'));pdfjs.GlobalWorkerOptions.workerSrc=path.join(root,'auto-src/pdfjs/pdf.worker.min.mjs');
 const compact=v=>v.replace(/\s/g,''),fmt=v=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:v%100?2:0,maximumFractionDigits:2}).format(v/100),previous=[],results=[];
 for(const [name,change]of stages){
  change();const total=basket.order_items.reduce((sum,x)=>sum+api.listingAmountRub(x)*100,0),now=Date.now(),s=c.TELocalDocuments.makeSnapshot(basket,buyer,settings,now,now),second=api.scheduledBalance(s);
  assert.equal(api.orderAmount(s),total);assert.equal(api.invoiceAmount(s)+api.invoiceAmount(second),total);assert.equal(api.invoiceAmount(s),total/2);
  for(const old of previous)assert.equal(JSON.stringify(old.snapshot),old.json,'a previous agreed snapshot must remain immutable');
  const qrPayloads=[api.requisitesQr(s),api.requisitesQr(second)];
  for(const payload of qrPayloads){assert.ok(payload.includes(s.document_number));assert.equal(Number(payload.split('|Sum=')[1]),total/2);for(const old of previous)assert.ok(!payload.includes(old.snapshot.document_number));}
  const outputs=[];
  for(const [suffix,snapshot,kind,expectedQr]of [['bundle',s,'bundle',qrPayloads],['invoice-1',s,'invoice',[qrPayloads[0]]],['invoice-2',second,'invoice',[qrPayloads[1]]]]){
   const seen=[],tracking=(...args)=>{const qr=c.qrcode(...args),add=qr.addData;qr.addData=(value,...rest)=>{seen.push(value);return add.call(qr,value,...rest)};return qr};Object.defineProperty(tracking,'stringToBytes',{get:()=>c.qrcode.stringToBytes,set:v=>c.qrcode.stringToBytes=v});
   const bytes=await c.TELocalDocuments.createPdf(snapshot,kind,{...resources,qrcode:tracking});assert.deepEqual(seen,expectedQr);
   const job=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}),pdf=await job.promise;let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')+'\n';const full=compact(text);
   assert.ok(full.includes(compact(fmt(total)+'руб.')),name+' '+suffix+' order total');assert.ok(full.includes(compact(fmt(total/2)+'руб.')),name+' '+suffix+' invoice amount');
   for(const old of previous){assert.ok(!text.includes(old.snapshot.document_number));assert.ok(!full.includes(compact(fmt(api.orderAmount(old.snapshot))+'руб.')),name+' must not contain previous total');}
   if(!basket.order_items.some(x=>x.title==='Denyo DCA-60LSIE'))assert.ok(!text.includes('Denyo DCA-60LSIE'));
   if(!basket.order_items.some(x=>x.title==='Furukawa FX25SS'))assert.ok(!text.includes('Furukawa FX25SS'));
   if(kind==='bundle'&&s.order_items){const meta=JSON.parse(new TextDecoder().decode((await pdf.getAttachments())['TE-ORDER.json'].content));assert.ok(c.TEOrderBalance.verify(meta,text,settings));assert.equal(meta.groups.length,basket.order_items.length);assert.deepEqual(Array.from(meta.groups,x=>x.quantity),basket.order_items.map(x=>x.quantity));for(const group of meta.groups)assert.equal(group.total_kopecks,group.quantity*group.unit_kopecks);}
   if(kind==='bundle'&&process.env.PDF_OUTPUT_DIR&&['initial','increase','remove-generator'].includes(name)){fs.mkdirSync(process.env.PDF_OUTPUT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PDF_OUTPUT_DIR,name+'.pdf'),bytes);}
   outputs.push({suffix,pages:pdf.numPages,bytes:bytes.length,qr:expectedQr});await job.destroy();
  }
  previous.push({snapshot:s,json:JSON.stringify(s)});results.push({stage:name,quantities:basket.order_items.map(x=>({title:x.title,quantity:x.quantity,unit:api.listingAmountRub({...x,quantity:1})})),total:total/100,first:api.invoiceAmount(s)/100,second:api.invoiceAmount(second)/100,outputs});
 }
 basket.order_items=[];assert.throws(()=>c.TELocalDocuments.makeSnapshot(basket,buyer,settings,Date.now()));
 if(process.env.PDF_OUTPUT_DIR)fs.writeFileSync(path.join(process.env.PDF_OUTPUT_DIR,'checks.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({passed:'same basket object: increase, decrease, removal, one model, one unit, empty; 18 real PDFs and QR payloads; no stale totals or removed items',cases:results.map(({outputs,quantities,...x})=>x)}));
})().catch(e=>{console.error(e);process.exit(1)});
