"""Export the actual car UI with an explicit, isolated offline review adapter."""
import base64,json,re,tempfile,time
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.domain import Store
from backend.server import sandbox
from backend.documents import legal_body
from backend.legal_content import contract_terms

def build(fragment,standalone):
    config=json.loads((ROOT/'config/business.example.json').read_text())
    with tempfile.TemporaryDirectory() as temp:
        s=Store(Path(temp)/'review.sqlite',config|{'mode':'sandbox','max_feed_age_seconds':86400});sandbox(s)
        seed=s.catalog()
        for o in seed['offers']:
            o['quote_expires']=int(time.time())+86400
            if o['country']=='US':
                o.update(damage='Тестовый пример: повреждения не оценены',title_status='Тестовый документ; реальных документов нет',inspection_note='Тестовый сценарий, отчет не приложен',repair_note='Вымышленная смета; ремонт требует отдельной оценки')
        actual=Store(Path(temp)/'actual.sqlite',config)
        snapshot=json.loads((ROOT/'config/catalog.snapshot.json').read_text())
        for source,d in snapshot.items():
            actual.upsert(source,d['offers'])
            with actual.connection() as db:
                db.execute('UPDATE offers SET updated=? WHERE source=?',(d['captured_at'],source))
                db.execute('UPDATE source_runs SET attempted=?,succeeded=? WHERE source=?',(d['captured_at'],d['captured_at'],source))
        actual.source_error('westmotors','WestMotors блокирует автоматическое чтение проверкой браузера; доступная выгрузка не подключена.')
        live=actual.catalog()
        live['intake']=[dict(o,id='carsfromusa:'+o['source_id'],updated_at=snapshot['carsfromusa']['captured_at']) for o in snapshot.get('carsfromusa',{}).get('offers',[])][:10]
        # Offline source snapshot is never made bookable or presented as fresh.
        for o in live['offers']:o['bookable']=False;o['stale']=True
    body=re.search(r'<body>(.*)</body>',(ROOT/'cars/index.html').read_text(),re.S).group(1)
    logo='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'favicon.svg').read_bytes()).decode()
    body=body.replace('src="/favicon.svg"',f'src="{logo}"')
    body=re.sub(r'<dialog ([^>]+)>',r'<section \1 hidden>',body).replace('</dialog>','</section>')
    body=body.replace('class="wide-dialog"','class="wide-dialog review-modal"')
    body=body.replace('<section id="detailDialog"','<section class="review-modal" id="detailDialog"').replace('<section id="authDialog"','<section class="review-modal" id="authDialog"').replace('<section id="reserveDialog"','<section class="review-modal" id="reserveDialog"')
    body=body.replace('<section id="inquiryDialog"','<section class="review-modal" id="inquiryDialog"')
    body=body.replace('<section id="buyerDialog"','<section class="review-modal" id="buyerDialog"')
    body=body.replace('class="compare-dialog"','class="compare-dialog review-modal"')
    body=body.replace('<form id="buyerForm">','<button type="button" id="reviewBuyerFill" class="outline">Заполнить вымышленные данные покупателя</button><form id="buyerForm">')
    body=body.replace('aria-label="Закрыть">×','aria-label="Назад">← Назад')
    body=body.replace('<form id="authForm">','<p class="notice">Только тестовые данные. Кабинет в этом файле работает в памяти и очищается при перезагрузке.</p><button type="button" id="reviewFill" class="outline">Заполнить тестовые данные</button><form id="authForm">')
    css=(ROOT/'assets/css/auto.css').read_text()
    # Scope original stylesheet for the conversation. At-rules remain intact.
    def scope(m):
        selectors=m.group(1).strip()
        if selectors.startswith('@') or selectors.endswith('%') or selectors in ('from','to'):return m.group(0)
        scoped=[]
        for v in selectors.split(','):
            v=v.strip()
            if v in (':root','body','*'):v='#tegroup-mobile-review'+(' *' if v=='*' else '')
            elif v.startswith('body.'):v='#tegroup-mobile-review '+v[5:]
            else:v='#tegroup-mobile-review '+v
            scoped.append(v)
        return ','.join(scoped)+'{'
    css=re.sub(r'([^{}]+)\{',scope,css).replace('cursor:pointer','cursor:inherit')
    app=(ROOT/'assets/js/auto.js').read_text()
    app=app.replace('const $=id=>document.getElementById(id);',"const $=id=>root.querySelector('#'+id);")
    app=re.sub(r'async function api\(url,data\)\{.*?\nfunction toast',"async function api(url,data){return review.api(url,data)}\nfunction toast",app,flags=re.S)
    # These are page-sized panels in the inline/mobile review, rather than nested scrolling dialogs.
    app=re.sub(r'function open\(id\).*?\nfunction price', 'function price',app,flags=re.S)
    app=app.replace('document.querySelectorAll(', 'root.querySelectorAll(')
    app=app.replace('!confirm(', '!await reviewConfirm(')
    app=app.replace("state.key=crypto.randomUUID()","state.key='offline-'+Date.now()+'-'+Math.random().toString(36).slice(2)")
    app=re.sub(r'function mediaHtml\(o,index=0\).*?(?=\nfunction)', 'function mediaHtml(o,index=0){return reviewMedia(o,index)}',app,flags=re.S)
    app=app.replace('return $(id).open===true','return !$(id).hidden')
    app=app.replace("d.mode==='sandbox'?","d.mode==='review'?")
    app=app.replace("$('modeBanner').hidden=false;","$('modeBanner').hidden=true;")
    app=app.replace('ТЕСТОВЫЙ РЕЖИМ · 27 вымышленных предложений для проверки кабинета, бронирования и документов. Реальной продажи и оплаты нет.','27 вымышленных машин для проверки интерфейса. Цены тестовые; данные кабинета живут только до перезагрузки.')
    app=app.replace("'Последняя выгрузка: '+date(Math.max(...state.offers.map(o=>o.updated_at)))","review.mode==='test'?'Тестовые цены · без обновления':'Сохранённые цены · обновление только в серверной версии'")
    app=app.replace('Полный бюджет по смете TE GROUP','Полный бюджет / тестовый пример').replace('Доступность подтверждена','Тест: доступность подтверждена')
    app=app.replace("Promise.all([loadSession(),loadCatalog()]).catch(e=>toast(e.message));setInterval(()=>{if(!document.hidden)loadCatalog()},30000);", "Promise.all([loadSession(),loadCatalog()]).catch(e=>toast(e.message));")
    # External snapshot photos can optionally be embedded by the asset preparer.
    images_path=ROOT/'review/images.json'
    if images_path.exists():
        images=json.loads(images_path.read_text())
        for o in live['offers']:
            o['review_images']=[images[k] for k in [o['id'],o['id']+':photo:1',o['id']+':photo:2'] if k in images]
    payload=json.dumps({'seed':seed,'actual':live,'legal':{k:legal_body(k,config) for k in ['privacy','consent','reservation','contract-consent','contract-template']}|{'contract-terms':contract_terms()}},ensure_ascii=False).replace('</','<\\/')
    script="(()=>{'use strict';const root=document.getElementById('tegroup-mobile-review');\n"+(ROOT/'review/offline.js').read_text()+"\nconst payload="+payload+";const review=createReview(payload.seed,payload.actual,payload.legal);\n"+(ROOT/'assets/js/market.js').read_text()+"\n"+(ROOT/'assets/js/catalog.js').read_text()+"\n"+app+"\n"+(ROOT/'review/enhancements.js').read_text()+"\n})();"
    body=re.sub(r'<button\b(?![^>]*class=)', '<button class="cursor-interaction"',body)
    body=re.sub(r'(<button\b[^>]*class=")([^"]*)',r'\1\2 cursor-interaction',body)
    shell=(ROOT/'review/shell.html').read_text().replace('<!-- APPLICATION -->',body)
    for token,asset in [('REVIEW_GOODS_IMAGE','assets/images/goods.webp'),('REVIEW_CARS_IMAGE','assets/cars/bmw.webp')]:
        shell=shell.replace(token,'data:image/webp;base64,'+base64.b64encode((ROOT/asset).read_bytes()).decode())
    fragment.write_text('<style>\n'+css+'\n'+(ROOT/'review/preview.css').read_text()+'\n</style>\n'+shell+'\n<script>\n'+script+'\n</script>\n')
    standalone.write_text('<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TE GROUP — мобильная проверка</title><style>body{margin:0;background:#eef1f6}button{cursor:pointer}</style></head><body>\n'+fragment.read_text()+'</body></html>\n')
    print(f'Fragment: {fragment.stat().st_size} bytes; standalone: {standalone.stat().st_size} bytes; US test offers: 9; actual US candidates: '+str(live['mix']['US']['available']))

if __name__=='__main__':
    dest=ROOT.parent/'output/site';dest.mkdir(parents=True,exist_ok=True)
    build(Path('/workspace/tegroup-mobile-review-booking.html'),dest/'TE_GROUP_Mobile_Review.html')
