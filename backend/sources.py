"""Conservative public-page adapters. No anti-bot bypass, auctions never become retail prices."""
import html, json, os, re, urllib.request, urllib.parse, urllib.robotparser, concurrent.futures
from html.parser import HTMLParser
from .domain import Problem

class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]
    def handle_data(self,d):self.parts.append(d)
def plain(s):
    p=Text();p.feed(s);return ' '.join(' '.join(p.parts).split())
def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'TEGroupCatalog/1.0 (+https://tegroup.cc/; catalog price monitor)','Accept-Language':'ru'})
    with urllib.request.urlopen(req,timeout=12) as response:
        if response.status!=200: raise Problem('Источник недоступен.',502)
        raw=response.read(3_000_001)
        if len(raw)>3_000_000: raise Problem('Слишком большой ответ источника.',502)
        return raw.decode('utf-8',errors='replace')
def permission(base,path):
    robots=fetch(base+'/robots.txt');rp=urllib.robotparser.RobotFileParser();rp.parse(robots.splitlines())
    if not rp.can_fetch('TEGroupCatalog',base+path):raise Problem('Чтение запрещено robots.txt. Нужна партнерская выгрузка.',502)
def parse_pilicar(s):
    offers=[]
    for link,body in re.findall(r'<a\b[^>]*href="(/cars/[^"?#]+)"[^>]*>(.*?)</a>',s,re.S):
        text=plain(body)
        if re.search(r'\b(Sold|Продан|Продано)\b',text,re.I):continue
        title=re.search(r'<h3\b[^>]*>(.*?)</h3>',body,re.S)
        price=re.search(r'([\d\s\u00a0]+)\s*₽',text)
        if not title or not price:continue
        title=plain(title.group(1)); year=re.search(r'·\s*(20\d\d)',title)
        spec_text=plain(re.sub(r'<h3\b[^>]*>.*?</h3>','',body,flags=re.S))
        km=re.search(r'([\d\s\u00a0]+)\s*(?:км|km)',spec_text)
        yuan=re.search(r'([\d\s\u00a0]+)\s*¥',text)
        photo=re.search(r'<img\b[^>]*src="([^"]+)"',body)
        offers.append({'source':'pilicar','source_id':link.split('/')[-1],'country':'CN','title':title.split(' ·')[0],'year':int(year.group(1)) if year else None,'mileage_km':int(re.sub(r'\D','',km.group(1))) if km else None,'fuel':next((f for f in ['Бензин','Дизель','Гибрид','Электро'] if f in text),'Уточняется'),'source_url':'https://pilicar.com'+link,'image_url':urllib.parse.urljoin('https://pilicar.com',html.unescape(photo.group(1))) if photo else None,'source_price_rub':int(re.sub(r'\D','',price.group(1))),'source_currency':'CNY','source_price':int(re.sub(r'\D','',yuan.group(1))) if yuan else None,'price_kind':'source_estimate','price_basis':'Оценка PILICAR до Владивостока с таможенными платежами; доставка в другой город и условия TE GROUP не включены.','description':'Параметры и цена получены из карточки источника. Смета TE GROUP пока не утверждена.'})
    return offers

def pilicar():
    permission('https://pilicar.com','/ru/catalog')
    return parse_pilicar(fetch('https://pilicar.com/ru/catalog'))

def westmotors():
    permission('https://westmotors.ru','/catalog-avto')
    s=fetch('https://westmotors.ru/catalog-avto')
    if any(t in s.lower() for t in ('проверяем браузер','checking your browser','captcha','cf-chl','проверка браузера')) or len(s)<1500:
        raise Problem('Автоматическое чтение блокируется проверкой браузера. Нужна доступная выгрузка WestMotors.',502)
    # No guessing HTML selectors or treating a current bid as a full-budget quote.
    raise Problem('Прямая структурированная выгрузка WestMotors не подключена. Импортируйте согласованный JSON через команду import.',502)

