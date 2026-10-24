// Real PDF extraction protects compact layouts and fractional-kopeck instalments.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,atob,btoa};c.window=c;c.self=c;vm.createContext(c);
for(const n of ['vendor','settings','payment-instructions','premium-pdf','local-documents','order-documents','balance-invoice','order-balance'])vm.runInContext(fs.readFileSync(path.join(root,'auto-src',n+'.js'),'utf8'),c);
(async()=>{
 const settings=c.TEDocumentSettings,decode=x=>Uint8Array.from(Buffer.from(x,'base64')),resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
 const offer=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers.find(x=>x.title==='Mikasa MVC-50GB');
 const buyer={buyer_type:'company',company_name:'ООО «Тестовый заказ»',company_inn:'7701234567',company_address:'Москва, улица Примерная, 1',full_name:'Тестов Иван Иванович',signatory_role:'Директор',signatory_basis:'Устава',phone:'+79990000000',email:'review@example.test',transfer_terms_confirmed:true,destination_country:'RU',payment_option:'split'};
 const now=Date.now(),s=c.TELocalDocuments.makeSnapshot({id:'test-layout',order_items:[{...offer,quantity:5,customer_price_rub:43171,display_price_rub:43171,source_price_rub:43171,quote:null}]},buyer,settings,now,now);
 const bytes=await c.TELocalDocuments.createPdf(s,'bundle',resources);
 // Only text/attachment extraction is used; canvas rendering is verified in the browser.
 globalThis.DOMMatrix??=class DOMMatrix {};
 const pdfjs=await import(path.join(root,'auto-src/pdfjs/pdf.min.mjs'));pdfjs.GlobalWorkerOptions.workerSrc=path.join(root,'auto-src/pdfjs/pdf.worker.min.mjs');
 const job=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}),pdf=await job.promise;
 assert.ok(pdf.numPages<=9);let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')+'\n';
 const attachments=await pdf.getAttachments(),meta=JSON.parse(new TextDecoder().decode(attachments['TE-ORDER.json'].content));
 assert.ok(text.includes('Общие условия позиций'));assert.ok(c.TEOrderBalance.verify(meta,text,settings));
 const bad=structuredClone(meta);bad.items[0].schedule.first_kopecks++;bad.items[0].schedule.balance_kopecks--;assert.throws(()=>c.TEOrderBalance.verify(bad,text,settings));
 await job.destroy();console.log('PASS: real compact 5-unit PDF, shared terms, 50-kopeck instalments, both invoices and tamper rejection');
})().catch(e=>{console.error(e.message);process.exit(1)});
