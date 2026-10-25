(function(g){'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const round=v=>Math.round(v),copy=v=>structuredClone(v);
let snapshot=null,fetching=null;
function valid(s){return s?.version===1&&s.base==='RUB'&&/^\d{4}-\d{2}-\d{2}$/.test(s.rate_date)&&Object.values(s.rates||{}).every(v=>finite(v)&&v>0)&&['USD','CNY','JPY','KRW','EUR','KGS'].every(c=>finite(s.rates?.[c])&&s.rates[c]>0)}
function customsFee(v){return [[200000,1231],[450000,2462],[1200000,4924],[2700000,13541],[4200000,18465],[5500000,21344],[10000000,49240],[Infinity,73860]].find(x=>v<=x[0])[1]}
function amount(offer,rates=snapshot,destination='RU'){
 const p=offer.pricing;if(!p)return {rub:g.TEPaymentInstructions.listingAmountRub(offer),dynamic:false};
 if(!valid(rates)||Date.now()-Date.parse(rates.rate_date+'T00:00:00Z')>8*86400000||!finite(p.amount)||!rates.rates[p.currency])return {rub:null,dynamic:true,unavailable:true};
 const price=p.amount*rates.rates[p.currency],fixed=p.fixed_rub||0;
 if(!finite(fixed))throw Error('Некорректные расходы');
 let total=price+fixed;
 if(p.mode==='goods_import_budget'){
  const base=price+p.freight_basis_rub,duty=base*p.duty_percent/100+(p.specific_duty_eur||0)*rates.rates.EUR;
  const vat=(base+duty)*(destination==='KG'?.12:.22),fee=destination==='KG'?Math.min(Math.max(base*.004,500*rates.rates.KGS),250000*rates.rates.KGS):customsFee(base);
  const cost=price+duty+vat+fee+p.operations_rub+(destination==='KG'?0:p.util_ru||0);
  total=Math.ceil((cost*(1+p.markup_percent/100)-1e-7)/1000)*1000;
 }else if(p.mode==='indexed_budget'){
  total=p.base_total_rub+(price-p.amount*p.base_rate);
  if(p.eur_duty_base)total+=p.eur_duty_base*(rates.rates.EUR-p.base_eur_rate);
 }else if(p.mode==='equipment_import'){
  const d=destination==='KG'?'KG':'RU',duty=price*(p.duty_percent||0)/100,vat=(price+duty)*(d==='KG'?.12:.22),fee=d==='KG'?Math.min(Math.max(price*.004,500*rates.rates.KGS),250000*rates.rates.KGS):customsFee(price);
  total+=duty+vat+fee;
 }else if(p.mode==='vehicle_components'){
  const duty=p.duty_eur? p.duty_eur*rates.rates.EUR : p.duty_percent!=null?price*p.duty_percent/100:p.duty_rub||0;
  const excise=p.excise_rub||0,vat=p.vat_percent?(price+duty+excise)*p.vat_percent/100:0;
  total+=duty+excise+vat+(p.util_rub||0)+(p.customs_fee===true?customsFee(price):p.customs_fee_rub||0);
 }
 if(!Number.isSafeInteger(round(total))||total<=0)throw Error('Некорректная стоимость');
 return {rub:round(total),dynamic:true,currency:p.currency,rate:rates.rates[p.currency],rate_date:rates.rate_date,provider:rates.provider,price_basis:p.mode};
}
function priced(offer,destination='RU',rates=snapshot){const o=copy(offer),v=amount(o,rates,destination);if(v.rub!=null){o.customer_price_rub=v.rub;o.display_price_rub=v.rub;if(o.quote)o.quote.total_rub=v.rub;o.price_snapshot={...v,destination,captured_at:rates?.rate_date||null};}else{o.price_unavailable=true;o.price_snapshot=null;o.customer_price_rub=null;o.display_price_rub=null;o.source_price_rub=null;o.quote=null;}return o;}
async function refresh(){if(fetching)return fetching;fetching=(async()=>{try{const r=await fetch('/assets/currency-rates.json?_='+Date.now(),{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Rate source unavailable');const s=await r.json();if(!valid(s))throw Error('Invalid rate snapshot');const changed=JSON.stringify(s.rates)!==JSON.stringify(snapshot?.rates)||s.rate_date!==snapshot?.rate_date;snapshot=s;if(changed)g.dispatchEvent(new CustomEvent('te:rates',{detail:{rate_date:s.rate_date}}));return copy(s);}catch(e){return snapshot?copy(snapshot):null;}finally{fetching=null;}})();return fetching;}
function setRates(s){if(!valid(s))throw Error('Invalid rate snapshot');snapshot=copy(s)}
g.TELivePricing={amount,priced,refresh,setRates,getRates:()=>snapshot?copy(snapshot):null,customsFee};
if(g.TEInitialRates)setRates(g.TEInitialRates);
if(typeof document!=='undefined'){refresh();setInterval(()=>{if(!document.hidden)refresh()},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});}
})(typeof window!=='undefined'?window:globalThis);
