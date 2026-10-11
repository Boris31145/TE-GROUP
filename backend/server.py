"""Local server + REST API. Public production needs a hardened Russian-hosted deployment."""
import argparse, collections, getpass, hashlib, hmac, http.cookies, json, mimetypes, os, secrets, threading, time, urllib.parse, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .domain import Store, Problem, LEGAL_VERSION, CONTRACT_CONSENT_VERSION, INQUIRY_VERSION, timestamp, password_hash
from . import documents, sources
ROOT=Path(__file__).resolve().parent.parent

class Application:
    def __init__(self,db_path,config):
        self.store=Store(db_path,config);self.config=config;self.secret=secrets.token_bytes(32);self.origin=config.get('origin');self.limits={};self.lock=threading.Lock()
    def anonymous_csrf(self):
        value=f'{timestamp()+3600}.{secrets.token_urlsafe(24)}'
        return value+'.'+hmac.new(self.secret,value.encode(),hashlib.sha256).hexdigest()
    def check_anonymous_csrf(self,value):
        try:
            expiry,nonce,sig=value.split('.'); expected=hmac.new(self.secret,f'{expiry}.{nonce}'.encode(),hashlib.sha256).hexdigest()
            return int(expiry)>timestamp() and hmac.compare_digest(sig,expected)
        except (ValueError,AttributeError):return False
    def limit(self,key):
        with self.lock:
            now=timestamp();self.limits={k:v for k,v in self.limits.items() if v[0]>now-60}
            since,count=self.limits.get(key,(now,0));self.limits[key]=(since,count+1)
            if count>=20:raise Problem('Слишком много попыток. Повторите через минуту.',429)
    def validate_production(self):
        if self.config.get('mode')!='production':return
        c=self.config
        if c.get('personal_data_region')!='RU' or not c.get('documents_approved') or not str(c.get('origin','')).startswith('https://'):
            raise Problem('Production требует RU-хранилища, утвержденных документов и HTTPS origin.',503)
        if not c.get('reservation_amount_rub') or not all(c.get('issuer',{}).get(k) for k in ('name','tax_id','address','bank','account','bank_code','payment_terms')):
            raise Problem('Production требует суммы аванса, реквизитов получателя и условий платежа.',503)
        if not all(c.get('operator',{}).get(k) for k in ('name','tax_id','address','email')):raise Problem('Не заполнен оператор персональных данных.',503)

