"""Persistent accounts, quotes and exclusive internal reservations. Standard library only."""
import contextlib, re, hashlib, hmac, json, secrets, sqlite3, time, uuid
from pathlib import Path

COUNTRIES = ('US', 'KR', 'CN')
LEGAL_VERSION = '2026-10-10.legal.3'
CONTRACT_CONSENT_VERSION = '2026-10-10.contract-request.2'
INQUIRY_VERSION = '2026-10-10.selection.1'
INQUIRY_TEXT = 'Прошу TE GROUP связаться с продавцом выбранного автомобиля и подготовить предложение с ценой компании и доставкой. Заявка не является бронью у продавца, договором или поручением на оплату. Правила обработки необходимых данных указаны в единой политике.'
# Legacy API fields and SQL table named consent retain old proofs. New versions
# record explicit service requests on contractual grounds, not blanket PD consent.
DOCUMENT_KINDS = {'supplier':'Подтверждение продавца', 'inspection':'Осмотр и состояние автомобиля', 'export':'Экспортные документы'}
ACTIVE = ('reserved', 'contract_review', 'contract_accepted', 'paid')
class Problem(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status

def timestamp(): return int(time.time())
def token_hash(value): return hashlib.sha256(value.encode()).hexdigest()
def password_hash(value, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(value.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
def password_ok(value, stored): return hmac.compare_digest(password_hash(value, stored.split(':')[0]), stored)

class Store:
    def __init__(self, path, config=None):
        self.path = str(path); self.config = config or {}
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',created INTEGER NOT NULL,withdrawn INTEGER);
            CREATE TABLE IF NOT EXISTS legal_documents(hash TEXT PRIMARY KEY,version TEXT NOT NULL,content TEXT NOT NULL,created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS consent(user_id TEXT NOT NULL,version TEXT NOT NULL,document_hash TEXT NOT NULL,accepted INTEGER NOT NULL,revoked INTEGER);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS offers(id TEXT PRIMARY KEY,country TEXT NOT NULL CHECK(country IN ('US','KR','CN')),source TEXT NOT NULL,data TEXT NOT NULL,updated INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,quote TEXT,quote_expires INTEGER,supplier_reference TEXT);
            CREATE TABLE IF NOT EXISTS source_runs(source TEXT PRIMARY KEY,status TEXT NOT NULL,message TEXT NOT NULL,attempted INTEGER NOT NULL,succeeded INTEGER);
            CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,offer_id TEXT NOT NULL,vehicle_key TEXT,status TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,snapshot TEXT NOT NULL,idempotency TEXT NOT NULL,UNIQUE(user_id,idempotency));
            CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking ON bookings(offer_id) WHERE status IN ('reserved','contract_review','contract_accepted','paid');
            CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,booking_id TEXT UNIQUE NOT NULL,amount INTEGER,issuer TEXT NOT NULL,status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,booking_id TEXT,actor TEXT,kind TEXT NOT NULL,created INTEGER NOT NULL,data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS privacy_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
            CREATE TABLE IF NOT EXISTS inquiries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,offer_id TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,snapshot TEXT NOT NULL,contact TEXT NOT NULL,request_version TEXT NOT NULL,request_hash TEXT NOT NULL,idempotency TEXT NOT NULL,reply TEXT,quote_version INTEGER,UNIQUE(user_id,idempotency));
            CREATE UNIQUE INDEX IF NOT EXISTS one_open_inquiry ON inquiries(user_id,offer_id) WHERE status IN ('pending','proposal');
            CREATE TABLE IF NOT EXISTS booking_preparations(booking_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,buyer TEXT NOT NULL,created INTEGER NOT NULL,consent_hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS booking_documents(booking_id TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,reference TEXT NOT NULL,note TEXT NOT NULL,revision INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(booking_id,kind));
            ''')
            columns={r[1] for r in db.execute('PRAGMA table_info(bookings)')}
            if 'vehicle_key' not in columns:db.execute('ALTER TABLE bookings ADD COLUMN vehicle_key TEXT')
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_active_vehicle ON bookings(vehicle_key) WHERE status IN ('reserved','contract_review','contract_accepted','paid')")
    @contextlib.contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=15); db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try: yield db; db.commit()
        except BaseException: db.rollback(); raise
        finally: db.close()
    def event(self, db, booking, actor, kind, data=None):
        db.execute('INSERT INTO events(booking_id,actor,kind,created,data) VALUES(?,?,?,?,?)',(booking,actor,kind,timestamp(),json.dumps(data or {},ensure_ascii=False)))
    def register(self, email, name, password, consent, version, document_hash, document_content=None):
        import re
        email = email.strip().lower(); name = name.strip()
        if not consent or version != LEGAL_VERSION: raise Problem('Подтвердите заявление о создании кабинета актуальной редакции.')
        if not re.fullmatch(r'[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]{2,30}', email) or not 2 <= len(name) <= 120: raise Problem('Проверьте имя и email.')
        if not isinstance(password,str) or not 12 <= len(password) <= 128: raise Problem('Пароль должен содержать от 12 до 128 символов.')
        uid = uuid.uuid4().hex
        hashed = password_hash(password)
        try:
            with self.connection() as db:
                db.execute('INSERT INTO users(id,email,name,password,created) VALUES(?,?,?,?,?)',(uid,email,name,hashed,timestamp()))
                if document_content is not None:
                    if hashlib.sha256(document_content.encode()).hexdigest()!=document_hash:raise Problem('Некорректная редакция согласия.')
                    db.execute('INSERT OR IGNORE INTO legal_documents VALUES(?,?,?,?)',(document_hash,version,document_content,timestamp()))
                db.execute('INSERT INTO consent(user_id,version,document_hash,accepted) VALUES(?,?,?,?)',(uid,version,document_hash,timestamp()))
        except sqlite3.IntegrityError: raise Problem('Учетная запись уже существует. Войдите в кабинет.',409)
        return uid
    def login(self, email, password):
        with self.connection() as db: row = db.execute('SELECT * FROM users WHERE email=?',(email.strip().lower(),)).fetchone()
        # Do comparable work for unknown accounts.
        stored = row['password'] if row else password_hash('constant-dummy-password', '0'*32)
        if not password_ok(password,stored) or not row: raise Problem('Неверный email или пароль.',401)
        return self.session(row['id'])
    def session(self, uid):
        token = secrets.token_urlsafe(32); csrf = secrets.token_urlsafe(32)
        with self.connection() as db:
            db.execute('DELETE FROM sessions WHERE expires<?',(timestamp(),))
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(token_hash(token),uid,csrf,timestamp()+86400))
        return token, csrf
    def auth(self, token):
        with self.connection() as db:
            row = db.execute('SELECT u.id,u.email,u.name,u.role,u.withdrawn,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',(token_hash(token or ''),timestamp())).fetchone()
        if not row: raise Problem('Войдите в кабинет.',401)
        return dict(row)
    def logout(self, token):
        with self.connection() as db: db.execute('DELETE FROM sessions WHERE token=?',(token_hash(token or ''),))
    def upsert(self, source, records, authoritative=False):
        """Only a successful complete feed may retire vanished offers."""
        valid = []
        for x in records:
            if x.get('country') not in COUNTRIES: continue
            if x.get('source') != source or not x.get('source_id') or not x.get('title'): raise Problem('Некорректная выгрузка источника.')
            if x.get('price_kind') not in ('source_estimate','fixed_purchase','auction_bid'): raise Problem('Не задан тип цены.')
            price = x.get('source_price_rub')
            if price is not None and (type(price) is not int or price <= 0): raise Problem('Некорректная цена.')
            expiry=x.get('source_expires_at')
            if expiry is not None and (type(expiry) is not int or expiry<=0):raise Problem('Некорректный срок лота.')
            valid.append(x)
        if not valid: raise Problem('Источник не вернул распознаваемых предложений. Предыдущая выгрузка сохранена.',502)
        now = timestamp()
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            seen=set()
            for x in valid:
                oid = source + ':' + x['source_id'];seen.add(oid); data = json.dumps(x,ensure_ascii=False,sort_keys=True)
                old = db.execute('SELECT * FROM offers WHERE id=?',(oid,)).fetchone()
                # Any change requires a new commercial quote; never mutate a booked snapshot.
                if old:
                    previous=json.loads(old['data'])
                    critical=('country','title','year','mileage_km','fuel','engine_cc','power_hp','transmission','source_price_rub','source_price','source_currency','price_kind','price_basis','vin','damage','title_status','inspection_note','repair_note','source_expires_at','intake_only')
                    changed=not old['active'] or any(previous.get(k)!=x.get(k) for k in critical)
                    db.execute('UPDATE offers SET data=?,updated=?,active=1,version=version+?,quote=CASE WHEN ? THEN NULL ELSE quote END,quote_expires=CASE WHEN ? THEN NULL ELSE quote_expires END,supplier_reference=CASE WHEN ? THEN NULL ELSE supplier_reference END WHERE id=?',(data,now,int(changed),changed,changed,changed,oid))
                else: db.execute('INSERT INTO offers(id,country,source,data,updated) VALUES(?,?,?,?,?)',(oid,x['country'],source,data,now))
            if authoritative:
                existing=db.execute('SELECT id FROM offers WHERE source=?',(source,)).fetchall()
                db.executemany('UPDATE offers SET active=0,quote=NULL,quote_expires=NULL,supplier_reference=NULL WHERE id=?',[(r['id'],) for r in existing if r['id'] not in seen])
            db.execute('INSERT INTO source_runs VALUES(?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET status=excluded.status,message=excluded.message,attempted=excluded.attempted,succeeded=excluded.succeeded',(source,'ok',f'Получено: {len(valid)}',now,now))
        return len(valid)
    def source_error(self, source, message):
        with self.connection() as db: db.execute('INSERT INTO source_runs VALUES(?,?,?,?,NULL) ON CONFLICT(source) DO UPDATE SET status=excluded.status,message=excluded.message,attempted=excluded.attempted',(source,'unavailable',message[:300],timestamp()))
    def public_offer(self, row):
        d = json.loads(row['data']); q = json.loads(row['quote']) if row['quote'] else None
        stale = timestamp()-row['updated'] > self.config.get('max_feed_age_seconds',1800)
        source_expired=bool(d.get('source_expires_at') and d['source_expires_at']<=timestamp())
        verified = bool(q and row['quote_expires'] and row['quote_expires'] > timestamp() and row['supplier_reference'] and not stale and not source_expired and row['active'])
        vehicle_key='VIN:'+q['vin'] if q and q.get('vin') else row['id']
        with self.connection() as db: held = db.execute("SELECT 1 FROM bookings WHERE (offer_id=? OR vehicle_key=?) AND status IN ('reserved','contract_review','contract_accepted','paid') AND (expires>? OR status='paid')",(row['id'],vehicle_key,timestamp())).fetchone()
        return {**d,'id':row['id'],'version':row['version'],'updated_at':row['updated'],'stale':stale,'source_expired':source_expired,'quote':q,'quote_expires':row['quote_expires'],'bookable':verified and not held,'availability':'reserved' if held else ('confirmed' if verified else 'unconfirmed')}
    def catalog(self):
        with self.connection() as db:
            rows = db.execute('SELECT * FROM offers WHERE active=1').fetchall(); sources = [dict(r) for r in db.execute('SELECT * FROM source_runs')]
        offers = [self.public_offer(r) for r in rows if self.config.get('mode')!='production' or r['source']!='sandbox']
        dedup={}
        for o in sorted(offers,key=lambda x:(not x['bookable'],x['stale'],x['source']!='westmotors',-x['updated_at'])):
            key='VIN:'+o['quote']['vin'] if o['quote'] and o['quote'].get('vin') else o['id']
            dedup.setdefault(key,o)
        offers=list(dedup.values())
        result=[]; mix={}
        for country in COUNTRIES:
            candidates=[o for o in offers if o['country']==country and (o['quote']['total_rub'] if o['quote'] else o.get('source_price_rub') or 0) <= 6000000]
            def amount(o): return o['quote']['total_rub'] if o['quote'] else o.get('source_price_rub') or 0
            candidates=[o for o in candidates if amount(o)>0 and o['price_kind']!='auction_bid']
            # Target 9: 5 under 3m, 2 middle, 2 upper. Do not manufacture missing cars.
            buckets=[[o for o in candidates if lo < amount(o) <= hi] for lo,hi in [(0,3000000),(3000000,4500000),(4500000,6000000)]]
            selected=[]
            for bucket,count in zip(buckets,[5,2,2]): selected += sorted(bucket,key=lambda o:(not o['bookable'],o['stale'],-o['updated_at'],-(o.get('year') or 0),amount(o),o['id']))[:count]
            # Fixed USD lots are visible for selection, never presented as a RUB budget.
            unpriced=[o for o in offers if o['country']==country and o.get('source_currency')=='USD' and o.get('price_kind')=='fixed_purchase' and not o.get('quote') and not o.get('source_price_rub') and not o['source_expired']]
            selected+=sorted(unpriced,key=lambda o:(o['stale'],o.get('source_price') or 0,o['id']))[:max(0,9-len(selected))]
            mix[country]={'available':len(selected),'target':9,'cheap':sum(0<amount(o)<=3000000 for o in selected),'target_cheap':5,'mid':sum(3000000<amount(o)<=4500000 for o in selected),'upper':sum(amount(o)>4500000 for o in selected)}
            result+=selected
        return {'offers':result,'sources':sources,'mix':mix,'mode':self.config.get('mode','local'),'generated_at':timestamp(),'poll_seconds':30}
    def inquire(self, actor, data):
        if actor.get('withdrawn'):raise Problem('Кабинет ограничен. Новые заявки недоступны.',403)
        if data.get('request_version')!=INQUIRY_VERSION or data.get('confirmed') is not True:raise Problem('Подтвердите запрос подготовки предложения.')
        phone=str(data.get('phone','')).strip();digits=re.sub(r'\D','',phone);city=str(data.get('city','')).strip()
        if not re.fullmatch(r'\+?[0-9 ()-]{10,24}',phone) or not 10<=len(digits)<=15:raise Problem('Проверьте телефон с кодом страны.')
        if not 2<=len(city)<=120 or re.search(r'[\x00-\x1f]',city):raise Problem('Укажите город доставки.')
        key=data.get('idempotency');oid=data.get('offer_id')
        if not isinstance(key,str) or not 16<=len(key)<=100:raise Problem('Некорректный ключ заявки.')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT * FROM inquiries WHERE user_id=? AND idempotency=?',(actor['id'],key)).fetchone()
            if old:
                if old['offer_id']!=oid:raise Problem('Ключ заявки уже использован.',409)
                return self.public_inquiry(old,actor)
            row=db.execute('SELECT * FROM offers WHERE id=? AND active=1',(oid,)).fetchone()
            if not row or row['version']!=data.get('version'):raise Problem('Предложение изменилось. Откройте актуальную карточку.',409)
            offer=self.public_offer(row)
            if offer['source_expired'] or offer['availability']=='reserved':raise Problem('Этот автомобиль сейчас недоступен для выбора.',409)
            old=db.execute("SELECT * FROM inquiries WHERE user_id=? AND offer_id=? AND status IN ('pending','proposal')",(actor['id'],oid)).fetchone()
            if old:return self.public_inquiry(old,actor)
            if db.execute("SELECT count(*) FROM inquiries WHERE user_id=? AND status IN ('pending','proposal')",(actor['id'],)).fetchone()[0]>=20:raise Problem('Сначала завершите текущие заявки.',409)
            iid=uuid.uuid4().hex;digest=token_hash(INQUIRY_TEXT)
            db.execute('INSERT OR IGNORE INTO legal_documents VALUES(?,?,?,?)',(digest,INQUIRY_VERSION,INQUIRY_TEXT,timestamp()))
            db.execute('INSERT INTO inquiries(id,user_id,offer_id,status,created,snapshot,contact,request_version,request_hash,idempotency) VALUES(?,?,?,?,?,?,?,?,?,?)',(iid,actor['id'],oid,'pending',timestamp(),json.dumps(offer,ensure_ascii=False),json.dumps({'phone':'+'+digits,'city':city},ensure_ascii=False),INQUIRY_VERSION,digest,key))
            self.event(db,None,actor['id'],'vehicle_selected',{'inquiry_id':iid,'offer_id':oid,'request_hash':digest})
            saved=db.execute('SELECT * FROM inquiries WHERE id=?',(iid,)).fetchone()
        return self.public_inquiry(saved,actor)
    def public_inquiry(self, row, actor):
        d=dict(row);d['snapshot']=json.loads(d['snapshot']);d['contact']=json.loads(d['contact']);d.pop('idempotency',None)
        with self.connection() as db:
            current=db.execute('SELECT * FROM offers WHERE id=? AND active=1',(d['offer_id'],)).fetchone()
            customer=db.execute('SELECT name,email FROM users WHERE id=?',(d['user_id'],)).fetchone()
        current=self.public_offer(current) if current else None
        d['offer']=current;d['proposal_current']=bool(d['status']=='proposal' and current and current['bookable'] and current['version']==d['quote_version'])
        if actor.get('role')=='manager':d['customer']=dict(customer) if customer else None
        return d
    def inquiries(self, actor):
        with self.connection() as db:
            rows=db.execute('SELECT * FROM inquiries'+('' if actor['role']=='manager' else ' WHERE user_id=?')+' ORDER BY created DESC',() if actor['role']=='manager' else (actor['id'],)).fetchall()
        return [self.public_inquiry(r,actor) for r in rows]
    def inquiry_action(self, actor, iid, data):
        action=data.get('action')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT * FROM inquiries WHERE id=?',(iid,)).fetchone()
            if not row or (actor['role']!='manager' and row['user_id']!=actor['id']):raise Problem('Заявка не найдена.',404)
            if row['status'] not in ('pending','proposal'):raise Problem('Заявка уже закрыта.',409)
            if action=='cancel':status='cancelled';note='Заявка отменена';version=None
            else:
                if actor['role']!='manager':raise Problem('Недостаточно прав.',403)
                if action not in ('proposal','unavailable'):raise Problem('Неизвестное действие.')
                note=str(data.get('reply','')).strip()
                if not 5<=len(note)<=1000:raise Problem('Укажите результат связи с продавцом и условия предложения.')
                version=None
                if action=='proposal':
                    current=db.execute('SELECT * FROM offers WHERE id=? AND active=1',(row['offer_id'],)).fetchone()
                    if not current or not self.public_offer(current)['bookable'] or data.get('version')!=current['version']:raise Problem('Сначала подтвердите актуальную смету и наличие у продавца.',409)
                    version=current['version']
                status=action
            db.execute('UPDATE inquiries SET status=?,reply=?,quote_version=? WHERE id=?',(status,note,version,iid));self.event(db,None,actor['id'],'inquiry_'+status,{'inquiry_id':iid,'quote_version':version,'reply':note})
            saved=db.execute('SELECT * FROM inquiries WHERE id=?',(iid,)).fetchone()
        return self.public_inquiry(saved,actor)
    def quote(self, oid, actor, q, supplier_reference, version):
        if actor['role']!='manager': raise Problem('Недостаточно прав.',403)
        if not isinstance(q,dict):raise Problem('Смета должна быть объектом.')
        vin=str(q.get('vin','')).strip().upper()
        if not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',vin):raise Problem('Укажите VIN конкретного автомобиля: 17 допустимых символов.')
        repair_provided='repair_rub' in q
        q={**q,'repair_rub':q.get('repair_rub',0)}
        keys=('vehicle_rub','delivery_rub','company_fee_rub','buyer_costs_rub','repair_rub')
        if any(type(q.get(k)) is not int or q[k]<0 for k in keys): raise Problem('Компоненты сметы должны быть целыми неотрицательными суммами в рублях.')
        if not q.get('destination') or not q.get('terms') or not supplier_reference.strip(): raise Problem('Нужны пункт доставки, условия и подтверждение доступности продавцом.')
        q={k:q[k] for k in keys}|{'vin':vin,'destination':str(q['destination'])[:200],'terms':str(q['terms'])[:3000],'inspection_reference':str(q.get('inspection_reference',''))[:300],'export_document_reference':str(q.get('export_document_reference',''))[:300]}
        q['company_rub']=q['vehicle_rub']+q['delivery_rub']+q['company_fee_rub'];q['total_rub']=q['company_rub']+q['buyer_costs_rub']+q['repair_rub']
        if not 0<q['total_rub']<=6000000: raise Problem('Полный бюджет должен быть не выше 6 млн ₽.')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE'); row=db.execute('SELECT * FROM offers WHERE id=?',(oid,)).fetchone()
            if not row or row['version']!=version or not row['active']: raise Problem('Предложение изменилось. Обновите страницу.',409)
            source_data=json.loads(row['data'])
            if source_data.get('source_expires_at') and source_data['source_expires_at']<=timestamp():raise Problem('Срок лота источника истек. Требуется новое подтверждение.',409)
            if source_data.get('vin') and source_data['vin'].upper()!=vin:raise Problem('VIN сметы не совпадает с VIN лота источника.',409)
            if source_data.get('intake_only') and (not repair_provided or not q['inspection_reference'] or not q['export_document_reference']):raise Problem('Для лота США нужны подтверждение осмотра и проверка экспортных документов.',409)
            if timestamp()-row['updated']>self.config.get('max_feed_age_seconds',1800):raise Problem('Выгрузка устарела. Сначала обновите источник.',409)
            self.expire(db)
            if db.execute("SELECT 1 FROM bookings WHERE (offer_id=? OR vehicle_key=?) AND status IN ('reserved','contract_review','contract_accepted','paid')",(oid,'VIN:'+vin)).fetchone(): raise Problem('У автомобиля есть действующая бронь.',409)
            db.execute('UPDATE offers SET quote=?,quote_expires=?,supplier_reference=?,version=version+1 WHERE id=?',(json.dumps(q,ensure_ascii=False),timestamp()+900,supplier_reference[:300],oid))
            self.event(db,None,actor['id'],'quote_confirmed',{'offer_id':oid,'supplier_reference':supplier_reference,'quote':q})
        return q
    def expire(self,db):
        db.execute("UPDATE invoices SET status='void' WHERE booking_id IN (SELECT id FROM bookings WHERE status IN ('reserved','contract_review','contract_accepted') AND expires<=?)",(timestamp(),))
        db.execute("UPDATE bookings SET status='expired' WHERE status IN ('reserved','contract_review','contract_accepted') AND expires<=?",(timestamp(),))
    def reserve(self, actor, oid, version, key):
        if actor.get('withdrawn'): raise Problem('Кабинет ограничен по вашему запросу. Новое бронирование недоступно.',403)
        if not isinstance(key,str) or not 16<=len(key)<=100: raise Problem('Некорректный ключ бронирования.')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE');self.expire(db)
            old=db.execute('SELECT * FROM bookings WHERE user_id=? AND idempotency=?',(actor['id'],key)).fetchone()
            if old:
                if old['offer_id']!=oid: raise Problem('Ключ уже использован для другого автомобиля.',409)
                return dict(old)
            r=db.execute('SELECT * FROM offers WHERE id=? AND active=1',(oid,)).fetchone()
            if not r: raise Problem('Предложение снято с продажи.',409)
            if self.config.get('mode')=='production' and r['source']=='sandbox':raise Problem('Тестовые автомобили недоступны в production.',409)
            if r['version']!=version: raise Problem('Цена изменилась. Ознакомьтесь с новой сметой.',409)
            source_expiry=json.loads(r['data']).get('source_expires_at')
            if source_expiry and source_expiry<=timestamp():raise Problem('Срок лота источника истек. Бронирование недоступно.',409)
            if not r['quote'] or not r['supplier_reference'] or r['quote_expires']<=timestamp() or timestamp()-r['updated']>self.config.get('max_feed_age_seconds',1800): raise Problem('Смета или доступность не подтверждена. Бронирование временно недоступно.',409)
            bid=uuid.uuid4().hex; q=json.loads(r['quote']); deposit=self.config.get('reservation_amount_rub')
            if deposit is not None and (type(deposit) is not int or not 0<deposit<=q['company_rub']): raise Problem('Ошибка настройки суммы бронирования.',503)
            snapshot={'offer':json.loads(r['data']),'quote':q,'version':version,'supplier_reference':r['supplier_reference'],'legal_version':LEGAL_VERSION,'customer':{'name':actor['name'],'email':actor['email']},'delivery':{'minimum_months':2,'note':'Срок поставки — от двух месяцев. Точный срок и начало его отсчета согласуются в договоре.'}}
            try: db.execute('INSERT INTO bookings(id,user_id,offer_id,vehicle_key,status,created,expires,snapshot,idempotency) VALUES(?,?,?,?,?,?,?,?,?)',(bid,actor['id'],oid,'VIN:'+q['vin'],'reserved',timestamp(),timestamp()+self.config.get('reservation_seconds',3600),json.dumps(snapshot,ensure_ascii=False),key))
            except sqlite3.IntegrityError: raise Problem('Этот автомобиль уже забронирован.',409)
            db.execute("UPDATE inquiries SET status='booked' WHERE user_id=? AND offer_id=? AND status IN ('pending','proposal')",(actor['id'],oid))
            issuer=self.config.get('issuer',{})
            db.execute('INSERT INTO invoices(booking_id,amount,issuer,status) VALUES(?,?,?,?)',(bid,deposit,json.dumps(issuer,ensure_ascii=False),'draft'))
            self.event(db,bid,actor['id'],'reserved',{'version':version})
            return dict(db.execute('SELECT * FROM bookings WHERE id=?',(bid,)).fetchone())
    def bookings(self,actor):
        with self.connection() as db:
            self.expire(db)
            sql='SELECT b.*,i.id invoice_id,i.amount invoice_amount,i.status invoice_status FROM bookings b LEFT JOIN invoices i ON i.booking_id=b.id'
            rows=db.execute(sql+('' if actor['role']=='manager' else ' WHERE b.user_id=?'),() if actor['role']=='manager' else (actor['id'],)).fetchall()
            result=[]
            for r in rows:
                b=dict(r)|{'snapshot':json.loads(r['snapshot'])}
                b['preparation']=self.preparation(db,b)
                result.append(b)
        return result
    def preparation(self,db,b):
        row=db.execute('SELECT * FROM booking_preparations WHERE booking_id=?',(b['id'],)).fetchone()
        records={r['kind']:dict(r) for r in db.execute('SELECT * FROM booking_documents WHERE booking_id=?',(b['id'],))}
        q=b['snapshot']['quote']; documents=[]
        defaults={'supplier':b['snapshot'].get('supplier_reference',''),'inspection':q.get('inspection_reference',''),'export':q.get('export_document_reference','')}
        for kind,label in DOCUMENT_KINDS.items():
            d=records.get(kind,{'kind':kind,'status':'received' if defaults[kind] else 'missing','reference':defaults[kind],'note':'','revision':0,'updated':None})
            documents.append(d|{'label':label})
        blockers=([] if row else ['Покупатель не передал данные для договора'])+[d['label']+': требуется проверка сотрудника' for d in documents if d['status']!='verified']
        returned=db.execute("SELECT data FROM events WHERE booking_id=? AND kind='return_details' ORDER BY id DESC LIMIT 1",(b['id'],)).fetchone()
        return {'buyer':json.loads(row['buyer']) if row else None,'revision':row['revision'] if row else 0,'submitted_at':row['created'] if row else None,'documents':documents,'blockers':blockers,'ready':not blockers,'return_note':json.loads(returned[0]).get('reference') if returned else None}
    def prepare_contract(self,actor,bid,data,document):
        # Buyer data is separate from the immutable price snapshot. One transaction submits both.
        b=self.booking(actor,bid)
        if b['user_id']!=actor['id']:raise Problem('Данные передает сам покупатель.',403)
        if set(data)-{'full_name','phone','destination_confirmed','consent','consent_version','revision'}:raise Problem('Форма содержит неподдерживаемые поля.')
        if data.get('consent') is not True or data.get('consent_version')!=CONTRACT_CONSENT_VERSION:raise Problem('Подтвердите запрос подготовки договора актуальной редакции.')
        if data.get('destination_confirmed') is not True:raise Problem('Подтвердите пункт доставки из зафиксированной сметы.')
        if not isinstance(data.get('full_name'),str) or not isinstance(data.get('phone'),str):raise Problem('Проверьте ФИО и телефон.')
        name=data['full_name'].strip(); raw_phone=data['phone'].strip()
        if not 5<=len(name)<=160 or len(name.split())<2 or any(ord(c)<32 for c in name):raise Problem('Укажите фамилию и имя; отчество — при наличии.')
        if not re.fullmatch(r'\+?[0-9 ()-]{10,24}',raw_phone):raise Problem('Проверьте номер телефона, включая код страны.')
        digits=re.sub(r'\D','',raw_phone)
        if not 10<=len(digits)<=15:raise Problem('Проверьте номер телефона, включая код страны.')
        digest=hashlib.sha256(document.encode()).hexdigest(); now=timestamp()
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE');self.expire(db)
            current=db.execute('SELECT * FROM bookings WHERE id=?',(bid,)).fetchone()
            withdrawn=db.execute('SELECT withdrawn FROM users WHERE id=?',(actor['id'],)).fetchone()[0]
            if withdrawn:raise Problem('Кабинет ограничен по вашему запросу. Передача новых данных недоступна.',403)
            if current['status']!='reserved':raise Problem('Изменение данных сейчас недоступно. Обновите кабинет.',409)
            old=db.execute('SELECT revision FROM booking_preparations WHERE booking_id=?',(bid,)).fetchone(); revision=old[0] if old else 0
            if type(data.get('revision')) is not int or data['revision']!=revision:raise Problem('Данные изменились. Обновите кабинет.',409)
            buyer={'full_name':name,'phone':'+'+digits,'email':actor['email'],'destination':b['snapshot']['quote']['destination']}
            db.execute('INSERT INTO booking_preparations VALUES(?,?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET revision=excluded.revision,buyer=excluded.buyer,created=excluded.created,consent_hash=excluded.consent_hash',(bid,revision+1,json.dumps(buyer,ensure_ascii=False),now,digest))
            db.execute('INSERT OR IGNORE INTO legal_documents VALUES(?,?,?,?)',(digest,CONTRACT_CONSENT_VERSION,document,now))
            db.execute('INSERT INTO consent(user_id,version,document_hash,accepted) VALUES(?,?,?,?)',(actor['id'],CONTRACT_CONSENT_VERSION,digest,now))
            db.execute("UPDATE bookings SET status='contract_review' WHERE id=?",(bid,))
            self.event(db,bid,actor['id'],'contract_prepared',{'revision':revision+1,'consent_hash':digest})
        return self.booking(actor,bid)
    def document_review(self,actor,bid,data):
        if actor['role']!='manager':raise Problem('Недостаточно прав.',403)
        self.booking(actor,bid)
        kind=data.get('kind');status=data.get('status')
        if not isinstance(data.get('reference',''),str) or not isinstance(data.get('note',''),str):raise Problem('Подтверждение и результат проверки должны быть текстом.')
        reference=data.get('reference','').strip();note=data.get('note','').strip()
        if kind not in DOCUMENT_KINDS or status not in ('missing','received','verified','rejected'):raise Problem('Некорректное состояние документа.')
        if len(reference)>300 or len(note)>1000 or (status in ('received','verified') and not reference) or (status=='rejected' and not note):raise Problem('Укажите подтверждение документа или причину отказа.')
        if type(data.get('revision')) is not int:raise Problem('Нужна актуальная версия документа.')
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE');self.expire(db)
            if db.execute('SELECT status FROM bookings WHERE id=?',(bid,)).fetchone()[0] not in ('reserved','contract_review'):raise Problem('Проверка документов завершена или бронь не действует.',409)
            old=db.execute('SELECT revision FROM booking_documents WHERE booking_id=? AND kind=?',(bid,kind)).fetchone(); revision=old[0] if old else 0
            if data['revision']!=revision:raise Problem('Документ изменился. Обновите кабинет.',409)
            db.execute('INSERT INTO booking_documents VALUES(?,?,?,?,?,?,?) ON CONFLICT(booking_id,kind) DO UPDATE SET status=excluded.status,reference=excluded.reference,note=excluded.note,revision=excluded.revision,updated=excluded.updated',(bid,kind,status,reference,note,revision+1,timestamp()))
            self.event(db,bid,actor['id'],'document_review',{'kind':kind,'status':status,'reference':reference,'note':note,'revision':revision+1})
        return self.booking(actor,bid)
    def booking(self,actor,bid):
        rows=[r for r in self.bookings(actor) if r['id']==bid]
        if not rows: raise Problem('Бронирование не найдено.',404)
        return rows[0]
    def transition(self,actor,bid,action,data=None):
        b=self.booking(actor,bid); data=data or {}
        if action=='review_document':return self.document_review(actor,bid,data)
        if action=='issue_invoice':
            if actor['role']!='manager':raise Problem('Недостаточно прав.',403)
            issuer=self.config.get('issuer',{});amount=self.config.get('reservation_amount_rub')
            if not self.config.get('documents_approved') or type(amount) is not int or not 0<amount<=b['snapshot']['quote']['company_rub'] or not all(issuer.get(k) for k in ('name','tax_id','address','bank','account','bank_code','payment_terms')):raise Problem('Не утверждены сумма аванса, условия платежа или реквизиты.',409)
            with self.connection() as db:
                db.execute('BEGIN IMMEDIATE');self.expire(db)
                current=db.execute('SELECT status FROM bookings WHERE id=?',(bid,)).fetchone()['status']
                if current!='contract_accepted':raise Problem('Платежный счет выпускается после подтверждения подписанного договора.',409)
                changed=db.execute("UPDATE invoices SET amount=?,issuer=?,status='issued' WHERE booking_id=? AND status='draft'",(amount,json.dumps(issuer,ensure_ascii=False),bid)).rowcount
                if not changed:raise Problem('Счет уже выпущен или аннулирован.',409)
                self.event(db,bid,actor['id'],'invoice_issued',{'amount':amount})
            return self.booking(actor,bid)
        transitions={'cancel':('cancelled',ACTIVE[:-1]),'request_contract':('contract_review',('reserved',)),'return_details':('reserved',('contract_review',)),'accept_contract':('contract_accepted',('contract_review',)),'record_payment':('paid',('contract_accepted',))}
        if action not in transitions: raise Problem('Неизвестное действие.')
        if action in ('accept_contract','record_payment','return_details') and actor['role']!='manager': raise Problem('Недостаточно прав.',403)
        if action in ('accept_contract','record_payment','return_details') and (not isinstance(data.get('reference'),str) or not 1<=len(data['reference'].strip())<=300): raise Problem('Нужен номер подтверждения или причина возврата (до 300 символов).')
        new,allowed=transitions[action]
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE'); self.expire(db)
            current=db.execute('SELECT status FROM bookings WHERE id=?',(bid,)).fetchone()['status']
            if current not in allowed: raise Problem('Действие недоступно для текущего статуса.',409)
            if action=='request_contract' and not db.execute('SELECT 1 FROM booking_preparations WHERE booking_id=?',(bid,)).fetchone():raise Problem('Сначала заполните данные для договора.',409)
            if action=='accept_contract' and not self.preparation(db,b)['ready']:raise Problem('Комплект документов не проверен. Завершите проверки перед подтверждением договора.',409)
            if action=='accept_contract' and not self.config.get('documents_approved'):raise Problem('Редакция договора и документы компании еще не утверждены.',409)
            if action=='record_payment' and db.execute('SELECT status FROM invoices WHERE booking_id=?',(bid,)).fetchone()['status']!='issued': raise Problem('Счет еще не выпущен.',409)
            db.execute('UPDATE bookings SET status=? WHERE id=?',(new,bid))
            if action=='cancel':db.execute("UPDATE invoices SET status='void' WHERE booking_id=?",(bid,))
            if action=='record_payment':db.execute("UPDATE invoices SET status='paid' WHERE booking_id=?",(bid,))
            self.event(db,bid,actor['id'],action,{'reference':str(data.get('reference',''))[:300]})
        return self.booking(actor,bid)
    def privacy_request(self,actor,kind):
        if kind not in ('withdraw','delete','export'): raise Problem('Неизвестный запрос.')
        rid=uuid.uuid4().hex
        with self.connection() as db:
            db.execute('INSERT INTO privacy_requests(id,user_id,kind,created) VALUES(?,?,?,?)',(rid,actor['id'],kind,timestamp()))
            if kind in ('withdraw','delete'):
                db.execute('UPDATE users SET withdrawn=? WHERE id=?',(timestamp(),actor['id']))
                db.execute('UPDATE consent SET revoked=? WHERE user_id=? AND revoked IS NULL',(timestamp(),actor['id']))
            self.event(db,None,actor['id'],'privacy_'+kind,{'request_id':rid})
        return {'request_id':rid,'status':'pending'}
