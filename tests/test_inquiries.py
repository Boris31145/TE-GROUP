import json,tempfile,unittest
from pathlib import Path
from backend.domain import Store,Problem,LEGAL_VERSION,INQUIRY_VERSION,timestamp
from backend.server import sandbox

class InquiryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.s=Store(Path(self.temp.name)/'db',{'mode':'sandbox','max_feed_age_seconds':1800});sandbox(self.s)
        self.manager={'id':'staff','role':'manager'};self.a=self.customer('a@example.test');self.b=self.customer('b@example.test')
        self.o=self.s.catalog()['offers'][0];self.q=self.o['quote']
        with self.s.connection() as db:
            self.raw=json.loads(db.execute('SELECT data FROM offers WHERE id=?',(self.o['id'],)).fetchone()[0]);db.execute('UPDATE offers SET quote=NULL,quote_expires=NULL,supplier_reference=NULL WHERE id=?',(self.o['id'],))
        self.data={'offer_id':self.o['id'],'version':self.o['version'],'phone':'+7 999 000-00-00','city':'Москва','confirmed':True,'request_version':INQUIRY_VERSION,'idempotency':'selection-test-key-001'}
    def customer(self,email):
        uid=self.s.register(email,'Test Customer','test-password-long',True,LEGAL_VERSION,'test-request');token,_=self.s.session(uid);return self.s.auth(token)
    def tearDown(self):self.temp.cleanup()
    def confirm_quote(self):
        with self.s.connection() as db:version=db.execute('SELECT version FROM offers WHERE id=?',(self.o['id'],)).fetchone()[0]
        self.s.quote(self.o['id'],self.manager,self.q,'TEST supplier confirmation',version)
        with self.s.connection() as db:return db.execute('SELECT version FROM offers WHERE id=?',(self.o['id'],)).fetchone()[0]
    def test_selection_is_persistent_and_creates_no_hold_or_invoice(self):
        first=self.s.inquire(self.a,self.data);self.assertEqual(first['status'],'pending');self.assertIsNone(first['snapshot']['quote'])
        self.assertEqual(self.s.inquire(self.a,self.data)['id'],first['id'])
        self.assertEqual(self.s.inquire(self.a,self.data|{'idempotency':'another-unique-key-002'})['id'],first['id'])
        self.assertNotEqual(self.s.inquire(self.b,self.data)['id'],first['id'])
        recovered=Store(self.s.path).inquiries(self.a);self.assertEqual(len(recovered),1);self.assertEqual(recovered[0]['contact']['phone'],'+79990000000')
        with self.s.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM invoices').fetchone()[0],0);self.assertEqual(db.execute('SELECT count(*) FROM bookings').fetchone()[0],0)
            text=db.execute('SELECT content FROM legal_documents WHERE version=?',(INQUIRY_VERSION,)).fetchone()[0];self.assertIn('не является бронью',text)
    def test_ownership_and_manager_only_reply(self):
        r=self.s.inquire(self.a,self.data);self.assertEqual(self.s.inquiries(self.b),[])
        with self.assertRaises(Problem):self.s.inquiry_action(self.b,r['id'],{'action':'cancel'})
        with self.assertRaises(Problem):self.s.inquiry_action(self.a,r['id'],{'action':'proposal','reply':'Fake availability'})
        self.assertEqual(self.s.inquiry_action(self.a,r['id'],{'action':'cancel'})['status'],'cancelled')
    def test_confirmation_requires_real_quote_and_invalidates_on_source_change(self):
        r=self.s.inquire(self.a,self.data)
        with self.assertRaises(Problem):self.s.inquiry_action(self.manager,r['id'],{'action':'proposal','reply':'TEST supplier contacted','version':self.o['version']})
        version=self.confirm_quote();r=self.s.inquiry_action(self.manager,r['id'],{'action':'proposal','reply':'TEST supplier contacted; city and delivery require agreement','version':version});self.assertTrue(r['proposal_current'])
        self.raw['source_price_rub']+=100000;self.s.upsert('sandbox',[self.raw]);r=self.s.inquiries(self.a)[0]
        self.assertFalse(r['proposal_current']);self.assertIsNone(r['offer']['quote']);self.assertEqual(r['snapshot']['source_price_rub'],self.o['source_price_rub'])
    def test_booking_completes_selection_only_after_customer_accepts_quote(self):
        r=self.s.inquire(self.a,self.data);version=self.confirm_quote();self.s.inquiry_action(self.manager,r['id'],{'action':'proposal','reply':'TEST confirmed proposal','version':version})
        self.s.reserve(self.a,self.o['id'],version,'customer-accepted-key-001');self.assertEqual(self.s.inquiries(self.a)[0]['status'],'booked')
        with self.s.connection() as db:self.assertEqual(db.execute('SELECT count(*) FROM invoices').fetchone()[0],1)
    def test_version_request_and_contact_validation(self):
        for changes in [{'version':0},{'request_version':'old'},{'confirmed':False},{'phone':'x'},{'city':''},{'idempotency':'short'}]:
            with self.subTest(changes=changes),self.assertRaises(Problem):self.s.inquire(self.a,self.data|changes)
        with self.assertRaises(Problem):self.s.inquire(self.a|{'withdrawn':timestamp()},self.data)
    def test_stale_source_can_be_selected_but_elapsed_lot_cannot(self):
        with self.s.connection() as db:db.execute('UPDATE offers SET updated=? WHERE id=?',(timestamp()-3600,self.o['id']))
        r=self.s.inquire(self.a,self.data);self.assertTrue(r['snapshot']['stale'])
        self.s.inquiry_action(self.a,r['id'],{'action':'cancel'})
        self.raw['source_expires_at']=timestamp()-1;self.s.upsert('sandbox',[self.raw]);self.data['version']+=1
        with self.assertRaises(Problem):self.s.inquire(self.a,self.data|{'idempotency':'different-key-test-002'})

if __name__=='__main__':unittest.main()
