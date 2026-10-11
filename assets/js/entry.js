/* Keep old links such as /#contact and /#calculator useful after the split. */
(() => {
  function restoreGoodsLink() {
    const hash = window.location.hash;
    if (hash && hash !== '#directions') {
      window.location.replace('/goods/' + window.location.search + hash);
    }
  }
  restoreGoodsLink();
  window.addEventListener('hashchange', restoreGoodsLink);
})();
