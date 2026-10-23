// Exercise the actual production PDF engine and its shared balance snapshot.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),c={console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,atob,btoa};c.window=c;c.self=c;vm.createContext(c);
for(const n of ['vendor','settings','watermark-assets','payment-instructions','premium-pdf','local-documents','balance-invoice'])vm.runInContext(fs.readFileSync(path.join(root,'auto-src',n+'.js'),'utf8'),c);
const settings=c.TEDocumentSettings,decode=x=>Uint8Array.from(Buffer.from(x,'base64'));
const resources={PDFLib:c.PDFLib,fontkit:c.fontkit,font:decode(settings.font_base64),fontBold:decode(settings.font_bold_base64),signatureMarks:decode(settings.signature_marks_base64),qrcode:c.qrcode};
const order={version:1,document_number:'TE-20261019-ABCDEF12',contract_date:'2026-10-19',initial_invoice_number:'TE-20261019-ABCDEF12-INV',payer:'ООО «Тестовая стройка» / Тестов Иван Иванович',offer:{title:'BIZON K150',asset_type:'equipment',serial:'JH5915007K01A7009',serial_type:'Заводской номер',vin:null},payment:structuredClone(settings.payment),total_kopecks:559000000,first_kopecks:279500000,balance_kopecks:279500000,source_sha256:'b'.repeat(64)};
const input={contract_signed:true,advance_confirmed:true,ready_confirmed:true,balance_unpaid:true,advance_date:'2026-10-19',ready_date:'2026-10-19',advance_reference:'ПП 17',ready_reference:'Подтверждение продавца 23'};
(async()=>{
 for(const known of [false,true])for(const taxed of [false,true]){
  const s=c.TEBalanceInvoice.makeBalance({...order,settlement:taxed?c.TEPaymentInstructions.vatSettlement(order.first_kopecks):null},{...input,notice_received_date:known?'2026-10-19':'',notice_receipt_reference:known?'Ответ покупателя от 19.10.2026':''},settings,Date.parse('2026-10-20T12:00:00Z'));
  for(const [kind,pages]of [['notice',1],['invoice',1],['balance-bundle',2]]){
   const bytes=await c.TELocalDocuments.createPdf(s,kind,resources),pdf=await c.PDFLib.PDFDocument.load(bytes);
   assert.equal(pdf.getPageCount(),pages,kind);assert.ok(bytes.length<2000000,kind+' stays below 2 MB');assert.ok(pdf.getSubject().includes(order.source_sha256));
   assert.equal(c.TEPaymentInstructions.invoiceAmount(s),taxed?c.TEPaymentInstructions.vatSettlement(order.balance_kopecks).seller_kopecks:order.balance_kopecks);
  }
  assert.equal(s.payment_terms.confirmation.due_date,known?'2026-10-29':null);
 }
 for(const kind of ['notice','balance-bundle'])await assert.rejects(()=>c.TELocalDocuments.createPdf({document_number:order.document_number,created_at:Date.now(),offer:{source_price_rub:3000000},buyer:{full_name:'Тестов'},company:settings.operator,payment:settings.payment},kind,resources),/окончательным расчётом/);
 console.log('PASS: readiness notices, balance invoices and two-page packages; receipt timelines, factory numbers, company buyer, source fingerprint, size and stage guards');
})().catch(e=>{console.error(e);process.exitCode=1});
