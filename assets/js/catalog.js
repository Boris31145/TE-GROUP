'use strict';
// Catalog-only information. Booking amounts are always read from their server snapshot.
function teOfferVin(o){return o.quote?.vin||o.vin||''}
function teSearchOffer(o,query){
  const q=query.trim().toLocaleLowerCase('ru-RU');if(!q)return true;
  if([o.title,o.source_id,o.source].some(v=>String(v||'').toLocaleLowerCase('ru-RU').includes(q)))return true;
  // A short lot number must not match a common VIN prefix across every car.
  const vin=q.replace(/[\s-]/g,'');return vin.length>=6&&teOfferVin(o).toLowerCase().includes(vin);
}
function teVehicleKey(o){return teOfferVin(o)?'VIN:'+teOfferVin(o).toUpperCase():o.id}
function tePriceChange(before,after){
  if(before.quote&&after.quote&&before.quote.total_rub!==after.quote.total_rub)return {kind:'quote',before:before.quote.total_rub,after:after.quote.total_rub};
  if(before.quote&&!after.quote)return {kind:'invalidated'};
  if(!before.quote&&after.quote)return {kind:'approved'};
  if(!before.quote&&!after.quote&&before.source_price_rub!==after.source_price_rub)return {kind:'source',before:before.source_price_rub,after:after.source_price_rub};
  return null;
}
function teComparisonRows(o){
  const q=o.quote;
  return [
    ['country','Страна отправления',o.country],['year','Год',o.year||null],
    ['mileage','Пробег, км',o.mileage_km==null?null:(o.mileage_approx?'≈ ':'')+Number(o.mileage_km).toLocaleString('ru-RU')],
    ['vin','VIN',teOfferVin(o)||null],['fuel','Топливо',o.fuel||null],
    ['company','Платёж компании',q?.company_rub??null],['import','Импорт и другие расходы покупателя',q?.buyer_costs_rub??null],
    ['repair','Ремонт за счёт покупателя',q?.repair_rub??null],
    ['destination','Пункт доставки',q?.destination||null],
    ['condition','Повреждения',o.damage||null],['documents','Документы автомобиля',o.title_status||null]
  ];
}
