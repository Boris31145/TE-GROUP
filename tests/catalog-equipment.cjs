const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const offers=JSON.parse(fs.readFileSync('assets/catalog-offers.json')).offers,mapping=JSON.parse(fs.readFileSync('server/document-stats/catalog.json'));
const equipment=offers.filter(o=>o.asset_type==='equipment'),added=equipment.filter(o=>o.id.startsWith('exp24-'));
assert.equal(added.length,20);assert.equal(new Set(added.map(o=>o.title)).size,20);
for(const o of equipment){assert.ok(o.brand&&o.equipment_kind&&o.description.length>60,o.id);assert.ok(o.technical_specs.length>=3,o.id);assert.ok(o.complectation&&o.technical_sources.length,o.id);for(const img of o.images)assert.ok(fs.existsSync('.'+img),o.id);assert.ok(mapping.some(m=>m.id===o.id&&m.title===o.title),o.id);}
for(const o of added){assert.ok(o.serial&&!/[?*]|--/.test(o.serial),o.id);assert.ok(o.source_price>0&&o.customer_price_rub>1);assert.ok(!offers.some(x=>!x.id.startsWith('exp24-')&&x.title.toLowerCase()===o.title.toLowerCase()),o.id);}
const c={structuredClone,TEPaymentInstructions:{listingAmountRub:o=>o.customer_price_rub}};vm.createContext(c);vm.runInContext(fs.readFileSync('assets/live-pricing.js','utf8'),c);const rates=JSON.parse(fs.readFileSync('assets/currency-rates.json'));c.TELivePricing.setRates(rates);
for(const o of added){for(const country of ['RU','KG']){const p=c.TELivePricing.amount(o,rates,country);assert.ok(Number.isSafeInteger(p.rub)&&p.rub>o.source_price*rates.rates.JPY);const next=structuredClone(rates);next.rates.JPY*=1.05;assert.ok(c.TELivePricing.amount(o,next,country).rub>p.rub);}}
console.log('PASS: 20 distinct numbered offers; all equipment has technical data, local photos, pricing and statistics mapping.');
