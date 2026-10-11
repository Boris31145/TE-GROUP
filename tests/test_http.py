import http.cookiejar, json, tempfile, threading, unittest, urllib.error, urllib.request
from pathlib import Path
from backend.server import Application, create_server, sandbox

class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.app=Application(Path(self.temp.name)/'db.sqlite',{'mode':'sandbox','max_feed_age_seconds':86400});sandbox(self.app.store);self.server=create_server(self.app,port=0);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base=self.app.origin;self.client=self.new_client();self.csrf=self.request('/api/session')[1]['csrf']
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def new_client(self):return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(self,path,body=None,csrf=True,client=None):
        headers={};raw=None
        if body is not None:
            raw=json.dumps(body).encode();headers={'Content-Type':'application/json','Origin':self.base}
            if csrf:headers['X-CSRF-Token']=self.csrf
        req=urllib.request.Request(self.base+path,data=raw,headers=headers)
        try:r=(client or self.client).open(req)
        except urllib.error.HTTPError as e:r=e
        data=r.read();kind=r.headers.get_content_type();return r.status,json.loads(data) if kind=='application/json' else data.decode(errors='replace'),r.headers
    def register(self):
        status,d,h=self.request('/api/register',{'email':'client@example.test','name':'Test Client','password':'a-secure-test-password','consent':True,'legal_version':'2026-10-10.legal.3'});self.assertEqual(status,200);self.csrf=d['csrf']
        with self.app.store.connection() as db:
            document=db.execute('SELECT content FROM legal_documents').fetchone()[0];self.assertIn('Заявление о создании кабинета',document)
        return h
    def test_csrf_blocks_registration(self):
        self.assertEqual(self.request('/api/register',{'email':'x@example.test'},csrf=False)[0],403)
    def test_direction_navigation_stays_inside_site(self):
        import re
        for path in ['/goods/','/china-import/','/turkey-import/','/uae-import/','/israel-import/','/customs-clearance/','/cars/']:
            status,html,_=self.request(path);self.assertEqual(status,200)
            switch=re.search(r'<(?:nav|div)[^>]*class="(?:direction-switch|tg-directions-inner)"[^>]*>(.*?)</(?:nav|div)>',html,re.S)
            self.assertIsNotNone(switch,path)
            links=re.findall(r'<a\b[^>]*href="([^"]+)"',switch.group(1))
            self.assertEqual(links,['/goods/','/cars/'],path)
            for link in links:self.assertEqual(self.request(link)[0],200)
            self.assertRegex(html,r'<a href="/" class="logo-wrap"|<a class="brand" href="/"')
        _,entry,_=self.request('/')
        self.assertLess(entry.index('entry-goods'),entry.index('entry-cars'))
    def test_session_cookie_and_static_private_files(self):
        h=self.register();self.assertIn('HttpOnly',h['Set-Cookie']);self.assertIn('SameSite=Lax',h['Set-Cookie'])
        for p in ['/backend/server.py','/config/business.example.json','/runtime/tegroup.sqlite3','/PUSH-SITE.bat','/../config/business.example.json']:
            self.assertEqual(self.request(p)[0],404)
        for p in ['/','/goods/','/cars/','/assets/js/auto.js','/legal/consent/']:
            self.assertEqual(self.request(p)[0],200)
    def test_booking_and_invoice_require_owner(self):
        self.register();offer=self.request('/api/catalog')[1]['offers'][0];data={'offer_id':offer['id'],'version':offer['version'],'idempotency':'booking-http-key-001'}
        self.assertEqual(self.request('/api/reserve',data)[0],400);data['terms_version']='2026-10-10.legal.3';status,b,_=self.request('/api/reserve',data);self.assertEqual(status,201)
        path='/api/bookings/'+b['id']+'/invoice';status,body,h=self.request(path);self.assertEqual(status,200);self.assertIn('Черновик',body);self.assertEqual(h['Cache-Control'],'no-store')
        self.assertEqual(self.request(path,client=self.new_client())[0],401)
        self.assertEqual(self.request('/api/operations')[0],403)
    def test_selection_is_private_and_does_not_create_payment_documents(self):
        self.register();offer=self.request('/api/catalog')[1]['offers'][0]
        with self.app.store.connection() as db:db.execute('UPDATE offers SET quote=NULL,quote_expires=NULL,supplier_reference=NULL WHERE id=?',(offer['id'],))
        fields={'offer_id':offer['id'],'version':offer['version'],'phone':'+7 999 000-00-00','city':'Москва','confirmed':True,'request_version':'2026-10-10.selection.1','idempotency':'selection-http-key-001'}
        status,r,_=self.request('/api/inquiries',fields);self.assertEqual(status,201);self.assertEqual(r['status'],'pending')
        self.assertEqual(len(self.request('/api/inquiries')[1]['inquiries']),1)
        self.assertEqual(self.request('/api/inquiries',client=self.new_client())[0],401)
        self.assertEqual(self.request('/api/inquiries/'+r['id'],{'action':'proposal','reply':'Unverified supplier availability'})[0],403)
        self.assertEqual(len(self.request('/api/bookings')[1]['bookings']),0)
        with self.app.store.connection() as db:self.assertEqual(db.execute('SELECT count(*) FROM invoices').fetchone()[0],0)
        self.assertEqual(self.request('/api/inquiries/'+r['id'],{'action':'cancel'})[1]['status'],'cancelled')
    def test_production_refuses_incomplete_configuration(self):
        app=Application(Path(self.temp.name)/'other.sqlite',{'mode':'production','origin':'https://example.test'})
        from backend.domain import Problem
        with self.assertRaises(Problem):app.validate_production()
    def test_buyer_contract_workflow_is_private_and_requires_separate_consent(self):
        self.register();session=self.request('/api/session')[1];offer=self.request('/api/catalog')[1]['offers'][0]
        _,b,_=self.request('/api/reserve',{'offer_id':offer['id'],'version':offer['version'],'idempotency':'buyer-http-key-0001','terms_version':session['legal_version']})
        path='/api/bookings/'+b['id']+'/prepare_contract';data={'full_name':'Test Legal Buyer','phone':'+7 999 000-00-00','destination_confirmed':True,'consent':False,'consent_version':session['contract_consent_version'],'revision':0}
        self.assertEqual(self.request('/legal/contract-consent/')[0],200)
        self.assertEqual(self.request(path,data)[0],400);data['consent']=True
        self.assertEqual(self.request(path,data,csrf=False)[0],403)
        status,prepared,_=self.request(path,data);self.assertEqual(status,200);self.assertEqual(prepared['status'],'contract_review')
        self.assertEqual(prepared['preparation']['buyer']['phone'],'+79990000000')
        self.assertEqual(prepared['snapshot']['delivery']['minimum_months'],2)
        status,body,headers=self.request('/api/bookings/'+b['id']+'/contract');self.assertEqual(status,200);self.assertIn('Test Legal Buyer',body);self.assertIn('Экспортные документы',body);self.assertEqual(headers['Cache-Control'],'no-store')
        self.assertIn('от двух месяцев',body)
        self.assertNotIn('Покупатель: Test Client.',body)
        status,invoice_body,_=self.request('/api/bookings/'+b['id']+'/invoice');self.assertEqual(status,200)
        self.assertIn('Покупатель: Test Legal Buyer',invoice_body);self.assertIn(prepared['snapshot']['quote']['vin'],invoice_body)
        self.assertEqual(self.request('/api/bookings/'+b['id']+'/review_document',{'kind':'supplier','status':'verified','reference':'fake','revision':0})[0],403)
        self.assertEqual(self.request(path,data)[0],409)
        exported=self.request('/api/account/export')[1];self.assertTrue(any(c['version']==session['contract_consent_version'] for c in exported['consents']))
if __name__=='__main__':unittest.main()