def sync(store):
    from .usa import carsfromusa
    feeds=store.config.get('source_feeds',{})
    for source,adapter in [('westmotors',westmotors),('pilicar',pilicar),('velauto',velauto),('carsfromusa',carsfromusa)]:
        try:
            settings=feeds.get(source,{})
            records=normalized_feed(source,settings) if settings.get('url') else adapter()
            store.upsert(source,records,authoritative=bool(settings.get('url') and settings.get('authoritative')))
        except Exception as exc:store.source_error(source,exc.message if isinstance(exc,Problem) else 'Ошибка чтения источника: '+type(exc).__name__)

def vela_record(link,title,meta,price,country,image=None):
    if country not in ('KR','CN') or not re.fullmatch(r'/catalog/\d+',link):return None
    match=re.search(r'([\d\s\u00a0]+)\s*₽',price)
    year=re.search(r'(?:·\s*|\s)(20\d\d)(?:\b|$)',title)
    if not match or not year:return None
    amount=int(re.sub(r'\D','',match.group(1)))
    if amount<=0:return None
    km=re.search(r'([\d\s\u00a0]+)\s*(тыс\.)?\s*км',meta)
    image_url=None
    if image:
        u=urllib.parse.urlsplit(image)
        if u.scheme=='https' and (u.hostname=='ci.encar.com' or (u.hostname or '').endswith('.byteimg.com')):
            image_url='https://velauto.ru/_next/image?'+urllib.parse.urlencode({'url':image,'w':640,'q':75})
    return {'source':'velauto','source_id':link.rsplit('/',1)[1],'country':country,'title':title[:year.start()].rstrip(' ·,'),'year':int(year.group(1)),'mileage_km':int(re.sub(r'\D','',km.group(1)))*(1000 if km.group(2) else 1) if km else None,'mileage_approx':bool(km and km.group(2)),'fuel':'Уточняется','source_url':'https://velauto.ru'+link,'image_url':image_url,'source_price_rub':amount,'source_currency':'RUB','source_price':amount,'price_kind':'source_estimate','price_basis':'Оценка VELAUTO под ключ до Владивостока; условия и комиссия TE GROUP отдельно не утверждены.','description':'Рублевая оценка источника. Для брони нужны VIN, подтверждение продавца и смета TE GROUP.'}

def parse_velauto(s,country=None):
    records={}
    if country:
        # Country-specific public SSR shortlist; do not infer origin from vehicle brand.
        for link,body in re.findall(r'<a\b[^>]*href="(/catalog/\d+)"[^>]*>(.*?)</a>',s,re.S):
            text=plain(body)
            if '₽' not in text:continue
            title=text.split(',')[0];r=vela_record(link,title,text[len(title):],text,country)
            if r:records[r['source_id']]=r
    chunks=[]
    for raw in re.findall(r'self\.__next_f\.push\((.*?)\)</script>',s,re.S):
        try:row=json.loads(raw)
        except ValueError:continue
        if len(row)>1 and isinstance(row[1],str):chunks.append(row[1])
    def walk(node):
        if isinstance(node,dict):
            origin=node.get('feed',{}).get('country') if isinstance(node.get('feed'),dict) else None
            if origin in ('korea','china') and isinstance(node.get('cars'),list):
                for c in node['cars']:
                    if not isinstance(c,dict):continue
                    r=vela_record(c.get('href',''),c.get('name',''),c.get('meta',''),c.get('price',''),{'korea':'KR','china':'CN'}[origin],c.get('img'))
                    if r:records[r['source_id']]=r
            for x in node.values():walk(x)
        elif isinstance(node,list):
            for x in node:walk(x)
    for line in ''.join(chunks).splitlines():
        try:node=json.loads(line.split(':',1)[1])
        except (ValueError,IndexError):continue
        walk(node)
    return list(records.values())