class Handler(BaseHTTPRequestHandler):
    server_version='TEGroup/1.0';sys_version=''
    def log_message(self,format,*args): pass  # Do not log customer data, tokens or query strings.
    @property
    def app(self):return self.server.app
    def cookies(self):
        c=http.cookies.SimpleCookie()
        try:c.load(self.headers.get('Cookie',''))
        except http.cookies.CookieError:pass
        return c
    def cookie_value(self,name):
        c=self.cookies();return c[name].value if name in c else ''
    def actor(self):return self.app.store.auth(self.cookie_value('tg_session'))
    def cookie(self,name,value,max_age=86400):
        secure='; Secure' if self.app.config.get('mode')=='production' else ''
        return f'{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}'
    def output(self,status,body,kind='application/json; charset=utf-8',cookies=()):
        if isinstance(body,(dict,list)):body=json.dumps(body,ensure_ascii=False).encode()
        elif isinstance(body,str):body=body.encode()
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Frame-Options','DENY')
        self.send_header('Cache-Control','public, max-age=3600' if self.path.startswith('/api/media?') else 'no-store' if self.path.startswith(('/api/','/legal/')) else 'no-cache')
        if self.app.config.get('mode')=='production':self.send_header('Strict-Transport-Security','max-age=31536000')
        if self.path.startswith(('/cars/','/api/','/legal/')):
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        for c in cookies:self.send_header('Set-Cookie',c)
        self.end_headers();self.wfile.write(body)
    def json_body(self):
        try:n=int(self.headers.get('Content-Length','0'))
        except ValueError:raise Problem('Некорректный запрос.')
        if not 0<n<=12000:raise Problem('Недопустимый размер запроса.',413)
        if not self.headers.get('Content-Type','').startswith('application/json'):raise Problem('Нужен JSON.',415)
        try:d=json.loads(self.rfile.read(n))
        except (ValueError,UnicodeDecodeError):raise Problem('Некорректный JSON.')
        if not isinstance(d,dict):raise Problem('Нужен объект JSON.')
        return d
    def csrf(self):
        if self.headers.get('Origin')!=self.app.origin:raise Problem('Запрос с другого сайта запрещен.',403)
        token=self.headers.get('X-CSRF-Token','')
        try:expected=self.actor()['csrf']
        except Problem:
            expected=self.cookie_value('tg_anon')
            if not self.app.check_anonymous_csrf(expected):raise Problem('Обновите страницу перед отправкой.',403)
        if not token or not hmac.compare_digest(token,expected):raise Problem('Обновите страницу перед отправкой.',403)
    def handle_request(self,method):
        if self.headers.get('Host')!=urllib.parse.urlsplit(self.app.origin).netloc:raise Problem('Недопустимый адрес сервера.',400)
        p=urllib.parse.urlsplit(self.path);path=p.path;s=self.app.store
        if method=='GET':
            if path=='/api/catalog':return self.output(200,s.catalog())
            if path=='/api/media':
                oid=urllib.parse.parse_qs(p.query).get('offer_id',[''])[0]
                with s.connection() as db:row=db.execute('SELECT data FROM offers WHERE id=?',(oid,)).fetchone()
                if not row:raise Problem('Фото не найдено.',404)
                car=json.loads(row['data']);images=car.get('image_urls') or [car.get('image_url')]
                try:index=int(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('photo',['0'])[0])
                except ValueError:raise Problem('Фото не найдено.',404)
                if not 0<=index<min(len(images),6):raise Problem('Фото не найдено.',404)
                url=images[index];parsed=urllib.parse.urlsplit(url or '')
                allowed=(parsed.netloc=='cs.copart.com' and parsed.path.startswith('/v1/AUTH_svc.pdoc00001/ids-c-prod-lpp/')) or (parsed.netloc=='vis.iaai.com' and parsed.path=='/resizer') or (parsed.netloc=='pilicar.com' and parsed.path.startswith('/api/media/')) or (parsed.netloc=='velauto.ru' and parsed.path=='/_next/image')
                if parsed.scheme!='https' or not allowed:raise Problem('Фото не найдено.',404)
                cache=Path(s.path).parent/'media';cache.mkdir(exist_ok=True);key=hashlib.sha256(url.encode()).hexdigest();file=cache/(key+'.bin');meta=cache/(key+'.type')
                if file.exists() and meta.exists():return self.output(200,file.read_bytes(),meta.read_text())
                class NoRedirect(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self,*args,**kwargs):return None
                try:
                    request=urllib.request.Request(url,headers={'User-Agent':'TEGroupCatalog/1.0 (+https://tegroup.cc/)'})
                    with urllib.request.build_opener(NoRedirect).open(request,timeout=12) as response:
                        kind=response.headers.get_content_type();body=response.read(2_000_001)
                        if kind not in ('image/jpeg','image/png','image/webp') or len(body)>2_000_000:raise Problem('Фото недоступно.',502)
                    file.write_bytes(body);meta.write_text(kind)
                    return self.output(200,body,kind)
                except Exception:raise Problem('Фото источника недоступно.',502)
            if path=='/api/session':
                try:a=self.actor();return self.output(200,{'user':{k:a[k] for k in ('id','email','name','role','withdrawn')},'csrf':a['csrf'],'legal_version':LEGAL_VERSION,'contract_consent_version':CONTRACT_CONSENT_VERSION,'inquiry_version':INQUIRY_VERSION,'mode':self.app.config.get('mode','local')})
                except Problem:
                    csrf=self.cookie_value('tg_anon')
                    if not self.app.check_anonymous_csrf(csrf):csrf=self.app.anonymous_csrf()
                    return self.output(200,{'user':None,'csrf':csrf,'legal_version':LEGAL_VERSION,'contract_consent_version':CONTRACT_CONSENT_VERSION,'inquiry_version':INQUIRY_VERSION,'mode':self.app.config.get('mode','local')},cookies=[self.cookie('tg_anon',csrf,3600)])
            if path=='/api/bookings':return self.output(200,{'bookings':s.bookings(self.actor())})
            if path=='/api/inquiries':return self.output(200,{'inquiries':s.inquiries(self.actor())})
            if path=='/api/account/export':
                a=self.actor()
                with s.connection() as db:consent=[dict(r) for r in db.execute('SELECT version,document_hash,accepted,revoked FROM consent WHERE user_id=?',(a['id'],))]
                return self.output(200,{'account':{k:a[k] for k in ('id','name','email','withdrawn')},'consents':consent,'bookings':s.bookings(a),'inquiries':s.inquiries(a)})
            if path.startswith('/legal/'):
                kind=path.strip('/').split('/')[-1]
                if kind in ('consent','privacy','reservation','contract-consent','contract-template'):return self.output(200,documents.legal_page(kind,self.app.config),'text/html; charset=utf-8')
                raise Problem('Страница не найдена.',404)
            if path.startswith('/api/bookings/'):
                parts=path.strip('/').split('/');b=s.booking(self.actor(),parts[2])
                if len(parts)==4 and parts[3]=='invoice':
                    with s.connection() as db:issuer=json.loads(db.execute('SELECT issuer FROM invoices WHERE booking_id=?',(b['id'],)).fetchone()[0])
                    return self.output(200,documents.invoice(b,issuer),'text/html; charset=utf-8')
                if len(parts)==4 and parts[3]=='contract':return self.output(200,documents.contract(b,self.app.config.get('issuer',{})),'text/html; charset=utf-8')
                raise Problem('Документ не найден.',404)
            if path=='/api/operations':
                a=self.actor()
                if a['role']!='manager':raise Problem('Недостаточно прав.',403)
                with s.connection() as db:
                    rows=db.execute('SELECT * FROM offers WHERE active=1').fetchall()
                    requests=[dict(r) for r in db.execute('SELECT * FROM privacy_requests ORDER BY created DESC')]
                return self.output(200,{'offers':[s.public_offer(r) for r in rows],'bookings':s.bookings(a),'inquiries':s.inquiries(a),'privacy_requests':requests,'sources':s.catalog()['sources']})
            return self.static(path)
        self.csrf();d=self.json_body()
        if path in ('/api/register','/api/login'):
            self.app.limit(self.client_address[0])
            if not all(isinstance(d.get(k),str) for k in ('email','password')):raise Problem('Укажите email и пароль.')
            if len(d['password'])>128:raise Problem('Слишком длинный пароль.')
            if path=='/api/register':
                if not isinstance(d.get('name'),str):raise Problem('Укажите имя.')
                uid=s.register(d['email'],d['name'],d['password'],d.get('consent') is True,d.get('legal_version'),documents.legal_hash(self.app.config),documents.legal_body('consent',self.app.config));token,csrf=s.session(uid)
            else:token,csrf=s.login(d['email'],d['password'])
            return self.output(200,{'ok':True,'csrf':csrf},cookies=[self.cookie('tg_session',token),self.cookie('tg_anon','',0)])
        if path=='/api/logout':s.logout(self.cookie_value('tg_session'));return self.output(200,{'ok':True},cookies=[self.cookie('tg_session','',0)])
        a=self.actor()
        if path=='/api/inquiries':return self.output(201,s.inquire(a,d))
        if path.startswith('/api/inquiries/'):
            parts=path.strip('/').split('/')
            if len(parts)==3:return self.output(200,s.inquiry_action(a,parts[2],d))
            raise Problem('Действие не найдено.',404)
        if path=='/api/reserve':
            if d.get('terms_version')!=LEGAL_VERSION:raise Problem('Подтвердите актуальные условия бронирования.')
            return self.output(201,s.reserve(a,d.get('offer_id'),d.get('version'),d.get('idempotency')))
        if path=='/api/account/request':return self.output(200,s.privacy_request(a,d.get('kind')))
        if path.startswith('/api/bookings/'):
            parts=path.strip('/').split('/')
            if len(parts)==4 and parts[3]=='prepare_contract':return self.output(200,s.prepare_contract(a,parts[2],d,documents.legal_body('contract-consent',self.app.config)))
            if len(parts)==4:return self.output(200,s.transition(a,parts[2],parts[3],d))
        if path=='/api/operations/quote':return self.output(200,s.quote(d.get('offer_id'),a,d.get('quote',{}),str(d.get('supplier_reference','')),d.get('version')))
        if path=='/api/operations/privacy/complete':
            if a['role']!='manager':raise Problem('Недостаточно прав.',403)
            if not d.get('reference'):raise Problem('Укажите основание и результат исполнения запроса.')
            with s.connection() as db:
                row=db.execute('SELECT * FROM privacy_requests WHERE id=?',(d.get('request_id'),)).fetchone()
                if not row:raise Problem('Запрос не найден.',404)
                db.execute("UPDATE privacy_requests SET status='completed' WHERE id=?",(row['id'],));s.event(db,None,a['id'],'privacy_completed',{'request_id':row['id'],'reference':str(d['reference'])[:300]})
            return self.output(200,{'ok':True})
        raise Problem('Действие не найдено.',404)
    def static(self,path):
        path=urllib.parse.unquote(path)
        if path.endswith('/'):path+='index.html'
        candidate=(ROOT/path.lstrip('/')).resolve()
        if not candidate.is_relative_to(ROOT):raise Problem('Файл не найден.',404)
        relative=candidate.relative_to(ROOT);parts=relative.parts
        allowed=parts and (parts[0] in ('assets','cars','goods','china-import','turkey-import','uae-import','israel-import','customs-clearance') or len(parts)==1)
        if not allowed or candidate.suffix.lower() not in ('.html','.css','.js','.svg','.png','.jpg','.jpeg','.webp','.ico','.txt','.xml','.woff2') or not candidate.is_file():raise Problem('Файл не найден.',404)
        return self.output(200,candidate.read_bytes(),mimetypes.guess_type(str(candidate))[0] or 'application/octet-stream')
    def do_GET(self):self.execute('GET')
    def do_POST(self):self.execute('POST')
    def execute(self,method):
        try:self.handle_request(method)
        except Problem as e:self.output(e.status,{'error':e.message})
        except Exception:self.output(500,{'error':'Внутренняя ошибка сервера. Повторите позже.'})

