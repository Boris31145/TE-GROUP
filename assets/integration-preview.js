(()=>{
 const path=location.pathname.replace(/\/?$/,'/');
 const travel=new Set(['pickup-campers','truck-toppers','van-conversion','overlanding'].map(section=>'/cars/upgrades/'+section+'/'));
 const current=travel.has(path)?'/cars/travel/':path.startsWith('/cars/upgrades/body-conversion/')?'/cars/upgrades/body-conversion/':path.startsWith('/cars/upgrades/')?'/cars/upgrades/':path;
 for(const a of document.querySelectorAll('.integration-nav a')){
  if(a.pathname===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
 }
})();