def velauto():
    permission('https://velauto.ru','/catalog')
    records={}
    for path,country in [('/',None),('/catalog?country=korea','KR'),('/catalog?country=china','CN')]:
        for row in parse_velauto(fetch('https://velauto.ru'+path),country):
            old=records.get(row['source_id'])
            if old and old.get('image_url') and not row.get('image_url'):row['image_url']=old['image_url']
            records[row['source_id']]=row
    # Enrich only the curated price tiers, rather than crawling the whole market.
    shortlist=[]
    for country in ('KR','CN'):
        for lo,hi,count in [(0,3000000,5),(3000000,4500000,2),(4500000,6000000,2)]:
            shortlist+=sorted([r for r in records.values() if r['country']==country and lo<r['source_price_rub']<=hi],key=lambda r:(-(r.get('year') or 0),r['source_price_rub'],r['source_id']))[:count]
    def enrich(row):
        try:return row['source_id'],parse_velauto_detail(fetch(row['source_url']),row)
        except Exception:return row['source_id'],row
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        for source_id,row in pool.map(enrich,shortlist):
            if row:records[source_id]=row
            else:records.pop(source_id,None)
    return list(records.values())

def parse_velauto_detail(markup, row):
    chunks=[]
    for raw in re.findall(r'self\.__next_f\.push\((.*?)\)</script>',markup,re.S):
        try:part=json.loads(raw)
        except ValueError:continue
        if len(part)>1 and isinstance(part[1],str):chunks.append(part[1])
    cars=[]
    def walk(node):
        if isinstance(node,dict):
            car=node.get('initialData',{}).get('car') if isinstance(node.get('initialData'),dict) else None
            if isinstance(car,dict):cars.append(car)
            for child in node.values():walk(child)
        elif isinstance(node,list):
            for child in node:walk(child)
    for line in ''.join(chunks).splitlines():
        try:walk(json.loads(line.split(':',1)[1]))
        except (ValueError,IndexError):continue
    for car in cars:
        country={'korea':'KR','china':'CN'}.get(car.get('country'))
        if str(car.get('id'))!=row['source_id']:continue
        if country!=row['country']:return None
        if car.get('isActive') is False:return None
        images=[]
        for url in [car.get('coverUrl')]+(car.get('images') or []):
            u=urllib.parse.urlsplit(url or '')
            if u.scheme=='https' and (u.hostname=='ci.encar.com' or (u.hostname or '').endswith('.byteimg.com')):
                proxy='https://velauto.ru/_next/image?'+urllib.parse.urlencode({'url':url,'w':640,'q':75})
                if proxy not in images:images.append(proxy)
        updated=dict(row)
        if images:updated.update(image_url=images[0],image_urls=images[:6])
        updated['fuel']={'gasoline':'Бензин','diesel':'Дизель','electric':'Электро','hybrid':'Гибрид','lpg':'Газ'}.get(car.get('fuelType'),row['fuel'])
        updated.update(transmission=car.get('transmission'),engine_cc=car.get('engineVolume'),power_hp=car.get('powerHp'),mileage_approx=False)
        if isinstance(car.get('mileage'),int):updated['mileage_km']=car['mileage']
        if type(car.get('priceUssuriysk')) is int and car['priceUssuriysk']>0:
            updated.update(source_price_rub=car['priceUssuriysk'],source_price=car['priceUssuriysk'],price_basis='Оценка VELAUTO до Уссурийска с импортными платежами. Цена и наценка TE GROUP, доставка до вашего города согласуются отдельно.')
        return updated
    return row


def normalized_feed(source,settings):
    """Authorized partner/owned JSON feed using our documented normalization contract."""
    url=settings['url'];parts=urllib.parse.urlsplit(url)
    if parts.scheme!='https' or parts.username or parts.password:raise Problem('Выгрузка должна использовать HTTPS; учетные данные задаются через окружение.',502)
    headers={'Accept':'application/json','User-Agent':'TEGroupCatalog/1.0'}
    if settings.get('token_env'):
        token=os.environ.get(settings['token_env'])
        if not token:raise Problem('Не настроен токен согласованной выгрузки.',502)
        headers['Authorization']='Bearer '+token
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    with urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,headers=headers),timeout=12) as response:
        raw=response.read(3_000_001)
        if len(raw)>3_000_000:raise Problem('Выгрузка слишком большая.',502)
    payload=json.loads(raw)
    records=payload if isinstance(payload,list) else payload.get('offers')
    if not isinstance(records,list) or any(not isinstance(r,dict) or r.get('source')!=source for r in records):raise Problem('Выгрузка не соответствует нормализованной схеме offers.',502)
    return records
