/* Shared CBR snapshot for the legacy calculator. No invented fallback rate. */
(function(){
  'use strict';
  const field=document.getElementById('calcRubRate'),status=document.getElementById('goodsRateStatus');
  if(!field)return;
  const buttons=Array.from(document.querySelectorAll('button[onclick="calculateImport()"]'));
  buttons.forEach(b=>b.disabled=true);
  async function update(){
    try{
      const response=await fetch('/assets/currency-rates.json',{cache:'no-store'});
      if(!response.ok)throw Error('rates');
      const data=await response.json(),rate=Number(data.rates&&data.rates.USD),date=Date.parse(data.rate_date+'T00:00:00Z');
      if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(date)||Date.now()-date>8*86400000)throw Error('stale');
      field.value=String(rate);status.textContent='Банк России · '+data.rate_date.split('-').reverse().join('.');
      buttons.forEach(b=>b.disabled=false);
      if(typeof window.recalcRub==='function')window.recalcRub();
    }catch(e){
      field.value='';status.textContent='Курс временно недоступен. Обновите страницу для расчёта.';
      buttons.forEach(b=>b.disabled=true);
    }
  }
  update();
})();
