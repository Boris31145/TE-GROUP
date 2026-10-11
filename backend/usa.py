"""Public Buy Now candidates, never a Russian delivered-price quote."""
import datetime,re,urllib.parse
from html.parser import HTMLParser
from .sources import permission,fetch

STATES=set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())

class Candidates(HTMLParser):
    def __init__(self):super().__init__();self.rows=[];self.current=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='div' and 'car-item-v2' in a.get('class','').split() and 'data-car-vin' in a:
            self.current=a;self.rows.append(a)

def parse_candidates(markup,now=None):
    parser=Candidates();parser.feed(markup);records=[];seen=set()
    now=now or datetime.datetime.now(datetime.timezone.utc)
    for a in parser.rows:
        name=a.get('data-car-title','');year=re.match(r'(20\d{2})\s+(.+)',name)
        vin=a.get('data-car-vin','').upper();location=a.get('data-car-location','')
        state=re.search(r'\(([A-Z]{2})\)\s*$',location) or re.match(r'^([A-Z]{2})\s*-\s*\S',location)
        if a.get('data-car-auction-site','').upper() not in ('IAAI','COPART') or re.search(r'Germany|Deutschland|Canada|Mexico',location,re.I):continue
        path=a.get('data-auction-card-car-show-url-value','')
        try:
            price=int(a.get('data-car-buy-now-price','0'));miles=int(a.get('data-car-odometer','0'))
            auction_at=datetime.datetime.fromisoformat(a.get('data-car-auction-date','').replace('Z','+00:00'))
        except (ValueError,TypeError):continue
        # An intake shortlist, not eligibility for delivery or an estimate under 6m.
        if not year or int(year[1])<2020 or not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',vin) or vin in seen:continue
        if not state or state[1] not in STATES or not re.fullmatch(r'/en/auctions/vehicle/[a-z0-9-]+',path):continue
        if not 1000<=price<=15000 or not 1<miles<=95000 or auction_at.tzinfo is None or auction_at<=now:continue
        title_type=a.get('data-car-title-type','');damage=a.get('data-car-damage','')
        if re.search(r'non.?repairable|junk|parts.?only|certificate of destruction',title_type,re.I):continue
        if re.search(r'burn|flood|water|biohazard|stripped|rollover',damage,re.I):continue
        seen.add(vin)
        image=a.get('data-car-image');u=urllib.parse.urlsplit(image or '')
        if not (u.scheme=='https' and ((u.netloc=='vis.iaai.com' and u.path=='/resizer') or (u.netloc=='cs.copart.com' and u.path.startswith('/v1/AUTH_svc.pdoc00001/ids-c-prod-lpp/')))):image=None
        records.append({'source':'carsfromusa','source_id':a.get('data-car-auction-site','auction').lower()+'-'+(a.get('data-car-lot') or vin),'country':'US','title':year[2], 'year':int(year[1]),'vin':vin,'mileage_km':round(miles*1.609344),'mileage_miles':miles,'fuel':'Уточняется','source_url':'https://carsfromusa.eu'+path,'image_url':image,'source_price':price,'source_currency':'USD','source_price_rub':None,'price_kind':'fixed_purchase','price_basis':'Цена Buy Now в USD — только выкуп лота. Сборы, доставка, ремонт и импортные платежи не рассчитаны.','description':'Кандидат для подготовки сметы. Доступность у продавца, документы и состояние не подтверждены TE GROUP.','damage':damage or None,'title_status':title_type or None,'location':location,'auction_at':auction_at.isoformat(),'source_expires_at':int(auction_at.timestamp()),'inspection_note':None,'repair_note':None,'intake_only':True})
    return records

def carsfromusa():
    permission('https://carsfromusa.eu','/en/categories/buy-now')
    return parse_candidates(fetch('https://carsfromusa.eu/en/categories/buy-now'))
