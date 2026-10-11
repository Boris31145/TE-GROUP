"""Embed original public source photos for the offline review; never alter a lot photo."""
import base64,concurrent.futures,json,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def photo(row):
    url=row.get('image_url','');u=urllib.parse.urlsplit(url or '')
    if u.scheme!='https' or u.netloc not in ('vis.iaai.com','cs.copart.com','pilicar.com','velauto.ru'):return None
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'TEGroupCatalog/1.0 (+https://tegroup.cc/)'})
        with urllib.request.urlopen(request,timeout=12) as r:
            mime=r.headers.get_content_type();raw=r.read(2_000_001)
            if mime not in ('image/jpeg','image/png','image/webp') or len(raw)>2_000_000:return None
        return row['source']+':'+row['source_id']+row.get('photo_suffix',''),'data:'+mime+';base64,'+base64.b64encode(raw).decode()
    except Exception:return None
if __name__=='__main__':
    snap=json.loads((ROOT/'config/catalog.snapshot.json').read_text())
    import tempfile
    from backend.domain import Store
    with tempfile.TemporaryDirectory() as temp:
        store=Store(Path(temp)/'photos.sqlite',{'max_feed_age_seconds':86400})
        for source,d in snap.items():store.upsert(source,d['offers'])
        rows=store.catalog()['offers']
    galleries=[]
    for row in rows:
        for index,url in enumerate((row.get('image_urls') or [])[:3]):
            if index:galleries.append(row|{'image_url':url,'photo_suffix':':photo:'+str(index)})
    rows+=galleries
    out={};size=0
    with concurrent.futures.ThreadPoolExecutor(5) as pool:
        for item in pool.map(photo,rows):
            if item and size+len(item[1])<15_000_000:out[item[0]]=item[1];size+=len(item[1])
    (ROOT/'review/images.json').write_text(json.dumps(out))
    print('Embedded original source photos:',len(out),'bytes:',size)
