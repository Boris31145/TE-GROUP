/* Catalogue selection uses published offer specifications, never model-name guesses. */
(function(g){'use strict';
const fitments={
 'new25:kbd-e46':[['3 серия · E46'],1999,2005,['Седан','Купе']],
 'new25:body-f30':[['3 серия · F30'],2011,2019,['Седан']],
 'new25:body-f10':[['5 серия · F10'],2010,2017,['Седан']],
 'new25:body-g20':[['3 серия · G20 LCI','3 серия · G28 LCI'],2022,2025,[]],
 'new25:body-g60':[['5 серия · G60','5 серия · G68'],null,null,[]],
 'new25:body-g11':[['7 серия · G11 LCI'],2019,2023,[]],
 'new25:body-g12':[['7 серия · G12'],2016,2022,[]],
 'new25:body-w205':[['C-Класс · W205'],2014,2021,['Седан']],
 'new25:body-w212':[['E-Класс · W212'],2009,2015,['Седан']],
 'new25:body-w213':[['E-Класс · W213'],2016,2019,['Седан']],
 'new25:body-w221':[['S-Класс · W221'],2006,2013,[]],
 'new25:body-w222':[['S-Класс · W222'],2014,2020,[]],
 'new25:body-w214':[['E-Класс · W214'],2024,2026,[]],
 'new25:body-camry80':[['Camry · XV80'],2025,null,[]],
 'new25:body-mark130':[['Mark X · GRX130 · дорестайлинг'],null,null,[]],
 'new25:body-mark120':[['Mark X · GRX120'],null,null,[]],
 'new25:body-crown210':[['Crown Athlete · GRS210 · дорестайлинг'],null,null,[]],
 'new25:body-crown200':[['Crown Athlete · GRS200 · дорестайлинг'],null,null,[]],
 'new25:body-majesta':[['Crown Majesta · URS206'],null,null,[]],
 'new25:body-a4b8':[['A4 · B8'],2008,2011,['Седан']],
 'new25:body-a6c7':[['A6 · C7'],2011,2017,['Седан']],
 'new25:body-a8':[['A8 · D5'],2018,2021,[]],
 'new25:body-a7lb':[['A7 · 4G8'],2010,2014,[]],
 'new25:body-a7-bkm':[['A7 · C8','S7 · C8'],null,null,[]],
 'new25:body-fuga':[['Fuga · Y51 · дорестайлинг'],null,null,[]],
 'new25:body-skyline':[['Skyline · V37 · дорестайлинг'],null,null,[]],
 'new25:body-ls430':[['LS430'],2001,2003,[]],
 'new25:body-ls460':[['LS460 · F-Sport'],2013,2017,[]],
 'new25:body-macan':[['Macan · 95B'],2014,2023,[]],
 'new25:body-taycan':[['Taycan · 9J1'],2020,2023,['Седан']],
 'new25:body-a3':[['A3 · 8Y · рестайлинг'],2024,2026,['Седан']],
 'new25:ikon-e70':[['X5 · E70 · дорестайлинг'],2007,2010,[]],
 'mass25:camry70-21':[['Camry · XV70'],2021,2024,[]],
 'mass25:camry70-18':[['Camry · XV70'],2018,2020,[]],
 'mass25:corolla12':[['Corolla · XII'],2019,2023,['Седан']],
 'mass25:rav4-5':[['RAV4 · V'],2019,2022,[]],
 'mass25:mazda6-gj':[['6 · GJ · рестайлинг'],2017,2023,['Седан']],
 'mass25:k5-gtline':[['K5 · DL3 · GT-Line'],2021,2024,[]],
 'mass25:accord10':[['Accord · X'],2021,2022,[]],
 'mass25:civic11':[['Civic · XI'],2022,2024,['Седан']],
 'mass25:civic11-front':[['Civic · XI'],2022,2024,['Седан','Хетчбэк']],
 'mass25:civic11-side':[['Civic · XI'],2022,2026,['Седан','Хетчбэк']],
 'mass25:civic11-rear':[['Civic · XI'],2022,2025,['Седан']]
};
const unique=xs=>[...new Set(xs.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru',{numeric:true}));
const spec=(o,re)=>(o.technical_specs||[]).filter(s=>re.test(s.label)).map(s=>s.value);
function fitmentMatches(o,s={}){const f=fitments[o.id];return (!s.brand||o.category===s.brand)&&(!s.model||!!f?.[0].includes(s.model))&&(!s.year||!!f?.[1]&&Number(s.year)>=f[1]&&(f[2]==null||Number(s.year)<=f[2]))&&(!s.body||!!f?.[3].includes(s.body));}
function yearOptions(rows){const end=new Date().getFullYear();return unique(rows.flatMap(o=>{const f=fitments[o.id];return f?.[1]?Array.from({length:Math.max(0,(f[2]??end)-f[1]+1)},(_,i)=>String(f[1]+i)):[]})).reverse();}
function voltage(o){return unique(spec(o,/напряжение|^Электропитание$|^Питание$/i).flatMap(v=>[...v.matchAll(/(\d[\d\s/–-]*?)\s*В(?![а-яА-Яa-zA-Z])/g)].flatMap(m=>(m[1].match(/\d+/g)||[]).filter(n=>Number(n)>=100&&Number(n)<=690).map(n=>n+' В'))));}
const field=(key,label,re)=>({key,label,values:o=>spec(o,re)}),kind={key:'kind',label:'Тип устройства',values:o=>[o.equipment_kind]},brand={key:'brand',label:'Производитель',values:o=>[o.brand]},power=field('power','Мощность',/^(?:Мощность|Класс мощности)/i),supply={key:'voltage',label:'Напряжение',values:voltage};
const equipmentFields={
 'Генераторы':[power,supply,brand],
 'Навесное':[kind,field('carrier','Класс экскаватора',/^Класс (?:экскаватора|базовой машины)$/),field('pin','Диаметр пальца',/^Диаметр пальца$/)],
 'Компрессоры':[field('pressure','Рабочее давление',/^(?:Рабочее давление|Давление по объявлению)$/),field('output','Производительность',/^Производительность/),kind],
 'Полуприцепы':[kind,field('capacity','Грузоподъёмность',/^Грузоподъёмность$/),field('axles','Оси',/^Оси$/)],
 'Бетононасосы':[kind,field('output','Подача',/^Подача$/),field('aggregate','Заполнитель',/^Заполнитель$/)],
 'Бетонные узлы':[kind,field('output','Производительность',/^Производительность$/),field('batch','Объём замеса',/^Замес/)],
 'Промышленные смесители':[kind,field('batch','Барабан / замес',/^Барабан \/ замес$/),supply],
 'Уплотнение':[kind,field('weight','Масса',/^Масса$/),field('fuel','Топливо',/^Топливо$/)],
 'Экскаваторы':[field('chassis','Ходовая часть',/^(?:Ходовая часть|Тип)$/),power,brand],
 'Самосвалы':[power,field('drive','Колёсная формула',/^Колёсная формула$/),brand],
 'Погрузчики':[field('bucket','Объём ковша',/^Объём ковша/),power,brand],
 'Сварочное':[field('mode','Режимы',/^Режимы$/),field('current','Ток одного поста',/^Один пост/),brand],
 'Бетонные работы':[kind,supply,field('size','Рабочий размер',/^Рабочий размер$/)],
 'Климатическое':[kind,field('heat','Тепловая мощность',/^Тепловая мощность$/),supply],
 'Дорожное':[kind,field('disc','Диаметр диска',/^Диаметр диска$/),brand],
 'Освещение':[kind,field('light','Тип света',/^Тип света$/),brand]
};
function fields(category){return equipmentFields[category]||[kind,brand];}
function equipmentMatches(o,category,s={},ignore){return (!category||category==='all'||o.category===category)&&fields(category).every(f=>f.key===ignore||!s[f.key]||f.values(o).includes(s[f.key]));}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mount({page,rows,onChange}){
 const body=page==='upgrades'&&document.body.dataset.section==='body-conversion';if(!body&&page!=='equipment')return null;
 const $=id=>document.getElementById(id),toolbar=document.querySelector('.catalog-toolbar'),category=$('catalogKind'),panel=document.createElement('section');
 panel.className='selection-panel';panel.setAttribute('aria-labelledby','selectionTitle');toolbar.classList.add('has-selection');
 panel.innerHTML='<div class="selection-heading"><div><p class="eyebrow">'+(body?'ПОДБОР КОМПЛЕКТА':'ПАРАМЕТРЫ ОБОРУДОВАНИЯ')+'</p><h2 id="selectionTitle">'+(body?'Для вашего автомобиля':'Что нужно для работы?')+'</h2></div><button type="button" class="selection-reset" id="selectionReset" data-reset hidden>Сбросить</button></div><div class="selection-fields" id="selectionFields"></div><p class="selection-note" id="selectionNote"></p>';
 toolbar.prepend(panel);const main=$('selectionFields');main.append(category.closest('label'));category.closest('label').querySelector('.field-label').textContent=body?'Марка':'Категория';category.options[0].textContent=body?'Все марки':'Все категории';
 const extra=document.querySelector('.filter-panel'),extraFields=extra.querySelector('.filter-fields'),searchRow=toolbar.querySelector('.search-row');
 extra.querySelector('summary').textContent='Поиск, цена и сортировка';extra.open=false;
 extraFields.prepend($('catalogSearch').closest('label'));extraFields.insertBefore($('catalogSort').closest('label'),extraFields.querySelector('[data-reset]'));
 searchRow.classList.add('destination-row');$('destination').closest('label').querySelector('.field-label').textContent='Стоимость для';
 const active=document.createElement('div');active.className='active-filters';active.setAttribute('aria-label','Выбранные параметры');toolbar.append(active);
 const state={model:'',year:'',body:'',facets:{}};
 function select(id,label,placeholder){const el=document.createElement('label');el.innerHTML='<span class="field-label">'+esc(label)+'</span><select id="'+id+'"><option value="">'+esc(placeholder)+'</option></select>';main.append(el);return el.querySelector('select');}
 let model,year,bodySelect;
 if(body){model=select('fitModel','Модель / поколение','Сначала марка');year=select('fitYear','Год выпуска','Любой год');bodySelect=select('fitBody','Кузов','Любой кузов');model.disabled=year.disabled=true;}
 function options(el,values,placeholder){const value=el.value;el.replaceChildren(new Option(placeholder,''),...values.map(v=>new Option(v,v)));el.value=values.includes(value)?value:'';}
 function remember(){if(!body)return;try{sessionStorage.setItem('te-fitment-selection',JSON.stringify({brand:category.value,model:state.model,year:state.year,body:state.body}))}catch{}}
 function updateBody(){const brand=category.value==='all'?'':category.value;const brandRows=rows.filter(o=>!brand||o.category===brand);options(model,brand?unique(brandRows.flatMap(o=>fitments[o.id]?.[0]||[])):[],brand?'Все модели':'Сначала марка');state.model=model.value;model.disabled=!brand;
  const modelRows=brandRows.filter(o=>!state.model||fitments[o.id]?.[0].includes(state.model));options(year,state.model?yearOptions(modelRows):[],state.model?'Любой год':'Сначала модель');state.year=year.value;year.disabled=!state.model||year.options.length===1;
  const bodies=unique(modelRows.filter(o=>fitmentMatches(o,{year:state.year})).flatMap(o=>fitments[o.id]?.[3]||[]));options(bodySelect,bodies,'Любой кузов');state.body=bodySelect.value;bodySelect.closest('label').hidden=!state.model||bodies.length<2;
  $('selectionNote').textContent=state.model?(year.disabled?'Подбор по кузову. Исполнение — в карточке.':'Исполнение и ограничения — в карточке.'):'Выберите автомобиль — покажем комплекты для него.';remember();
 }
 function updateEquipment(){for(const el of main.querySelectorAll('[data-facet]'))el.remove();const cat=category.value,subset=rows.filter(o=>cat==='all'||o.category===cat);
  for(const f of cat==='all'?[]:fields(cat)){const relevant=subset.filter(o=>equipmentMatches(o,cat,state.facets,f.key)),values=unique(relevant.flatMap(f.values));if(!values.length||values.length===1&&!state.facets[f.key]&&relevant.every(o=>f.values(o).includes(values[0])))continue;const input=select('equipment-'+f.key,f.label,'Все варианты');input.closest('label').dataset.facet=f.key;options(input,values,'Все варианты');input.value=state.facets[f.key]||'';if(!input.value)delete state.facets[f.key];input.addEventListener('change',()=>{state.facets[f.key]=input.value;refresh();onChange();$('equipment-'+f.key)?.focus({preventScroll:true})});}
  $('selectionNote').textContent=cat==='all'?'Выберите категорию — покажем её параметры.':'Характеристики — из выбранных предложений.';
 }
 function chips(){const items=[];if(category.value!=='all')items.push({label:category.value,clear:()=>{category.value='all';state.model=state.year=state.body='';state.facets={};if(body)model.value=year.value=bodySelect.value='';refresh();}});
  if(body){for(const [key,el] of [['model',model],['year',year],['body',bodySelect]])if(state[key])items.push({label:state[key],clear:()=>{state[key]='';el.value='';if(key==='model'){year.value=bodySelect.value='';state.year=state.body='';}refresh();}});}else for(const f of fields(category.value))if(state.facets[f.key])items.push({label:f.label+': '+state.facets[f.key],clear:()=>{delete state.facets[f.key];refresh();}});
  active.replaceChildren();for(const item of items){const b=document.createElement('button');b.type='button';b.className='filter-chip';b.textContent=item.label+' ×';b.setAttribute('aria-label','Убрать фильтр '+item.label);b.addEventListener('click',()=>{item.clear();onChange()});active.append(b)}active.hidden=!items.length;$('selectionReset').hidden=!items.length;
 }
 function refresh(){if(body)updateBody();else updateEquipment();chips();}
 function reset(){state.model=state.year=state.body='';state.facets={};if(body)model.value=year.value=bodySelect.value='';refresh();}
 category.addEventListener('change',()=>{state.facets={};state.model=state.year=state.body='';if(body)model.value=year.value=bodySelect.value='';refresh();onChange()});
 if(body)for(const [key,el] of [['model',model],['year',year],['body',bodySelect]])el.addEventListener('change',()=>{state[key]=el.value;if(key==='model'){year.value=bodySelect.value='';state.year=state.body='';}refresh();onChange()});
 if(body){try{const s=JSON.parse(sessionStorage.getItem('te-fitment-selection')||'null');if(s&&category.value==='all'&&[...category.options].some(o=>o.value===s.brand)){category.value=s.brand;refresh();model.value=s.model||'';refresh();year.value=s.year||'';refresh();bodySelect.value=s.body||'';}}catch{}}
 refresh();return {matches:o=>body?fitmentMatches(o,{brand:category.value==='all'?'':category.value,...state}):equipmentMatches(o,category.value,state.facets),refresh,reset};
}
g.TECatalogSelection={fitments,fitmentMatches,yearOptions,equipmentMatches,fields,voltage,mount};
})(typeof window==='undefined'?globalThis:window);