def create_server(app,host='127.0.0.1',port=8000):
    app.validate_production()
    server=ThreadingHTTPServer((host,port),Handler);server.app=app
    if not app.origin:app.origin=f'http://{host}:{server.server_address[1]}'
    app.validate_production();return server

def sandbox(store):
    models={'US':['Toyota Corolla','Honda Civic','Hyundai Elantra','Kia Forte','Nissan Sentra','Toyota Camry','Honda CR-V','Lexus NX','Toyota Highlander'],'KR':['Kia K3','Hyundai Avante','Kia Rio','Hyundai i30','Kia Seltos','Kia K5','Hyundai Tucson','Kia Sorento','Genesis G70'],'CN':['Geely Emgrand','Changan Eado','Haval M6','Chery Tiggo 4','Volkswagen Lavida','Geely Atlas','Changan UNI-K','Geely Monjaro','Li Auto L6']}
    prices=[1800000,2100000,2350000,2650000,2950000,3500000,4150000,5100000,5800000];records=[]
    for country,names in models.items():
        for i,(title,price) in enumerate(zip(names,prices)):
            records.append({'source':'sandbox','source_id':country+str(i),'country':country,'title':title,'year':2022+i%3,'mileage_km':18000+i*3100,'fuel':'Бензин','source_url':'','image_url':None,'source_price_rub':price,'source_price':None,'source_currency':'RUB','price_kind':'source_estimate','price_basis':'Тестовые данные для проверки сценария. Предложения не продаются.','description':'Тестовый автомобиль — не реальное объявление.'})
    store.upsert('sandbox',records,True)
    for x in records:
        total=x['source_price_rub'];store.quote('sandbox:'+x['source_id'],{'id':'sandbox','role':'manager'},{'vin':'T'+x['country']+x['source_id'][-1].zfill(14),'vehicle_rub':total-500000,'delivery_rub':180000,'company_fee_rub':120000,'buyer_costs_rub':200000,'destination':'Тестовый пункт доставки','terms':'Тестовый сценарий: платежи и реальная продажа не выполняются.'},'SANDBOX-NOT-A-SUPPLIER-CONFIRMATION',1)
    # Long-lived test data; real quotes always have short expiry.
    with store.connection() as db:db.execute("UPDATE offers SET quote_expires=? WHERE source='sandbox'",(timestamp()+86400,))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',nargs='?',choices=['serve','sync','import','create-manager'],default='serve');parser.add_argument('--sandbox',action='store_true');parser.add_argument('--port',type=int,default=8000);parser.add_argument('--config',default=str(ROOT/'config/business.json'));parser.add_argument('--db');parser.add_argument('--file');parser.add_argument('--source');args=parser.parse_args()
    config_path=Path(args.config);config=json.loads((config_path if config_path.exists() else ROOT/'config/business.example.json').read_text(encoding='utf-8'))
    if args.sandbox:config['mode']='sandbox';config['documents_approved']=False;config['reservation_amount_rub']=None;config['max_feed_age_seconds']=86400
    db_path=args.db or str(ROOT/'runtime'/('sandbox.sqlite3' if args.sandbox else 'tegroup.sqlite3'));app=Application(db_path,config)
    if args.command=='sync':sources.sync(app.store);print(json.dumps(app.store.catalog()['sources'],ensure_ascii=False,indent=2));return
    if args.command=='import':
        if not args.file or not args.source:parser.error('import требует --file и --source')
        records=json.loads(Path(args.file).read_text(encoding='utf-8'));print('Импортировано:',app.store.upsert(args.source,records,True));return
    if args.command=='create-manager':
        email=input('Email сотрудника: ').strip().lower();name=input('Имя сотрудника: ');password=getpass.getpass('Пароль (от 12 символов): ')
        if len(password)<12:parser.error('Пароль слишком короткий')
        with app.store.connection() as db:db.execute('INSERT INTO users(id,email,name,password,role,created) VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,email,name,password_hash(password),'manager',timestamp()))
        print('Сотрудник создан.');return
    if not args.sandbox:
        with app.store.connection() as db:empty=not db.execute('SELECT 1 FROM offers LIMIT 1').fetchone()
        snapshot_path=ROOT/'config/catalog.snapshot.json'
        if empty and snapshot_path.exists():
            for source,snapshot in json.loads(snapshot_path.read_text(encoding='utf-8')).items():
                app.store.upsert(source,snapshot['offers'])
                with app.store.connection() as db:
                    db.execute('UPDATE offers SET updated=? WHERE source=?',(snapshot['captured_at'],source))
                    db.execute("UPDATE source_runs SET status='snapshot',message='Начальная выгрузка; ожидается синхронизация',attempted=?,succeeded=? WHERE source=?",(snapshot['captured_at'],snapshot['captured_at'],source))
    if args.sandbox:
        with app.store.connection() as db:exists=db.execute('SELECT 1 FROM offers LIMIT 1').fetchone()
        if not exists:sandbox(app.store)
    server=create_server(app,port=args.port)
    if not args.sandbox:
        def worker():
            while True:sources.sync(app.store);time.sleep(max(900,config.get('sync_interval_seconds',900)))
        threading.Thread(target=worker,daemon=True).start()
    print('TE GROUP:',app.origin,'Режим:',config.get('mode','local'));print('Для локального тестирования используйте вымышленные контактные данные. Ctrl+C — остановить.')
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
