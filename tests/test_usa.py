import datetime, tempfile, unittest
from unittest.mock import patch
from pathlib import Path
from backend.usa import parse_candidates
from backend.domain import Store, Problem, LEGAL_VERSION, timestamp

NOW=datetime.datetime(2026,10,10,tzinfo=datetime.timezone.utc)
def card(**changes):
    a={'data-car-title':'2023 Honda Civic Sport','data-car-vin':'2HGFE2F53PH123456','data-car-location':'Atlanta North (GA)','data-auction-card-car-show-url-value':'/en/auctions/vehicle/honda-civic-2023-2hgfe2f53ph123456','data-car-lot':'45940578','data-car-auction-site':'IAAI','data-car-buy-now-price':'8800','data-car-current-bid':'100','data-car-odometer':'74000','data-car-auction-date':'2026-10-20T13:30:00Z','data-car-title-type':'Salvage','data-car-damage':'Rear','data-car-image':'https://vis.iaai.com/resizer?imageKeys=123&amp;width=845'}
    a.update(changes)
    return '<div class="car-item car-item-v2" '+ ' '.join(f'{k}="{v}"' for k,v in a.items())+'></div>'

class UsaTests(unittest.TestCase):
    def test_fixed_buy_now_is_not_bid_or_russian_total(self):
        r=parse_candidates(card(),NOW)[0]
        self.assertEqual(r['source_price'],8800);self.assertEqual(r['source_currency'],'USD');self.assertIsNone(r['source_price_rub']);self.assertEqual(r['price_kind'],'fixed_purchase');self.assertEqual(r['country'],'US');self.assertEqual(r['source_id'],'iaai-45940578')
    def test_usa_location_required_and_copart_state_supported(self):
        self.assertEqual(len(parse_candidates(card(**{'data-car-location':'AZ - Tucson'}),NOW)),1)
        for location in ['Toronto (ON)','Dream Rides','Dubai','Germany (DEU)','Germany (DE)']:
            self.assertEqual(parse_candidates(card(**{'data-car-location':location}),NOW),[])
    def test_rejects_junk_damage_placeholder_prices_and_elapsed_auction(self):
        for changes in [{'data-car-damage':'Water/Flood'},{'data-car-damage':'Total Burn'},{'data-car-damage':'Rollover'},{'data-car-title-type':'Parts Only'},{'data-car-title-type':'Non Repairable'},{'data-car-buy-now-price':'25'},{'data-car-auction-date':'2026-09-01T12:00:00Z'},{'data-car-odometer':'1'},{'data-car-vin':'not-a-vin'}]:
            with self.subTest(changes=changes):self.assertEqual(parse_candidates(card(**changes),NOW),[])
    def test_deduplication_by_vin(self):self.assertEqual(len(parse_candidates(card()+card(),NOW)),1)
    def test_candidate_visible_for_selection_but_bookable_only_after_complete_quote(self):
        with tempfile.TemporaryDirectory() as temp:
            s=Store(Path(temp)/'db',{'mode':'local'});r=parse_candidates(card(),NOW);s.upsert('carsfromusa',r)
            self.assertEqual(s.catalog()['mix']['US']['available'],1)
            candidate=s.catalog()['offers'][0];self.assertFalse(candidate['bookable']);self.assertIsNone(candidate['source_price_rub']);self.assertIsNone(candidate['quote'])
            oid='carsfromusa:'+r[0]['source_id'];actor={'id':'manager','role':'manager'}
            q={'vin':r[0]['vin'],'vehicle_rub':1200000,'delivery_rub':200000,'company_fee_rub':100000,'buyer_costs_rub':400000,'destination':'Agreed terminal','terms':'Agreed purchase and delivery terms'}
            with self.assertRaises(Problem):s.quote(oid,actor,q,'supplier-confirmation',1)
            full=q|{'repair_rub':300000,'inspection_reference':'inspection-001','export_document_reference':'title-review-001'}
            with self.assertRaises(Problem):s.quote(oid,actor,full|{'vin':'1HGCM82633A004352'},'supplier-confirmation',1)
            with self.assertRaises(Problem):s.quote(oid,actor,full|{'repair_rub':5000000},'supplier-confirmation',1)
            result=s.quote(oid,actor,full,'supplier-confirmation',1)
            self.assertEqual(result['total_rub'],2200000);self.assertEqual(result['company_rub'],1500000)
            public=s.catalog()['offers'][0];self.assertTrue(public['bookable']);self.assertEqual(public['vin'],public['quote']['vin'])
    def test_lot_expiry_blocks_purchase_even_with_fresh_quote(self):
        with tempfile.TemporaryDirectory() as temp:
            s=Store(Path(temp)/'db',{'mode':'local'});r=parse_candidates(card(),NOW);at=timestamp();r[0]['source_expires_at']=at+10;s.upsert('carsfromusa',r)
            oid='carsfromusa:'+r[0]['source_id'];actor={'id':'manager','role':'manager'}
            q={'vin':r[0]['vin'],'vehicle_rub':1200000,'delivery_rub':200000,'company_fee_rub':100000,'buyer_costs_rub':400000,'repair_rub':300000,'destination':'Agreed terminal','terms':'Agreed terms','inspection_reference':'inspection-001','export_document_reference':'title-review-001'}
            s.quote(oid,actor,q,'seller-confirmation',1)
            uid=s.register('customer@example.test','Customer','long-test-password',True,LEGAL_VERSION,'test-hash');token,_=s.session(uid);user=s.auth(token)
            with patch('backend.domain.timestamp',return_value=at+11):
                o=s.catalog()['offers'][0];self.assertFalse(o['bookable']);self.assertTrue(o['source_expired'])
                with self.assertRaises(Problem):s.reserve(user,oid,o['version'],'unique-reserve-key-0001')
