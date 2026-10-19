const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('crypto').webcrypto,atob,btoa};c.window=c;c.self=c;
vm.createContext(c);
for(const name of ['vendor','settings','watermark-assets','payment-instructions','premium-pdf','local-documents','catalog-data'])vm.runInContext(fs.readFileSync(path.join(root,'auto-src',name+'.js'),'utf8'),c,{filename:name+'.js'});
const api=c.TEPaymentInstructions,offers=c.TECatalogSnapshot.actual.offers;
const buyer={full_name:'Тестов Иван Иванович',phone:'+7 999 000-00-00',email:'review@example.test',address:'Тестовый адрес, Москва, ул. Примерная, 1',document_type:'Паспорт РФ',passport_series:'0000',passport_number:'000000',passport_issued_by:'Тестовый орган — вымышленные данные',passport_issue_date:'2020-01-15',passport_department_code:'000-000'};
for(const v of [null,0,-1,NaN,Infinity,'2500000'])assert.throws(()=>api.invoiceAmount({offer:{source_price_rub:v}}));
assert.equal(api.listingAmountRub({source_price_rub:2345678.6}),2345679);
assert.equal(api.listingAmountRub({quote:{total_rub:3500000},source_price_rub:2200000}),3500000);
assert.throws(()=>c.TELocalDocuments.makeSnapshot(offers[0],buyer,c.TEDocumentSettings,null));
for(const o of offers){
 if(o.source_expired||o.availability==='reserved'||!api.listingAmountRub(o))continue;
 const s=c.TELocalDocuments.makeSnapshot(o,buyer,c.TEDocumentSettings,Date.now());
 assert.equal(s.payment_terms.amount_kopecks,api.paymentSchedule(o).first_kopecks);
 const qr=api.requisitesQr(s),f=Object.fromEntries(qr.split('|').slice(1).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));
 assert.equal(Number(f.Sum),s.payment_terms.amount_kopecks);
 s.offer.source_price_rub=99999999;if(s.offer.quote)s.offer.quote.total_rub=99999999;
 assert.equal(api.invoiceAmount(s),Number(f.Sum));
 assert.equal(api.draft(s).payable,false);
}
// The threshold uses the full, displayed order amount; exactly 3m stays unchanged.
const baseline=offers.find(o=>!o.source_expired&&o.availability!=='reserved');
for(const [rub,split] of [[2999999,false],[3000000,false],[3000001,true],[5980000,true]]){
 const o={...baseline,quote:null,customer_price_rub:rub,display_price_rub:rub,source_price_rub:rub};
 const s=c.TELocalDocuments.makeSnapshot(o,buyer,c.TEDocumentSettings,Date.now());
 assert.equal(s.payment_terms.schedule.mode,split?'split_50_50':'single');
 assert.equal(api.orderAmount(s),rub*100);
 assert.equal(api.invoiceAmount(s),split?rub*50:rub*100);
 assert.equal(s.payment_terms.amount_kopecks+s.payment_terms.schedule.balance_kopecks,api.orderAmount(s));
 if(!split)assert.equal(JSON.stringify(s.contract_terms),JSON.stringify(c.TEDocumentSettings.contract),'Old contract terms must remain unchanged');
 else {if(o.price_kind!=='unified_estimate')assert.equal(s.contract_terms[2][1][0],c.TEDocumentSettings.contract[2][1][0]);const t=JSON.stringify(s.contract_terms);assert.ok(t.includes('10 (десяти) календарных дней'));assert.ok(t.includes('получения уведомления Продавца'));assert.ok(!t.includes('30 календарных дней'));}
}
const equipment=JSON.parse(fs.readFileSync(path.join(root,'equipment/listings.json'),'utf8')).items.map(i=>({id:i.id,title:i.model,asset_type:'equipment',year:i.year,country:i.location.startsWith('Китай')?'CN':'RU',location:i.location,equipment_kind:i.kind,serial:i.serial,serial_type:i.serial_type,vin:i.serial_type==='VIN'?i.serial:null,specs:i.specs,condition_description:i.condition_note,customer_price_rub:Number(i.offer_price_rub)}));
for(const o of equipment){const s=c.TELocalDocuments.makeSnapshot(o,buyer,c.TEDocumentSettings,Date.now());assert.equal(s.offer.serial,o.serial);assert.ok(api.requisitesQr(s).includes(o.serial));if(o.serial_type!=='VIN')assert.equal(s.offer.vin,null);}
const organization={...buyer,buyer_type:'company',company_name:'ООО «Тестовая стройка»',company_inn:'7701234567',company_kpp:'770101001',company_address:'Тестовый юридический адрес, Москва, ул. Примерная, 1',signatory_basis:'Устава, директор'};
const companySnapshot=c.TELocalDocuments.makeSnapshot(equipment[0],organization,c.TEDocumentSettings,Date.now());assert.equal(companySnapshot.buyer.passport_number,'');assert.equal(companySnapshot.buyer.company_name,organization.company_name);
(async()=>{
 const settings=c.TEDocumentSettings,decode=x=>Uint8Array.from(Buffer.from(x,'base64'));
 const resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
 const cases=[offers.find(x=>x.title.includes('Tiguan'))||baseline,...offers.filter(x=>x.price_kind==='unified_estimate'),...equipment];
 const results=[];
 for(const o of cases){
  const s=c.TELocalDocuments.makeSnapshot(o,buyer,settings,Date.now());
  const data=await c.TELocalDocuments.createPdf(s,'bundle',resources);
  const pdf=await c.PDFLib.PDFDocument.load(data);assert.ok(pdf.getPageCount()>=7&&pdf.getPageCount()<=8,o.title+' pages');
  assert.ok(data.length<2000000,o.title+' PDF bundle must stay below 2 MB');
  if(process.env.PDF_OUTPUT_DIR){fs.mkdirSync(process.env.PDF_OUTPUT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PDF_OUTPUT_DIR,o.id.replace(/[^a-z0-9-]/gi,'-')+'.pdf'),data);}
  if(process.env.PDF_OUTPUT&&results.length===0)fs.writeFileSync(process.env.PDF_OUTPUT,data);
  results.push({car:o.title,totalRub:api.orderAmount(s)/100,invoiceRub:api.invoiceAmount(s)/100,pages:pdf.getPageCount(),bytes:data.length});
 }
 console.log(JSON.stringify({testedOffers:offers.length,equipment:equipment.length,thresholdCases:4,pdfResults:results}));
})().catch(e=>{console.error(e);process.exitCode=1});
