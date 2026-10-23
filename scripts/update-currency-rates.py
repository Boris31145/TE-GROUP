"""Fetch the current official CBR reference rates. Never reads customer data."""
from datetime import datetime
from zoneinfo import ZoneInfo
from decimal import Decimal
from pathlib import Path
import json, urllib.request, xml.etree.ElementTree as ET, argparse

def parse_rates(raw, fetched_at):
    root=ET.fromstring(raw)
    effective=datetime.strptime(root.attrib['Date'],'%d.%m.%Y').date()
    today=fetched_at.date()
    if effective>today or (today-effective).days>7:raise ValueError('Invalid or stale rate date')
    result={}
    for node in root.findall('Valute'):
        code=node.findtext('CharCode')
        if code not in ['USD','CNY','JPY','KRW','EUR','KGS']:continue
        nominal=Decimal(node.findtext('Nominal'));value=Decimal(node.findtext('Value').replace(',','.'))
        if nominal<=0 or not value.is_finite() or value<=0:raise ValueError('Invalid currency value')
        result[code]=float(value/nominal)
    if set(result)!=set(['USD','CNY','JPY','KRW','EUR','KGS']):raise ValueError('Missing currencies')
    return dict(version=1,provider='Банк России',source_url='https://www.cbr.ru/development/sxml/',rate_date=effective.isoformat(),fetched_at=fetched_at.isoformat(),base='RUB',rates=result,frequency='official_reference_daily')

def main():
    p=argparse.ArgumentParser();p.add_argument('--input');p.add_argument('--output',default=str(Path(__file__).resolve().parents[1]/'assets/currency-rates.json'));a=p.parse_args()
    now=datetime.now(ZoneInfo('Europe/Moscow'))
    if a.input:raw=Path(a.input).read_bytes()
    else:
        url='https://www.cbr.ru/scripts/XML_daily.asp?date_req='+now.strftime('%d/%m/%Y')
        request=urllib.request.Request(url,headers={'User-Agent':'TEGROUP-Catalog/1.0','Accept':'application/xml'})
        with urllib.request.urlopen(request,timeout=30) as response:raw=response.read(1000000)
    data=parse_rates(raw,now);dest=Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(dest)
    print(json.dumps({'date':data['rate_date'],'currencies':list(data['rates'])}))
if __name__=='__main__':main()
