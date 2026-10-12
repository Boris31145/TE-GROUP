/* One browser-local A4 packet. Bank QR is a requisites payload, not payment confirmation. */
(function(global){
  'use strict';
  async function create(s,resources,kind='bundle'){
    if(!['bundle','contract','specification','invoice','consent'].includes(kind))throw Error('Неизвестный вид документа.');
    const {PDFLib,fontkit}=resources;
    if(!PDFLib||!fontkit||!resources.font)throw Error('Не загружены компоненты PDF. Обновите страницу.');
    const pdf=await PDFLib.PDFDocument.create();pdf.registerFontkit(fontkit);
    const font=await pdf.embedFont(resources.font,{subset:true});
    const bold=resources.fontBold?await pdf.embedFont(resources.fontBold,{subset:true}):font;
    const c={ink:PDFLib.rgb(.11,.13,.16),muted:PDFLib.rgb(.40,.43,.46),line:PDFLib.rgb(.82,.84,.85),pale:PDFLib.rgb(.962,.963,.954),white:PDFLib.rgb(1,1,1),gold:PDFLib.rgb(.53,.44,.31)};
    const L=47,R=548,W=501,TOP=765,BOTTOM=61;
    const number=s.document_number||s.id,date=global.TEPaymentInstructions.moscowDate(s.created_at);
    const o=s.offer,b=s.buyer,company=s.company,bank=s.payment,q=o.quote;
    const invoiceRub=global.TEPaymentInstructions.invoiceAmount(s)/100;
    const vin=[q?.vin,o.vin].map(v=>String(v||'').toUpperCase()).find(v=>/^[A-HJ-NPR-Z0-9]{17}$/.test(v))||'Указывается до подписания';
    const country={US:'США',KR:'Республика Корея',CN:'Китай'};
    const money=value=>value==null?'Подлежит согласованию':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value)+' руб.';
    const clean=value=>String(value??'').replace(/[\u2011\u2012\u2013\u2014]/g,'-').replace(/\u00a0/g,' ');
    const humanDate=value=>!value?'':/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('.'):value;
    let page,y,part='',pages=[];
    let marks=null;
    const markBytes=resources.signatureMarks||resources.signatureMarksPNGbytes;
    if(markBytes)marks=await pdf.embedPng(markBytes);
    const illustrations={};
    for(const [code,data] of Object.entries(global.TEWatermarkImages||{})){
      illustrations[code]=await pdf.embedJpg(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
    }
    pdf.setTitle('TE GROUP | Договор '+number+' и счёт');pdf.setAuthor(company.name);pdf.setProducer('TE GROUP');
    function line(x1,y1,x2,y2,color=c.line,width=.55){page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:width,color});}
    function write(value,x,baseline,size=9.5,face=font,color=c.ink){page.drawText(clean(value),{x,y:baseline,size,font:face,color});}
    function wrap(value,size=9.5,width=W,face=font){
      const out=[];
      for(const paragraph of clean(value).split('\n')){
        let current='';
        for(const word of paragraph.split(/\s+/).filter(Boolean)){
          if(face.widthOfTextAtSize((current?current+' ':'')+word,size)<=width){current+=(current?' ':'')+word;continue;}
          if(current){out.push(current);current='';}
          for(const ch of word){if(face.widthOfTextAtSize(current+ch,size)>width){out.push(current);current='';}current+=ch;}
        }
        out.push(current);
      }
      return out;
    }
    // A country, its car and its flag form one stationery illustration.
    // The series describes our procurement routes; the specification identifies the ordered car.
    function watermark(){
      const index=pages.length-1;
      const sequence=['KR','US','CN','KR','CN','US','KR'];
      const code=part==='Спецификация'?'CN':part==='Счёт'?'US':part==='Согласие'?'KR':sequence[index%sequence.length];
      const art=illustrations[code];
      const layouts=[{x:51,y:287,w:490},{x:89,y:268,w:467},{x:39,y:260,w:511},{x:67,y:302,w:470}];
      const pos=part==='Счёт'?{x:50,y:98,w:337}:layouts[index%layouts.length];
      if(art)page.drawImage(art,{x:pos.x,y:pos.y,width:pos.w,height:pos.w*art.height/art.width,opacity:1,blendMode:PDFLib.BlendMode.Multiply});
      const label={KR:'КОРЕЯ',US:'США',CN:'КИТАЙ'}[code];
      const captions=['ПОДБОР И ЗАКУПКА','МЕЖДУНАРОДНАЯ ПОСТАВКА','СОПРОВОЖДЕНИЕ СДЕЛКИ'];
      // Restrained stationery furniture stays outside the legal text area.
      page.drawText('TE',{x:16,y:433,size:8,font:bold,color:c.gold,rotate:PDFLib.degrees(90),opacity:.52});
      page.drawLine({start:{x:22,y:388},end:{x:22,y:415},thickness:.6,color:c.gold,opacity:.36});
      const motif='НАПРАВЛЕНИЯ TE GROUP / '+label+' / '+captions[index%captions.length];
      page.drawText(motif,{x:L,y:55,size:6.2,font:bold,color:c.gold,opacity:.78});
    }
    function newPage(){
      page=pdf.addPage([595.28,841.89]);pages.push({page,part});watermark();y=TOP;
      page.drawRectangle({x:L,y:797,width:3,height:15,color:c.gold});
      write('TE GROUP',L+12,801,13,bold);write('АВТОМОБИЛИ / ПОСТАВКИ',L+111,803,6.5,font,c.muted);
      write(number,R-font.widthOfTextAtSize(number,7.2),803,7.2,font,c.muted);
      line(L,787,R,787);line(L,787,L+41,787,c.gold,1.35);
    }
    function space(need=30){if(y-need<BOTTOM)newPage();}
    function paragraph(value,{size=9.1,leading=12.4,gap=5,color=c.ink,face=font,x=L,width=W}={}){
      const lines=wrap(value,size,width,face);
      if(lines.length<=10)space(lines.length*leading+gap);else space(3*leading+gap);
      for(let i=0;i<lines.length;i++){
        const remaining=lines.length-i,fit=Math.floor((y-BOTTOM)/leading);
        if(fit<1||(remaining>fit&&fit<2))newPage();
        write(lines[i],x,y,size,face,color);y-=leading;
      }y-=gap;
    }
    function title(kicker,heading,subtitle){write(kicker.toUpperCase(),L,y,8,font,c.gold);y-=30;paragraph(heading,{size:23,leading:27,gap:7,face:bold});if(subtitle)paragraph(subtitle,{size:9,leading:13,gap:14,color:c.muted});}
    function section(heading,keep=102){space(keep);y-=8;write(heading,L,y,11,bold);y-=9;line(L,y,R,y);y-=18;}
    function rows(items,{labelWidth=160,size=9.2,leading=12.6,padding=9}={}){
      for(const [label,value]of items){
        const ls=wrap(label,size-1,labelWidth-15),vs=wrap(value,size,W-labelWidth);const height=Math.max(ls.length,vs.length)*leading+padding*2;
        space(height);line(L,y+4,R,y+4);ls.forEach((t,i)=>write(t,L,y-padding-i*leading,size-1,font,c.muted));vs.forEach((t,i)=>write(t,L+labelWidth,y-padding-i*leading,size,font));y-=height;
      }
    }
    // Three deliberately different authorization layouts, using the supplied facsimile.
    function signatureBlock({buyer=true}={}){
      const h=149;space(h);const top=y;y-=h;
      const specification=part==='Спецификация',invoice=part==='Счёт';
      const sellerX=specification?L+264:L,buyerX=specification?L:L+280;
      line(L,top,R,top);line(sellerX,top,sellerX+31,top,c.gold,1.3);
      write('ПРОДАВЕЦ',sellerX,top-17,7.2,bold,c.muted);write(company.name,sellerX,top-32,9,bold);
      function clippedMark(box,x,bottom,targetWidth,angle=0){
        const [bx,by,bw,bh]=box,scale=targetWidth/bw,targetHeight=bh*scale;
        const a=angle*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a);
        const tx=x+targetWidth/2-cs*targetWidth/2+sn*targetHeight/2,ty=bottom+targetHeight/2-sn*targetWidth/2-cs*targetHeight/2;
        page.pushOperators(PDFLib.pushGraphicsState(),PDFLib.concatTransformationMatrix(cs,sn,-sn,cs,tx,ty),PDFLib.rectangle(0,0,targetWidth,targetHeight),PDFLib.clip(),PDFLib.endPath());
        page.drawImage(marks,{x:-bx*scale,y:-(marks.height-by-bh)*scale,width:marks.width*scale,height:marks.height*scale,blendMode:PDFLib.BlendMode.Multiply});
        page.pushOperators(PDFLib.popGraphicsState());
      }
      if(marks){
        const layout=invoice?{sx:R-204,sy:top-101,sa:0,px:R-122,py:top-139,pa:5}:
          specification?{sx:sellerX+29,sy:top-105,sa:1.2,px:sellerX+107,py:top-140,pa:3}:
          {sx:L+4,sy:top-106,sa:-.8,px:L+96,py:top-140,pa:-5};
        clippedMark([18,102,1205,608],layout.sx,layout.sy,112,layout.sa);
        clippedMark([1225,0,796,756],layout.px,layout.py,119,layout.pa);
      }else line(sellerX,top-101,sellerX+112,top-101);
      if(buyer){
        write('ПОКУПАТЕЛЬ',buyerX,top-17,7.2,bold,c.muted);
        wrap(b.full_name,9,221,bold).forEach((text,i)=>write(text,buyerX,top-32-i*12,9,bold));
        line(buyerX,top-105,buyerX+221,top-105);write('Подпись / дата',buyerX,top-118,7.5,font,c.muted);
      }else{
        write('Факсимиле представителя',L,top-62,8,font,c.muted);
        write('Печать компании',L,top-75,8,font,c.muted);
        line(L,top-92,L+137,top-92,c.gold,.6);
      }
    }
    function qr(payload,x,top,size=156){
      const factory=resources.qrcode||global.qrcode;if(!factory)throw Error('Модуль QR не загружен. Обновите страницу.');
      factory.stringToBytes=value=>Array.from(new TextEncoder().encode(value));
      const matrix=factory(0,'M');matrix.addData(payload,'Byte');matrix.make();const n=matrix.getModuleCount(),quiet=4,cell=size/(n+quiet*2);
      page.drawRectangle({x,y:top-size,width:size,height:size,color:c.white});
      for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(matrix.isDark(row,col))page.drawRectangle({x:x+(col+quiet)*cell,y:top-size+(n+quiet-1-row)*cell,width:cell,height:cell,color:PDFLib.rgb(0,0,0)});
    }
    const passport=[b.passport_number?[(b.document_type||b.passport_type||'Паспорт'),b.passport_series,b.passport_number].filter(Boolean).join(' '):b.identity||'',b.passport_issued_by?'выдан '+b.passport_issued_by:'',humanDate(b.passport_issue_date),b.passport_department_code?'код подразделения '+b.passport_department_code:''].filter(Boolean).join(', ');
    if(kind==='bundle'||kind==='contract'){
    part='Договор';newPage();
    title('Договор купли-продажи','Автомобиль под заказ','№ '+number+' от '+date+'  /  Для согласования');
    paragraph(company.name+' (Кыргызская Республика), ИНН '+company.tax_id+', адрес: '+company.address+', именуемое «Продавец», и '+b.full_name+(b.birth_date?', дата рождения '+humanDate(b.birth_date):'')+(passport?', '+passport:'')+', адрес: '+b.address+', именуемый «Покупатель», заключают договор на следующих условиях.',{size:9.4,leading:13.7,gap:13});
    page.drawRectangle({x:L,y:y-59,width:W,height:67,color:c.pale});write(o.title,L+14,y-10,13,bold);write('VIN '+vin,L+14,y-29,9,font,c.muted);write('Доставка: 2-4 календарных месяца',L+14,y-44,9,font,c.muted);y-=80;
    for(const [heading,paragraphs]of s.contract_terms||[]){const introHeight=paragraphs.slice(0,2).reduce((height,text)=>height+wrap(text).length*12.4+5,0);section(heading,Math.min(260,introHeight+44));for(const text of paragraphs)paragraph(text);}
    const sellerDetails=[company.name+'; ИНН '+company.tax_id+'.',company.address+'.',company.email||'oootegroup@gmail.com','Получатель: '+bank.beneficiary_name+'.','ИНН РФ '+bank.russian_inn+'; КПП '+bank.kpp+'.','Р/с '+bank.account+'; БИК '+bank.bic+'.',company.signatory||company.signatory_name?'Представитель: '+(company.signatory||company.signatory_name)+'. '+(company.signatory_basis||''):'Представитель / полномочия: ____________________.'];
    const buyerDetails=[b.full_name+'.',passport+'.',b.address+'.','Телефон: '+b.phone+'.','Email: '+b.email+'.'];
    const partyLines=values=>values.flatMap(value=>wrap(value,8.5,237));
    const sellerLines=partyLines(sellerDetails),buyerLines=partyLines(buyerDetails),partyHeight=Math.max(sellerLines.length,buyerLines.length)*11.2+12;
    space(35+partyHeight+149);section('Реквизиты и подписи сторон',35+partyHeight+149);
    sellerLines.forEach((text,i)=>write(text,L,y-i*11.2,8.5));buyerLines.forEach((text,i)=>write(text,L+264,y-i*11.2,8.5));y-=partyHeight;
    signatureBlock();

    }
    if(kind==='bundle'||kind==='specification'){
    part='Спецификация';newPage();
    title('Приложение 1','Спецификация','К договору № '+number+' от '+date);
    rows([
      ['Автомобиль / год',o.title+' / '+(o.year||'Указывается до подписания')],['VIN / страна отправления',vin+' / '+country[o.country]],
      ['Топливо',o.fuel||o.engine_kind||'Уточняется'],['Двигатель / мощность',(o.engine_cc?Number(o.engine_cc).toLocaleString('ru-RU')+' см³':'Объём уточняется')+' / '+(o.power_hp?o.power_hp+' л.с.':'Мощность уточняется')],
      ['Пробег / трансмиссия',[(o.mileage_km!=null?Number(o.mileage_km).toLocaleString('ru-RU')+' км':''),o.transmission].filter(Boolean).join(' · ')||'Указываются до подписания'],
      ['Состояние / комплектация',o.damage||o.condition_description||'Согласуются перед подписанием; акт осмотра прилагается после проверки'],
      ['Поставка / пункт передачи','2-4 календарных месяца после согласованного аванса; '+(q?.destination||'пункт передачи указывается до подписания')]
    ],{labelWidth:155,size:9,leading:12,padding:5});
    section('Бюджет заказа, рубли');
    const estimate=invoiceRub;
    const breakdown=o.source_breakdown||{};
    const costs=q?[
      ['Цена Продавца',money(q.company_rub)],['Расходы Покупателя',money(q.buyer_costs_rub)],['Ремонт',money(q.repair_rub)],['Полный бюджет',money(q.total_rub)]
    ]:[
      [o.source_currency==='USD'?'Стоимость автомобиля':'Предварительный бюджет',money(estimate)],
      ...(breakdown.duty_rub!=null?[['В том числе пошлина',money(breakdown.duty_rub)]]:[]),
      ...(breakdown.util_rub!=null?[['В том числе утильсбор',money(breakdown.util_rub)]]:[]),
      ['Сумма по счёту',money(invoiceRub)]
    ];
    rows(costs,{labelWidth:220,size:9.2,leading:12.4,padding:5});
    y-=12;if(o.source_currency==='USD'&&!q)paragraph('Доставка и импорт рассчитываются отдельно.',{size:8.3,leading:11.6,gap:5,color:c.muted});if(breakdown.util_rub===3400||breakdown.util_rub===5200)paragraph('Утильсбор: при соблюдении условий льготного ввоза физлицом.',{size:8.3,leading:11.6,gap:5,color:c.muted});paragraph('Сумма счёта перенесена из выбранного объявления. Расходы, уже включённые в эту сумму, повторно не оплачиваются. Не включённые расходы и порядок их оплаты фиксируются до подписания договора.',{size:8.3,leading:11.6,gap:7,color:c.muted});
    paragraph('Замена: новый VIN и характеристики согласуются письменно. Цена Продавца и полный бюджет - 85-115% соответствующих первоначальных сумм. Переплата возвращается; доплата оформляется новым счетом. Раздел 5 договора.',{size:8.3,leading:11.6,gap:14,color:c.muted});
    signatureBlock();

    }
    if(kind==='bundle'||kind==='invoice'){
    part='Счёт';newPage();
    title('TE GROUP / INVOICE','Счёт на оплату','№ '+number+'-INV от '+date);
    rows([['Плательщик',b.full_name],['Автомобиль',o.title+'; VIN '+vin]],{labelWidth:112,size:9,leading:12,padding:6});
    y-=9;write('БАНКОВСКИЕ РЕКВИЗИТЫ',L,y,8,bold,c.gold);y-=15;
    rows([
      ['Получатель',bank.beneficiary_name],['ИНН РФ / КПП',bank.russian_inn+' / '+bank.kpp],['Расчетный счет',bank.account+' (RUB)'],['Банк',bank.bank_name],['БИК / кор. счет',bank.bic+' / '+bank.correspondent_account]
    ],{labelWidth:112,size:9.1,leading:12.3,padding:4});
    y-=15;write('НАЗНАЧЕНИЕ ПЛАТЕЖА',L,y,8,bold,c.gold);y-=18;
    paragraph(global.TEPaymentInstructions.purpose(s),{size:9,leading:13,gap:11});
    const approvedAmount=invoiceRub;
    page.drawRectangle({x:L,y:y-39,width:W,height:49,color:c.pale});write('Сумма к оплате',L+13,y-8,9,font,c.muted);write(money(approvedAmount),L+13,y-28,16,bold);y-=57;
    space(308);qr(global.TEPaymentInstructions.requisitesQr(s),R-142,y,142);
    const qrTextX=L,qrTextWidth=W-179;
    const textTop=y;paragraph('Оплата по банковским реквизитам',{size:11,leading:15,gap:9,face:bold,x:qrTextX,width:qrTextWidth});
    paragraph('Отсканируйте код в банковском приложении с поддержкой QR по реквизитам или оплатите счет в отделении банка.',{size:9,leading:13,gap:8,x:qrTextX,width:qrTextWidth});
    paragraph('Сумма соответствует выбранному объявлению. Перед оплатой подпишите договор и проверьте реквизиты.',{size:8.5,leading:12.3,gap:5,x:qrTextX,width:qrTextWidth,color:c.muted});
    y=Math.min(y,textTop-153);signatureBlock({buyer:false});

    }
    if(kind==='bundle'||kind==='consent'){
    part='Согласие';newPage();
    title('Отдельный документ','Согласие на обработку\nперсональных данных','К подготовке договора № '+number+' от '+date);
    paragraph('Субъект персональных данных: '+b.full_name+'. Контакты: '+b.phone+', '+b.email+'.',{size:9.4,leading:13.5,gap:12});
    for(const consentPart of (s.consent_text||'Согласие не загружено. Формирование документов должно быть повторено.').split('\n'))paragraph(consentPart,{size:9.1,leading:13.2,gap:7});
    section('Подтверждение');
    paragraph('Отдельное согласие отмечено в интерфейсе '+new Date(s.accepted_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК. Согласие на подготовку документов не заменяет подписания договора и не подтверждает оплату.',{size:8.7,leading:12.7,gap:22,color:c.muted});
    space(55);write(b.full_name,L,y,10,bold);y-=28;line(L,y,L+220,y);write('Подпись / дата',L,y-14,8,font,c.muted);
    }
    pages.forEach(({page:p,part:label},i)=>{p.drawLine({start:{x:L,y:46},end:{x:R,y:46},thickness:.5,color:c.line});p.drawText(clean(label+'  /  '+number),{x:L,y:31,size:7,font,color:c.muted});const n=(i+1)+' / '+pages.length;p.drawText(n,{x:R-font.widthOfTextAtSize(n,7),y:31,size:7,font,color:c.muted});});
    return pdf.save();
  }
  global.TEPremiumPdf={create};
})(typeof window!=='undefined'?window:globalThis);
