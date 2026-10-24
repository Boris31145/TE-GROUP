const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,atob,btoa};c.window=c;c.self=c;vm.createContext(c);
for(const n of ['vendor','settings','watermark-assets','payment-instructions','premium-pdf','local-documents','order-documents','balance-invoice','order-balance'])vm.runInContext(fs.readFileSync(path.join(root,'auto-src',n+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'assets/live-pricing.js'),'utf8'),c);
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers,rates=JSON.parse(fs.readFileSync(path.join(root,'assets/currency-rates.json')));
const expected={'velauto:4027465':'KMHLN41EETU264141','velauto:4051216':'WAUZZZ4G0JN136185','velauto:3245327':'KMHR281ADRU762001'};
for(const o of catalog.filter(x=>x.id.startsWith('budget24-')))expected[o.id]=o.vin;
const buyer={buyer_type:'company',company_name:'ООО «Тест VIN»',company_inn:'7701234567',company_address:'Москва, Тестовая, 1',full_name:'Тестов Иван Иванович',signatory_basis:'Устава',phone:'+79990000000',email:'vin@example.test',destination_country:'RU',transfer_terms_confirmed:true,payment_option:'split'};
const decode=v=>Uint8Array.from(Buffer.from(v,'base64')),settings=c.TEDocumentSettings,resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
(async()=>{
 const out=process.env.PDF_OUTPUT_DIR;if(out)fs.mkdirSync(out,{recursive:true});
 const results=[];
 for(const [id,vin]of Object.entries(expected)){
  const offer=c.TELivePricing.priced(catalog.find(x=>x.id===id),'RU',rates);
  assert.equal(offer.vin,vin);assert.ok(offer.vin_verification.source_url);
  const s=c.TELocalDocuments.makeSnapshot(offer,buyer,settings,Date.now());
  assert.equal(s.offer.vin,vin);
  const second=c.TEPaymentInstructions.scheduledBalance(s);assert.equal(second.offer.vin,vin);assert.equal(second.document_number,s.document_number);
  for(const invoice of [s,second]){const qr=c.TEPaymentInstructions.requisitesQr(invoice);assert.ok(qr.includes(vin));assert.ok(qr.includes(s.document_number));}
  const bytes=await c.TELocalDocuments.createPdf(s,'bundle',resources);assert.ok(bytes.length<2000000);
  if(out)fs.writeFileSync(path.join(out,id.replace(':','-')+'.pdf'),bytes);
  results.push({id,vin,bytes:bytes.length,first:c.TEPaymentInstructions.invoiceAmount(s),second:c.TEPaymentInstructions.invoiceAmount(second),total:c.TEPaymentInstructions.orderAmount(s)});
 }
 console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
