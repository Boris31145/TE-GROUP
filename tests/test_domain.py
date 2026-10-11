import concurrent.futures, json, tempfile, unittest
from pathlib import Path
from backend.domain import Store, Problem, LEGAL_VERSION, CONTRACT_CONSENT_VERSION, timestamp
from backend.server import sandbox
from backend.documents import legal_hash, legal_body, invoice, contract
from backend.sources import parse_pilicar, parse_velauto

class DomainTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.config={'mode':'sandbox','reservation_seconds':3600,'max_feed_age_seconds':1800,'operator':{'name':'Test operator','email':'privacy@example.test'}};self.s=Store(Path(self.temp.name)/'db.sqlite',self.config);sandbox(self.s)
        self.a=self.customer('a@example.test');self.b=self.customer('b@example.test');self.manager={'id':'manager','role':'manager'}
    def tearDown(self):self.temp.cleanup()
    def customer(self,email):
        uid=self.s.register(email,'Test Customer','strong-test-password',True,LEGAL_VERSION,legal_hash(self.config));token,_=self.s.session(uid);return self.s.auth(token)
    def offer(self):return self.s.catalog()['offers'][0]
    def reserve(self,a=None,o=None,key='test-idempotency-0001'):
        o=o or self.offer();return self.s.reserve(a or self.a,o['id'],o['version'],key)
    def prepare(self,b,data=None):
        fields={'full_name':'Test Buyer','phone':'+7 (999) 000-00-00','destination_confirmed':True,'consent':True,'consent_version':CONTRACT_CONSENT_VERSION,'revision':0}|(data or {})
        return self.s.prepare_contract(self.a,b['id'],fields,legal_body('contract-consent',self.config))
    def verify(self,b):
        for kind in ('supplier','inspection','export'):
            self.s.document_review(self.manager,b['id'],{'kind':kind,'status':'verified','reference':'TEST-'+kind,'revision':0})
        self.config['documents_approved']=True
    def test_country_mix_and_price_cap(self):
        c=self.s.catalog();self.assertEqual(len(c['offers']),27)
        for country in ('US','KR','CN'):
            self.assertEqual(c['mix'][country],{'available':9,'target':9,'cheap':5,'target_cheap':5,'mid':2,'upper':2})
        self.assertTrue(all(o['quote']['total_rub']<=6000000 for o in c['offers']))
    def test_changed_vehicle_condition_invalidates_quote(self):
        o=next(x for x in self.s.catalog()['offers'] if x['country']=='US')
        with self.s.connection() as db:
            raw=json.loads(db.execute('SELECT data FROM offers WHERE id=?',(o['id'],)).fetchone()[0])
        raw['damage']='Newly reported structural damage'
        self.s.upsert('sandbox',[raw])
        changed=next(x for x in self.s.catalog()['offers'] if x['id']==o['id'])
        self.assertFalse(changed['bookable']);self.assertIsNone(changed['quote']);self.assertGreater(changed['version'],o['version'])
    def test_consent_is_required_and_versioned(self):
        for consent,version in [(False,LEGAL_VERSION),(True,'old')]:
            with self.assertRaises(Problem):self.s.register('x@example.test','Name','long-test-password',consent,version,'hash')
        with self.s.connection() as d:
            row=d.execute('SELECT * FROM consent WHERE user_id=?',(self.a['id'],)).fetchone();self.assertEqual(row['version'],LEGAL_VERSION);self.assertEqual(row['document_hash'],legal_hash(self.config));self.assertGreater(row['accepted'],0)
    def test_password_and_session_are_not_plaintext(self):
        with self.s.connection() as d:
            p=d.execute('SELECT password FROM users LIMIT 1').fetchone()[0];self.assertNotIn('strong-test-password',p)
        token,_=self.s.session(self.a['id'])
        with self.s.connection() as d:self.assertIsNone(d.execute('SELECT token FROM sessions WHERE token=?',(token,)).fetchone())
    def test_login_invalid_credentials(self):
        for email,password in [('a@example.test','bad'),('missing@example.test','bad')]:
            with self.assertRaises(Problem):self.s.login(email,password)
    def test_concurrent_booking_is_exclusive(self):
        o=self.offer()
        def attempt(a,key):
            try:return self.s.reserve(a,o['id'],o['version'],key)['id']
            except Problem as e:return e.status
        with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda x:attempt(*x),[(self.a,'first-user-key-0000'),(self.b,'second-user-key-0000')]))
        self.assertEqual(sum(isinstance(x,str) for x in results),1);self.assertIn(409,results)
        with self.s.connection() as d:self.assertEqual(d.execute('SELECT count(*) FROM invoices').fetchone()[0],1)
    def test_idempotency_does_not_create_two_invoices(self):
        o=self.offer();first=self.reserve(o=o);second=self.reserve(o=o);self.assertEqual(first['id'],second['id'])
        with self.s.connection() as d:self.assertEqual(d.execute('SELECT count(*) FROM invoices').fetchone()[0],1)
    def test_price_snapshot_survives_source_change(self):
        o=self.offer();b=self.reserve(o=o);original=json.loads(b['snapshot'])
        with self.s.connection() as d:raw=json.loads(d.execute('SELECT data FROM offers WHERE id=?',(o['id'],)).fetchone()[0])
        raw['source_price_rub']+=100000;self.s.upsert('sandbox',[raw])
        saved=self.s.booking(self.a,b['id']);self.assertEqual(saved['snapshot'],original)
        with self.s.connection() as d:self.assertIsNone(d.execute('SELECT quote FROM offers WHERE id=?',(o['id'],)).fetchone()[0])
    def test_stale_price_cannot_be_reserved(self):
        o=self.offer()
        with self.s.connection() as d:d.execute('UPDATE offers SET updated=? WHERE id=?',(timestamp()-3600,o['id']))
        with self.assertRaises(Problem):self.reserve(o=o)
    def test_version_change_rejects_booking(self):
        o=self.offer()
        with self.s.connection() as d:d.execute('UPDATE offers SET version=version+1 WHERE id=?',(o['id'],))
        with self.assertRaises(Problem):self.reserve(o=o)
    def test_expired_reservation_releases_inventory_and_voids_invoice(self):
        o=self.offer();b=self.reserve(o=o)
        with self.s.connection() as d:d.execute('UPDATE bookings SET expires=? WHERE id=?',(timestamp()-1,b['id']))
        other=self.reserve(self.b,o,'other-booking-key-000')
        self.assertNotEqual(b['id'],other['id']);self.assertEqual(self.s.booking(self.a,b['id'])['invoice_status'],'void')
    def test_customer_cannot_read_someone_elses_booking(self):
        b=self.reserve()
        with self.assertRaises(Problem) as ctx:self.s.booking(self.b,b['id'])
        self.assertEqual(ctx.exception.status,404);self.assertEqual(self.s.bookings(self.b),[])
    def test_cancel_invalidates_invoice(self):
        b=self.reserve();self.s.transition(self.a,b['id'],'cancel');self.assertEqual(self.s.booking(self.a,b['id'])['invoice_status'],'void')
    def test_contract_and_payment_are_not_client_assertions(self):
        b=self.reserve();self.prepare(b);self.verify(b)
        with self.assertRaises(Problem):self.s.transition(self.a,b['id'],'accept_contract',{'reference':'fake'})
        self.s.transition(self.manager,b['id'],'accept_contract',{'reference':'contract-42'})
        with self.assertRaises(Problem):self.s.transition(self.manager,b['id'],'record_payment',{'reference':'bank-42'})
    def test_invoice_can_only_be_issued_with_complete_business_config(self):
        b=self.reserve();self.assertEqual(self.s.booking(self.a,b['id'])['invoice_status'],'draft')
        with self.assertRaises(Problem):self.s.transition(self.manager,b['id'],'issue_invoice')
        self.config['documents_approved']=True;self.config['reservation_amount_rub']=100000;self.config['issuer']={k:'TEST VALUE' for k in ('name','tax_id','address','bank','account','bank_code','payment_terms')}
        with self.assertRaises(Problem):self.s.transition(self.manager,b['id'],'issue_invoice')
        self.prepare(b);self.verify(b)
        with self.assertRaises(Problem):self.s.transition(self.manager,b['id'],'issue_invoice')
        self.s.transition(self.manager,b['id'],'accept_contract',{'reference':'signed-contract'})
        result=self.s.transition(self.manager,b['id'],'issue_invoice');self.assertEqual(result['invoice_status'],'issued');self.assertEqual(result['invoice_amount'],100000)
        self.s.transition(self.manager,b['id'],'record_payment',{'reference':'bank-confirmation'})
        self.assertEqual(self.s.booking(self.a,b['id'])['status'],'paid')
    def test_complete_company_config_never_makes_new_booking_payable(self):
        self.config['documents_approved']=True;self.config['reservation_amount_rub']=100000
        self.config['issuer']={k:'TEST VALUE' for k in ('name','tax_id','address','bank','account','bank_code','payment_terms')}
        b=self.reserve();self.assertEqual(self.s.booking(self.a,b['id'])['invoice_status'],'draft')
        with self.assertRaises(Problem):self.s.transition(self.manager,b['id'],'issue_invoice')
    def test_preparation_requires_explicit_request_and_fixed_destination(self):
        b=self.reserve()
        for fields in ({'consent':False},{'consent_version':LEGAL_VERSION},{'destination_confirmed':False},{'phone':'123'},{'revision':1},{'address':'unrequested data'}):
            with self.assertRaises(Problem):self.prepare(b,fields)
        self.assertEqual(self.s.booking(self.a,b['id'])['status'],'reserved')
        with self.assertRaises(Problem):self.s.transition(self.a,b['id'],'request_contract')
    def test_buyer_snapshot_and_request_are_archived_without_price_changes(self):
        b=self.reserve();saved=json.loads(b['snapshot']);prepared=self.prepare(b)
        self.assertEqual(prepared['snapshot'],saved);self.assertEqual(prepared['status'],'contract_review')
        self.assertEqual(prepared['preparation']['buyer']['phone'],'+79990000000')
        self.assertEqual(prepared['preparation']['buyer']['destination'],saved['quote']['destination'])
        with self.s.connection() as db:
            row=db.execute('SELECT l.content,c.accepted FROM legal_documents l JOIN consent c ON c.document_hash=l.hash WHERE c.user_id=? AND c.version=?',(self.a['id'],CONTRACT_CONSENT_VERSION)).fetchone()
            self.assertEqual(row['content'],legal_body('contract-consent',self.config));self.assertGreater(row['accepted'],0)
            self.assertEqual(db.execute('SELECT count(*) FROM consent WHERE user_id=?',(self.a['id'],)).fetchone()[0],2)
    def test_only_owner_can_submit_and_submitted_buyer_is_locked(self):
        b=self.reserve()
        for actor in (self.b,self.manager):
            with self.assertRaises(Problem):self.s.prepare_contract(actor,b['id'],{},'')
        self.prepare(b)
        with self.assertRaises(Problem):self.prepare(b,{'revision':1,'full_name':'Changed Buyer'})
        self.assertEqual(self.s.booking(self.a,b['id'])['preparation']['buyer']['full_name'],'Test Buyer')
    def test_document_check_is_manager_only_and_versioned(self):
        b=self.reserve();self.prepare(b)
        data={'kind':'inspection','status':'verified','reference':'TEST-report','revision':0}
        with self.assertRaises(Problem):self.s.document_review(self.a,b['id'],data)
        with self.assertRaises(Problem):self.s.document_review(self.manager,b['id'],data|{'reference':''})
        self.s.document_review(self.manager,b['id'],data)
        with self.assertRaises(Problem):self.s.document_review(self.manager,b['id'],data)
        self.s.document_review(self.manager,b['id'],data|{'status':'rejected','note':'VIN does not match','revision':1})
        self.assertFalse(self.s.booking(self.a,b['id'])['preparation']['ready'])
    def test_signed_contract_requires_checked_documents_and_approved_config(self):
        b=self.reserve();self.prepare(b)
        with self.assertRaises(Problem):self.s.transition(self.manager,b['id'],'accept_contract',{'reference':'signed-42'})
        self.verify(b);self.config['documents_approved']=False
        with self.assertRaises(Problem):self.s.transition(self.manager,b['id'],'accept_contract',{'reference':'signed-42'})
        self.config['documents_approved']=True
        self.assertEqual(self.s.transition(self.manager,b['id'],'accept_contract',{'reference':'signed-42'})['status'],'contract_accepted')
        with self.assertRaises(Problem):self.s.document_review(self.manager,b['id'],{'kind':'export','status':'missing','revision':1})
    def test_returned_buyer_data_can_be_corrected_with_new_revision(self):
        b=self.reserve();self.prepare(b)
        with self.assertRaises(Problem):self.s.transition(self.a,b['id'],'return_details',{'reference':'test'})
        self.s.transition(self.manager,b['id'],'return_details',{'reference':'Check full name'})
        returned=self.s.booking(self.a,b['id']);self.assertEqual(returned['preparation']['return_note'],'Check full name')
        with self.assertRaises(Problem):self.prepare(b)
        updated=self.prepare(b,{'revision':1,'full_name':'Corrected Buyer'})
        self.assertEqual(updated['preparation']['revision'],2);self.assertEqual(updated['expires'],b['expires'])
    def test_expiry_and_withdrawal_block_data_submission_even_with_old_actor(self):
        b=self.reserve();self.s.privacy_request(self.a,'withdraw')
        with self.assertRaises(Problem):self.prepare(b)
        with self.s.connection() as db:
            db.execute('UPDATE users SET withdrawn=NULL WHERE id=?',(self.a['id'],));db.execute('UPDATE bookings SET expires=? WHERE id=?',(timestamp()-1,b['id']))
        with self.assertRaises(Problem):self.prepare(b)
        self.assertIsNone(self.s.booking(self.a,b['id'])['preparation']['buyer'])
    def test_withdrawal_blocks_new_reservations(self):
        self.s.privacy_request(self.a,'withdraw')
        with self.s.connection() as d:self.assertIsNotNone(d.execute('SELECT withdrawn FROM users WHERE id=?',(self.a['id'],)).fetchone()[0])
        token,_=self.s.session(self.a['id']);a=self.s.auth(token)
        with self.assertRaises(Problem):self.reserve(a)
    def test_failed_import_preserves_inventory(self):
        with self.assertRaises(Problem):self.s.upsert('sandbox',[],True)
        self.assertEqual(len(self.s.catalog()['offers']),27)
    def test_removed_lots_are_not_bookable(self):
        o=self.offer()
        with self.s.connection() as d:d.execute('UPDATE offers SET active=0 WHERE id=?',(o['id'],))
        with self.assertRaises(Problem):self.reserve(o=o)
    def test_foreign_countries_are_excluded(self):
        bad={'country':'DE','source':'sandbox','source_id':'bad','title':'German lot','price_kind':'source_estimate','source_price_rub':2000000}
        with self.assertRaises(Problem):self.s.upsert('sandbox',[bad],True)
        self.assertEqual(len(self.s.catalog()['offers']),27)
    def test_documents_escape_customer_data(self):
        b=self.reserve();b=self.s.booking(self.a,b['id']);b['snapshot']['customer']['name']='<script>alert(1)</script>'
        self.assertNotIn('<script>alert(1)</script>',invoice(b,{}));self.assertNotIn('<script>alert(1)</script>',contract(b,{}))
    def test_image_refresh_does_not_change_commercial_quote(self):
        o=self.offer()
        with self.s.connection() as d:raw=json.loads(d.execute('SELECT data FROM offers WHERE id=?',(o['id'],)).fetchone()[0])
        raw['image_url']='https://example.test/new-public-image.jpg';self.s.upsert('sandbox',[raw])
        with self.s.connection() as d:r=d.execute('SELECT quote,version FROM offers WHERE id=?',(o['id'],)).fetchone()
        self.assertIsNotNone(r['quote']);self.assertEqual(r['version'],o['version'])
    def test_authoritative_refresh_does_not_invalidate_unchanged_quote(self):
        with self.s.connection() as d:records=[json.loads(r[0]) for r in d.execute('SELECT data FROM offers')]
        self.s.upsert('sandbox',records,True);self.assertTrue(all(o['bookable'] for o in self.s.catalog()['offers']))
    def test_authoritative_refresh_retires_missing_inventory(self):
        o=self.offer()
        with self.s.connection() as d:raw=json.loads(d.execute('SELECT data FROM offers WHERE id=?',(o['id'],)).fetchone()[0])
        self.s.upsert('sandbox',[raw],True)
        with self.s.connection() as d:self.assertEqual(d.execute('SELECT count(*) FROM offers WHERE active=1').fetchone()[0],1)
    def test_same_vin_cannot_be_reserved_from_two_sources(self):
        o=self.offer()
        with self.s.connection() as d:raw=json.loads(d.execute('SELECT data FROM offers WHERE id=?',(o['id'],)).fetchone()[0])
        raw['source']='backup';self.s.upsert('backup',[raw]);self.s.quote('backup:'+raw['source_id'],self.manager,o['quote'],'seller-confirmation',1)
        self.reserve(o=o)
        with self.assertRaises(Problem):self.s.reserve(self.b,'backup:'+raw['source_id'],2,'other-source-key-000')
    def test_velauto_country_is_read_from_explicit_feed(self):
        node={'cars':[{'href':'/catalog/42','name':'Kia K5 · 2023','meta':'12 000 км','price':'2 800 000 ₽','img':'https://ci.encar.com/photo.jpg'}],'feed':{'country':'korea'}}
        markup='<script>self.__next_f.push('+json.dumps([1,'a:'+json.dumps(node)+'\n'])+')</script>'
        result=parse_velauto(markup);self.assertEqual(result[0]['country'],'KR');self.assertEqual(result[0]['mileage_km'],12000);self.assertEqual(result[0]['title'],'Kia K5')
    def test_parser_excludes_sold_and_unpriced_lots(self):
        markup='<a href="/cars/a"><h3>Kia Seltos · 2023</h3>15 000 км Бензин 2 500 000 ₽ в Китае 100 000 ¥</a><a href="/cars/b"><h3>Sold vehicle · 2022</h3>Продан 1 000 000 ₽</a><a href="/cars/c"><h3>Unpriced · 2024</h3>По запросу</a>'
        items=parse_pilicar(markup);self.assertEqual(len(items),1);self.assertEqual(items[0]['country'],'CN');self.assertEqual(items[0]['source_price_rub'],2500000);self.assertEqual(items[0]['mileage_km'],15000)
if __name__=='__main__':unittest.main()
