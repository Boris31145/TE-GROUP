/* Local-only PDF preview. PDF bytes remain in browser memory. */
(()=>{
  const root=document.getElementById('tegroup-mobile-review');
  const dialog=document.createElement('dialog');dialog.id='pdfPreview';dialog.className='pdf-preview';dialog.setAttribute('aria-labelledby','pdfPreviewTitle');
  dialog.innerHTML=`<header class="pdf-preview-header"><div><span class="eyebrow">TE GROUP / ДОКУМЕНТЫ</span><h2 id="pdfPreviewTitle">Договор и инвойс с QR</h2></div><button type="button" id="pdfClose" aria-label="Закрыть просмотр">✕</button></header><div class="pdf-toolbar"><div class="pdf-pages"><button type="button" id="pdfPrev" aria-label="Предыдущая страница">←</button><span id="pdfPageLabel" role="status">Загрузка…</span><button type="button" id="pdfNext" aria-label="Следующая страница">→</button></div><div class="pdf-zoom"><button type="button" id="pdfZoomOut" aria-label="Уменьшить масштаб">−</button><button type="button" id="pdfFit" aria-label="Подогнать страницу по ширине">По ширине</button><button type="button" id="pdfZoomIn" aria-label="Увеличить масштаб">+</button></div><a id="pdfSave" class="primary" download>Скачать ↓</a></div><div class="pdf-viewport" id="pdfViewport" aria-busy="true"><p id="pdfMessage" role="status">Открываем документ…</p><canvas id="pdfCanvas" role="img" aria-label="Страница документа" hidden></canvas></div><p class="pdf-preview-note">Документ для согласования · данные остаются на вашем устройстве</p>`;
  root.append(dialog);
  const el=id=>document.getElementById(id);
  let pdf=null,loading=null,renderTask=null,page=1,zoom=1,session=0,drawing=0,resizeTimer;
  function controls(){el('pdfPrev').disabled=!pdf||page<=1;el('pdfNext').disabled=!pdf||page>=pdf.numPages;el('pdfZoomOut').disabled=!pdf||zoom<=.75;el('pdfZoomIn').disabled=!pdf||zoom>=4;el('pdfFit').textContent=zoom===1?'По ширине':Math.round(zoom*100)+'%';el('pdfFit').disabled=!pdf;el('pdfFit').title=zoom===1?'Подогнать по ширине окна':'Масштаб относительно ширины окна. Нажмите для сброса.';}
  async function draw(){
    if(!pdf||!dialog.open)return;
    const run=++drawing;renderTask?.cancel();el('pdfViewport').setAttribute('aria-busy','true');
    try{
      const doc=pdf,p=await doc.getPage(page);if(run!==drawing||!dialog.open)return;
      const width=Math.max(220,el('pdfViewport').clientWidth-40),scale=Math.min(width/595,1.55)*zoom;
      const view=p.getViewport({scale}),dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(16000000/(view.width*view.height))),canvas=el('pdfCanvas');
      canvas.width=Math.round(view.width*dpr);canvas.height=Math.round(view.height*dpr);canvas.style.width=view.width+'px';canvas.style.height=view.height+'px';canvas.hidden=false;
      renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport:view,transform:[dpr,0,0,dpr,0,0]});await renderTask.promise;
      if(run!==drawing)return;
      canvas.setAttribute('aria-label','Страница '+page+' из '+doc.numPages+'. Текст доступен в скачиваемом PDF.');
      el('pdfMessage').hidden=true;el('pdfPageLabel').textContent=page+' / '+doc.numPages;el('pdfViewport').setAttribute('aria-busy','false');controls();
    }catch(error){if(error.name!=='RenderingCancelledException'&&run===drawing){el('pdfMessage').textContent='Не удалось показать страницу. Документ можно скачать.';el('pdfMessage').hidden=false;el('pdfViewport').setAttribute('aria-busy','false');}}
  }
  function release(){session++;drawing++;clearTimeout(resizeTimer);renderTask?.cancel();renderTask=null;pdf=null;loading?.destroy().catch(()=>{});loading=null;el('pdfCanvas').width=0;el('pdfCanvas').height=0;el('pdfCanvas').hidden=true;el('pdfSave').removeAttribute('href');document.body.style.overflow='';}
  dialog.addEventListener('close',()=>{if(!dialog.open)release();});
  el('pdfClose').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  el('pdfPrev').onclick=()=>{if(page>1){page--;el('pdfViewport').scrollTop=0;draw();}};
  el('pdfNext').onclick=()=>{if(pdf&&page<pdf.numPages){page++;el('pdfViewport').scrollTop=0;draw();}};
  el('pdfFit').onclick=()=>{zoom=1;controls();draw();};
  el('pdfZoomOut').onclick=()=>{zoom=Math.max(.75,zoom-(zoom>2?.5:.25));controls();draw();};
  el('pdfZoomIn').onclick=()=>{zoom=Math.min(4,zoom+(zoom>=2?.5:.25));controls();draw();};
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,150);});
  window.TEPdfPreview={
    clear(){if(dialog.open)dialog.close();else release();},
    async open(url,name){
      if(dialog.open)dialog.close();
      const current=++session;page=1;zoom=1;pdf=null;controls();
      el('pdfMessage').textContent='Открываем документ…';el('pdfMessage').hidden=false;el('pdfPageLabel').textContent='Загрузка…';el('pdfViewport').setAttribute('aria-busy','true');
      el('pdfSave').href=url;el('pdfSave').download=name;dialog.showModal();document.body.style.overflow='hidden';el('pdfClose').focus();
      try{
        const lib=await import('/auto-src/pdfjs/pdf.min.mjs');if(current!==session)return;
        lib.GlobalWorkerOptions.workerSrc='/auto-src/pdfjs/pdf.worker.min.mjs';
        loading=lib.getDocument({url,isEvalSupported:false});const doc=await loading.promise;
        if(current!==session){await doc.destroy();return;}pdf=doc;controls();await draw();
      }catch(error){if(current===session){el('pdfMessage').textContent='Просмотр не загрузился. Нажмите «Скачать», чтобы открыть PDF на устройстве.';el('pdfViewport').setAttribute('aria-busy','false');}}
    }
  };
})();
