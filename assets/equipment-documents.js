(()=>{'use strict';const root=document.getElementById('tegroup-mobile-review'),dialog=document.getElementById('documentDialog');let trigger=null;
const offers=new Map([...document.querySelectorAll('[data-document-offer]')].map(b=>{const o=JSON.parse(b.dataset.documentOffer);return[o.id,o];}));
const flow=window.TEDocumentFlow.attach({root,getOffer:id=>offers.get(id),signature:o=>JSON.stringify(o),open(){dialog.hidden=false;dialog.showModal();},close(){dialog.close();}});
dialog.querySelector('[data-close="documentDialog"]').addEventListener('click',()=>{flow.clear();dialog.close();});dialog.addEventListener('close',()=>{flow.clear();dialog.hidden=true;trigger?.focus();});
for(const b of document.querySelectorAll('[data-document-offer]'))b.addEventListener('click',()=>{trigger=b;flow.start(JSON.parse(b.dataset.documentOffer).id);});
})();
