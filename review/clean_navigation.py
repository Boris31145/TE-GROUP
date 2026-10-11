"""One-time, guarded migration of the existing local interface."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def edit(path,old,new):
    p=ROOT/path;s=p.read_text();assert old in s,(path,old[:70]);p.write_text(s.replace(old,new))
for page in ['goods','china-import','turkey-import','uae-import','israel-import','customs-clearance']:
    edit(page+'/index.html','<a href="/">Направления</a><a aria-current="page" href="/goods/">Товары</a><a href="/cars/">Автомобили ↗</a>','<a aria-current="page" href="/goods/">Товары</a><a href="/cars/">Автомобили</a>')
edit('cars/index.html','<small>АВТОМОБИЛИ</small>','')
edit('cars/index.html','<nav aria-label="Направления"><a href="/goods/">Товары</a><a class="active" href="/cars/">Автомобили</a></nav>','<nav class="direction-switch" aria-label="Направления"><a id="navGoods" href="/goods/">Товары</a><a id="navCars" class="active" aria-current="page" href="/cars/">Автомобили</a></nav>')
edit('cars/index.html','<section class="catalog-intro"><div><span class="eyebrow">США / КОРЕЯ / КИТАЙ</span><h1>Ваш следующий автомобиль.</h1><p>Небольшая подборка. Понятная смета. Конкретная машина.</p></div><div class="budget-note"><strong>До 6 млн ₽</strong><span>По полному бюджету сделки</span><a href="#how">Как проходит покупка ↓</a></div></section>','<section class="catalog-intro"><h1>Автомобили</h1></section>')
edit('cars/index.html','<label>Сортировка<select id="sort">','</div><details class="filter-extra"><summary>Сортировка и сброс</summary><div class="filters"><label>Сортировка<select id="sort">')
edit('cars/index.html','<button class="text-button" id="reset">Сбросить</button></div></div><section id="marketIntro" class="market-intro" hidden></section>','<button class="text-button" id="reset">Сбросить</button></div></details></div>')
edit('cars/index.html','<span id="updated">Проверяем источники</span>','')
p=ROOT/'cars/index.html';s=p.read_text();start=s.index('<section id="how"');end=s.index('<footer>',start)
s=s[:start]+'''<details class="buyer-guide"><summary>Как купить автомобиль</summary><ol><li>Откройте автомобиль: изучите состояние, источник и смету.</li><li>Забронируйте подтвержденную машину в кабинете: получите срок брони и счет на аванс. Неутвержденный счет остается черновиком.</li><li>Согласуйте и отдельно подпишите договор. Статусы и документы — в кабинете.</li></ol></details>
<details class="buyer-guide"><summary>Что проверить перед покупкой</summary><section id="marketIntro" class="market-intro" hidden></section></details>
<details class="source-details"><summary>О ценах и обновлении</summary><p id="updated">Проверяем источники</p><p>Оценка источника и полный бюджет сделки показаны отдельно. Бронировать можно только по утвержденной смете и после подтверждения продавца. Изменение цены или устаревшие данные требуют нового подтверждения.</p><div id="sources"></div></details>
'''+s[end:];s=s.replace('<a href="/cars/operations/">Сотрудникам</a>','');p.write_text(s)
edit('assets/js/auto.js','Полный бюджет по смете TE GROUP','Полный бюджет сделки')
edit('assets/js/auto.js','Оценка источника, состав ниже','Оценка источника · не полный бюджет')
edit('assets/js/auto.js','<p class="price-hint">${o.quote?\'Включая сумму компании и расходы покупателя.\':esc(o.price_basis)}</p>','')
edit('assets/js/auto.js','<div class="card-actions"><button class="outline" data-detail="${esc(o.id)}">Подробнее</button><button class="primary" data-book="${esc(o.id)}" ${o.bookable?\'\':\'disabled\'}>Забронировать</button></div><button type="button" class="text-button compare-toggle" data-compare="${esc(o.id)}" aria-pressed="${state.comparison.has(o.id)}">${state.comparison.has(o.id)?\'Убрать из сравнения\':\'+ К сравнению\'}</button>','<div class="card-actions"><button class="primary" data-detail="${esc(o.id)}">Открыть автомобиль</button></div>')
edit('assets/js/auto.js','Информация о подключении источников находится ниже.','Новые машины появятся после подтверждения предложения.')
# Keep one truthful review status, move test controls outside the product.
p=ROOT/'review/shell.html';s=p.read_text();start=s.index('    <div class="review-tools">');end=s.index('\n',start);tools=s[start:end];s=s[:start]+s[end:]
s=s.replace('<div class="review-toolbar"><span>МОБИЛЬНЫЙ ПРОСМОТР</span><button type="button" id="reviewWidth" class="cursor-interaction">На всю ширину</button></div>','')
s=s.replace('<div class="review-mode"><strong>Проверка интерфейса</strong><span>Реальной брони и оплаты нет</span></div>','<div class="review-mode" id="reviewMode">Тестовый просмотр · цены вымышленные · без оплаты</div>')
s=s.replace('<span class="eyebrow">TE GROUP / ДВА НАПРАВЛЕНИЯ</span><h1>Что доставить?</h1><p class="muted">Выберите направление.</p>','<h1>Выберите направление</h1>')
s=s.replace('<span>01 / ТОВАРЫ</span><strong>Товары<br>и логистика</strong><small>Поставки для бизнеса<br>Открыть направление →</small>','<strong>Товары</strong><small>Закупка и доставка<br>для бизнеса</small><span>Открыть →</span>')
s=s.replace('<span>02 / АВТОМОБИЛИ</span><strong>Ваш следующий<br>автомобиль</strong><small>США · Корея · Китай<br>Перейти в каталог →</small>','<strong>Автомобили</strong><small>США · Корея · Китай</small><span>В каталог →</span>')
start=s.index('    <section id="reviewGoods"');end=s.index('\n',start)
s=s[:start]+'''    <section id="reviewGoods" class="review-page" hidden><h1>Товары для бизнеса</h1><p class="muted">Закупка, международная доставка и таможенное оформление.</p><h2>Направления поставок</h2><p>Китай · Турция · ОАЭ · Израиль</p><details><summary>Услуги</summary><p>Поиск поставщика, закупка оборудования, электроники и текстиля, перевозка и оформление грузов.</p></details></section>'''+s[end:]
s=s.rsplit('</div>',1)[0]+ '<details class="review-settings"><summary>Настройки проверки</summary><button type="button" id="reviewWidth" class="cursor-interaction">На всю ширину</button>'+tools+'</details>\n</div>\n';p.write_text(s)
edit('review/enhancements.js',"  $('toast').hidden=true;", "  $('toast').hidden=true;\n  const goods=id==='reviewGoods',entry=id==='reviewEntry';\n  $('accountButton').hidden=goods||entry;\n  for(const [nav,active] of [['navGoods',goods],['navCars',!goods&&!entry]]){\n    $(nav).classList.toggle('active',active);$(nav).setAttribute('aria-current',active?'page':'false');\n  }")
edit('review/enhancements.js','<b>${esc(o.title.split(\' \')[0])}</b><span>${esc(o.title)}</span><small>${o.source===\'sandbox\'?\'Тестовая карточка · фото лота отсутствует\':\'Фото источника не сохранено\'}</small>','<small>Фото автомобиля не предоставлено</small>')
edit('review/enhancements.js',"$('modeBanner').textContent=review.mode==='test'?", "$('reviewMode').textContent=review.mode==='test'?")
with (ROOT/'review/enhancements.js').open('a') as f:f.write("\nreviewPage('reviewEntry');\n")
edit('review/build.py',"app=app.replace(\"d.mode==='sandbox'?\",\"d.mode==='review'?\")", "app=app.replace(\"d.mode==='sandbox'?\",\"d.mode==='review'?\")\n    app=app.replace(\"$('modeBanner').hidden=d.mode!=='review';\",\"$('modeBanner').hidden=true;\")")
edit('review/build.py','/workspace/tegroup-mobile-review-catalog.html','/workspace/tegroup-mobile-review-clean.html')
# Make both entry choices visible together on narrow screens.
p=ROOT/'index.html';s=p.read_text();start=s.index('    <div class="entry-heading"');end=s.index('\n  </main>',start)
s=s[:start]+'''    <div class="entry-heading"><h1>Выберите направление</h1></div>
    <div class="entry-grid">
      <a class="entry-card entry-goods" href="/goods/"><div class="entry-card-copy"><h2>Товары</h2><p>Закупка и доставка<br>для бизнеса</p><span class="entry-card-link">Открыть →</span></div></a>
      <a class="entry-card entry-cars" href="/cars/"><div class="entry-card-copy"><h2>Автомобили</h2><p>США · Корея · Китай</p><span class="entry-card-link">В каталог →</span></div></a>
    </div>'''+s[end:];p.write_text(s)
