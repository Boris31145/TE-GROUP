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
 assert.equal(s.payment_terms.amount_kopecks,api.listingAmountRub(o)*100);
 const qr=api.requisitesQr(s),f=Object.fromEntries(qr.split('|').slice(1).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));
 assert.equal(Number(f.Sum),s.payment_terms.amount_kopecks);
 s.offer.source_price_rub=99999999;if(s.offer.quote)s.offer.quote.total_rub=99999999;
 assert.equal(api.invoiceAmount(s),Number(f.Sum));
 assert.equal(api.draft(s).payable,false);
}
(async()=>{
 const o=offers.find(x=>x.title.includes('Tiguan'))||offers[0];
 const s=c.TELocalDocuments.makeSnapshot(o,buyer,c.TEDocumentSettings,Date.now());
 const settings=c.TEDocumentSettings,decode=x=>Uint8Array.from(Buffer.from(x,'base64'));
 const resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
 const data=await c.TELocalDocuments.createPdf(s,'bundle',resources);
 const pdf=await c.PDFLib.PDFDocument.load(data);assert.equal(pdf.getPageCount(),7);
 assert.ok(data.length<2000000,'PDF bundle must stay below 2 MB');
 if(process.env.PDF_OUTPUT)fs.writeFileSync(process.env.PDF_OUTPUT,data);
 console.log(JSON.stringify({testedOffers:offers.length,pages:pdf.getPageCount(),sampleCar:o.title,amountRub:api.invoiceAmount(s)/100,bytes:data.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
