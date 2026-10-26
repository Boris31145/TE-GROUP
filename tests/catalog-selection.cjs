const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={Date};vm.createContext(c);vm.runInContext(fs.readFileSync('assets/catalog-selection.js','utf8'),c);
const api=c.TECatalogSelection,offers=JSON.parse(fs.readFileSync('assets/catalog-offers.json')).offers;
const bodies=offers.filter(o=>o.catalog_category==='body-conversion'),equipment=offers.filter(o=>o.asset_type==='equipment'||o.catalog_section==='equipment');
for(const o of bodies){const f=api.fitments[o.id];assert.ok(f,o.id+' needs an explicit source vehicle');for(const model of f[0])assert.ok(api.fitmentMatches(o,{brand:o.category,model}));assert.equal(api.fitmentMatches(o,{brand:'Wrong make'}),false);if(f[1]){assert.ok(api.fitmentMatches(o,{year:String(f[1])}));assert.equal(api.fitmentMatches(o,{year:String(f[1]-1)}),false);if(f[2])assert.equal(api.fitmentMatches(o,{year:String(f[2]+1)}),false);}}
const match=s=>bodies.filter(o=>api.fitmentMatches(o,s)).map(o=>o.id);
assert.deepEqual(match({brand:'Toyota',model:'Camry · XV70',year:'2022'}),['mass25:camry70-21']);
assert.deepEqual(match({brand:'Toyota',model:'Camry · XV70',year:'2020'}),['mass25:camry70-18']);
assert.deepEqual(match({brand:'Honda',model:'Civic · XI',year:'2024',body:'Хетчбэк'}),['mass25:civic11-front','mass25:civic11-side']);
assert.deepEqual(match({brand:'Honda',model:'Civic · XI',year:'2026',body:'Седан'}),['mass25:civic11-side']);
assert.deepEqual(match({brand:'BMW',model:'5 серия · F10',year:'2015'}),['new25:body-f10']);
assert.ok(!match({brand:'Audi',model:'A8 · D5',year:'2022'}).length,'Style conversion year must never be used as the original vehicle year');
assert.ok(!match({brand:'Toyota',model:'Mark X · GRX120',year:'2020'}).length,'No invented model years');
for(const cat of new Set(equipment.map(o=>o.category))){const rows=equipment.filter(o=>o.category===cat);assert.ok(api.fields(cat).length);for(const o of rows){assert.ok(api.equipmentMatches(o,cat,{}));for(const f of api.fields(cat))for(const value of f.values(o)){assert.ok(api.equipmentMatches(o,cat,{[f.key]:value}),cat+' / '+value);assert.ok(rows.some(x=>api.equipmentMatches(x,cat,{[f.key]:value})));}}}
const denyo=offers.find(o=>o.id==='jp-161683');assert.deepEqual(Array.from(api.voltage(denyo)),['100 В','200 В','220 В','400 В','440 В']);assert.ok(api.equipmentMatches(denyo,'Генераторы',{power:'20 / 25 кВА',voltage:'400 В'}));assert.equal(api.equipmentMatches(denyo,'Генераторы',{voltage:'480 В'}),false);
const fx=offers.find(o=>o.id==='exp24-165218');assert.ok(api.equipmentMatches(fx,'Навесное',{carrier:'2–3,5 т',pin:'30 мм'}));assert.equal(api.equipmentMatches(fx,'Навесное',{pin:'80 мм'}),false);
console.log('PASS: all '+bodies.length+' body kits mapped; source generations, year boundaries, body types and all equipment categories checked.');
