// Commercial meaning, Russian case/number and bank-field limits for frozen orders.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),src=process.env.TE_DOCUMENT_SOURCE_DIR||path.join(root,'auto-src'),c={Intl,Date,structuredClone,TextEncoder};c.window=c;vm.createContext(c);
for(const file of ['settings','payment-instructions']){
 vm.runInContext(fs.readFileSync(path.join(src,file+'.js'),'utf8'),c);
}
const api=c.TEPaymentInstructions,offers=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers;
const find=title=>{const x=offers.find(x=>x.title===title);assert.ok(x,title);return x;};
const snapshot=(rows,mode='split_50_50')=>{
 const items=rows.map(([offer,quantity=1])=>({offer:{...offer,quantity},schedule:{total_kopecks:10000*quantity,first_kopecks:(mode==='single'?10000:5000)*quantity,balance_kopecks:(mode==='single'?0:5000)*quantity}}));
 const total=items.reduce((n,x)=>n+x.schedule.total_kopecks,0),first=mode==='single'?total:total/2;
 return {document_number:'TE-20261026-1234ABCD',created_at:Date.parse('2026-10-26T12:00:00+03:00'),offer:items[0].offer,...(rows.length>1||rows[0][1]>1?{order_items:items}:{}),company:c.TEDocumentSettings.operator,payment:c.TEDocumentSettings.payment,payment_terms:{amount_kopecks:first,order_total_kopecks:total,schedule:{mode,total_kopecks:total,first_kopecks:first,balance_kopecks:total-first}}};
};
const example=snapshot([[find('Mikasa MVC-50GB'),3],[find('Furukawa FX25SS'),2],[find('Denyo DCA-60LSIE'),1]]),before=JSON.stringify(example),advance=api.purpose(example),second=api.scheduledBalance(example),balance=api.purpose(second);
assert.match(advance,/Аванс 50% за строительное и энергетическое оборудование \(виброплиты, гидромолоты и дизельный генератор\)/);
assert.equal(balance.replace(/^Доплата/,'Аванс'),advance);assert.equal(JSON.stringify(example),before);assert.ok(api.requisitesQr(example).includes('|Purpose='+advance+'|'));
const single=api.purpose(snapshot([[find('Mikasa MVC-50GB'),1]]));assert.match(single,/за виброплиту Mikasa/);assert.ok(single.includes('B2632'));
const generators=api.purpose(snapshot([[find('Denyo DCA-25LSKE'),1],[find('Denyo DCA-60LSIE'),1]]));assert.match(generators,/за дизельные генераторы по договору/);assert.ok(!generators.includes('генераторы (дизельные генераторы'));
const kit=offers.find(o=>o.id==='mass25:camry70-21'),car=find('Honda Civic Sport');
assert.match(api.purpose(snapshot([[car,1],[kit,1]])),/за автомобиль и кузовной комплект/);
const camper=offers.find(o=>o.category==='Кемпер-надстройки'),travel=offers.find(o=>o.id==='new25:ikamper');
assert.match(api.purpose(snapshot([[camper,1],[travel,1]])),/за кемпер-надстройку и туристическое оборудование/);
const samples=[];
for(const o of offers){const s=snapshot([[o,1]],'single'),p=api.purpose(s);assert.ok(p.length<=210);assert.ok(!/за товары:|за товар |undefined|NaN/.test(p),o.title);assert.ok(p.includes(s.document_number)&&p.includes('26.10.2026'));samples.push({id:o.id,title:o.title,purpose:p});}
const wide=snapshot([...new Map(offers.map(o=>[o.category,o])).values()].map(o=>[o,1]));wide.document_number='TE-20261026-'+ 'A'.repeat(38);wide.payment_terms.settlement={vat_kopecks:1};
assert.ok(api.purpose(wide).length<=210);assert.ok(api.purpose(wide).includes('НДС удерживает покупатель.'));assert.ok(api.purpose(wide).includes(wide.document_number));
const invalid=snapshot([[{...car,title:'Injected|Purpose=other'},1]]);assert.throws(()=>api.purpose(invalid));
const out=process.env.PURPOSE_OUTPUT_DIR;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'purpose-examples.json'),JSON.stringify({advance,balance,single,generators,car_and_kit:api.purpose(snapshot([[car,1],[kit,1]])),camper_and_travel:api.purpose(snapshot([[camper,1],[travel,1]])),wide:api.purpose(wide),offers:samples},null,2));}
console.log('PASS: '+samples.length+' catalogue offers; mixed categories, Russian grammar, advance/balance consistency, identifiers, frozen data, QR text, tax clause and 210-character limit.');
