import json,unittest
from backend.sources import parse_velauto_detail

class SourceDetailTests(unittest.TestCase):
    def markup(self,car):
        payload='21:'+json.dumps({'initialData':{'car':car}})+'\n'
        return '<script>self.__next_f.push('+json.dumps([1,payload])+')</script>'
    def row(self):return {'source':'velauto','source_id':'42','country':'KR','fuel':'Уточняется','source_price_rub':2300000}
    def car(self):return {'id':42,'country':'korea','isActive':True,'fuelType':'diesel','mileage':73000,'priceUssuriysk':2200000,'priceMoscow':2450000,'coverUrl':'https://ci.encar.com/carpicture/42_001.jpg','images':['https://ci.encar.com/carpicture/42_001.jpg','https://ci.encar.com/carpicture/42_002.jpg','http://127.0.0.1/private']}
    def test_explicit_country_and_active_status_are_required(self):
        for changes in [{'country':'japan'},{'country':'china'},{'country':'germany'},{'isActive':False}]:
            with self.subTest(changes=changes):self.assertIsNone(parse_velauto_detail(self.markup(self.car()|changes),self.row()))
    def test_detail_enrichment_keeps_price_destination_and_photo_identity(self):
        r=parse_velauto_detail(self.markup(self.car()),self.row());self.assertEqual(r['source_price_rub'],2200000);self.assertIn('Уссурийска',r['price_basis']);self.assertEqual(r['fuel'],'Дизель');self.assertEqual(r['mileage_km'],73000);self.assertEqual(len(r['image_urls']),2);self.assertIn('42_002',r['image_urls'][1]);self.assertIsNone(r.get('vin'))
    def test_unrelated_car_cannot_replace_offer(self):
        self.assertEqual(parse_velauto_detail(self.markup(self.car()|{'id':43}),self.row()),self.row())

if __name__=='__main__':unittest.main()
