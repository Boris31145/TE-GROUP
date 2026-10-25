const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),vm=require('vm');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/catalog-offers.json'))).offers,stats=JSON.parse(fs.readFileSync(path.join(root,'server/document-stats/catalog.json'))),rates=JSON.parse(fs.readFileSync(path.join(root,'assets/currency-rates.json')));
const c={structuredClone,Date,console,TextEncoder,TextDecoder};c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(root,'auto-src/payment-instructions.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(root,'assets/live-pricing.js'),'utf8'),c);
const added=catalog.filter(o=>o.catalog_added);assert.equal(new Set(catalog.map(o=>o.id)).size,catalog.length);
for(const o of added){
 assert.ok(o.configuration?.length>20,o.id+': configuration');assert.equal(o.configuration,o.complectation);
 assert.ok(o.technical_specs?.length>=3,o.id+': specs');assert.ok(o.technical_specs.every(x=>x.label&&x.value));
 assert.ok(o.card_specs?.length>=2&&o.card_specs.length<=3);assert.ok(o.source_url.startsWith('https://'));assert.ok(o.source_price>0);assert.equal(o.source_price,o.pricing.amount);
 assert.ok(o.images?.length);for(const p of o.images)assert.ok(fs.existsSync(path.join(root,p)),o.id+': '+p);
 assert.ok(stats.some(x=>x.id===o.id),o.id+': statistics');
 if(o.identity_kind==='individual_machine'){assert.ok(o.serial||o.vin);assert.equal(o.max_order_quantity,1);}
 else assert.ok(o.product_code);
 for(const country of ['RU','KG']){
  const p=c.TELivePricing.priced(o,country,rates),unit=c.TELivePricing.amount(o,rates,country).rub;
  assert.ok(unit>0&&Number.isSafeInteger(unit));if(country==='RU')assert.equal(o.customer_price_rub,unit,o.id+': stale catalog price');
  const quantity=o.max_order_quantity||1,total=c.TEPaymentInstructions.listingAmountRub({...p,quantity});assert.equal(total,unit*quantity);
 }
}
console.log(JSON.stringify({passed:true,products:added.length,destinations:['RU','KG'],checks:'completeness, images, identity, prices, quantities, statistics'}));
