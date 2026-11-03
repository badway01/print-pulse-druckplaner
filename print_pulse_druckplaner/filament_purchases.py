"""Händlerunabhängige Filamentbestellungen und transaktionaler (Teil-)Wareneingang.
Alle Änderungen bleiben isoliert von Etsy-Beständen und den bisherigen Lagerbuchungen.
"""
import datetime as dt
import hashlib
import json
import re
import secrets
import sqlite3
import time
import unicodedata

def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_filament_orders (
      id TEXT PRIMARY KEY, vendor TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
      ordered_on TEXT NOT NULL DEFAULT '', total_cents INTEGER, discount_cents INTEGER NOT NULL DEFAULT 0,
      credit_cents INTEGER NOT NULL DEFAULT 0, shipping_cents INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL DEFAULT '', source_type TEXT NOT NULL DEFAULT 'manual',
      created INTEGER NOT NULL, updated INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS pp_filament_order_fingerprint
      ON pp_filament_orders(fingerprint) WHERE fingerprint<>'';
    CREATE TABLE IF NOT EXISTS pp_filament_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES pp_filament_orders(id),
      filament_id INTEGER NOT NULL REFERENCES filament_spools(id),
      quantity INTEGER NOT NULL CHECK(quantity>0), received INTEGER NOT NULL DEFAULT 0
       CHECK(received>=0 AND received<=quantity),
      grams INTEGER NOT NULL, packaging TEXT NOT NULL DEFAULT 'unknown',
      gross_cents INTEGER, effective_cents INTEGER, description TEXT NOT NULL DEFAULT '',
      created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS pp_filament_lines_order ON pp_filament_order_lines(order_id);
    CREATE TABLE IF NOT EXISTS pp_filament_receipts (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES pp_filament_orders(id),
      request_key TEXT NOT NULL UNIQUE, quantities_json TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_filament_catalog_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL,
      filament_id INTEGER NOT NULL, field TEXT NOT NULL,
      old_value TEXT NOT NULL, new_value TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_filament_cost_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_id TEXT NOT NULL,
      line_id INTEGER NOT NULL, filament_id INTEGER NOT NULL, quantity INTEGER NOT NULL,
      cost_cents INTEGER, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_filament_price_baselines (
      filament_id INTEGER PRIMARY KEY, price_cents INTEGER, created INTEGER NOT NULL);
    """)

def num(value, low, high, label):
    if isinstance(value, bool) or not isinstance(value, int) or not low<=value<=high:
        raise ValueError(label + ': ungültiger Wert.')
    return value

def label(value, maximum, name, required=False):
    if not isinstance(value,str) or len(value.strip())>maximum or (required and not value.strip()):
        raise ValueError(name + ': ungültige oder fehlende Angabe.')
    return value.strip()

def key(value):
    s=unicodedata.normalize('NFKD',str(value or '').casefold().replace('ß','ss')
        .replace('ä','ae').replace('ö','oe').replace('ü','ue'))
    return ''.join(c for c in s.replace('+','plus') if c.isalnum() and not unicodedata.combining(c))

def brand_key(value):
    """Recognize Bambu short names and letter case without distinct catalog entries."""
    name=key(value)
    return 'bambulab' if name in ('bambu','bambulab','bambulabs') else name

def canonical_brand(db,value):
    name=brand_key(value)
    if name=='bambulab':return 'Bambu Lab'
    preferred={'sunlu':'SUNLU','esun':'eSUN','elegoo':'ELEGOO',
               'polymaker':'Polymaker','prusament':'Prusament',
               'creality':'Creality','eryone':'ERYONE'}
    if name in preferred:return preferred[name]
    for row in db.execute('SELECT DISTINCT brand FROM filament_spools'):
        if brand_key(row['brand'])==name:return row['brand']
    return value

def canonical_material(db,brand,value):
    material=material_key(value)
    common={'plabasic':'PLA Basic','plamatte':'PLA Matte','plasilk':'PLA Silk',
            'plaplus':'PLA+','petgbasic':'PETG Basic','petgmatte':'PETG Matte',
            'abs':'ABS','asa':'ASA','tpu':'TPU'}
    if material in common:return common[material]
    for row in db.execute('SELECT DISTINCT brand,material FROM filament_spools'):
        if brand_key(row['brand'])==brand_key(brand) and material_key(row['material'])==material:
            return row['material']
    return value

def material_key(value):
    return {'basicpla':'plabasic','mattepla':'plamatte','plaplus':'plaplus'}.get(key(value),key(value))

def money_to_cents(s):
    if s is None:return None
    if isinstance(s,int) and not isinstance(s,bool):return s
    s=str(s).strip().replace('€','').replace('EUR','').strip()
    if not s:return None
    if '.' in s and ',' in s:s=s.replace('.','').replace(',','.')
    elif ',' in s:s=s.replace(',','.')
    try:
        from decimal import Decimal
        return int((Decimal(s)*100).quantize(Decimal('1')))
    except Exception:return None

def suggest_matches(db, line):
    rows=[dict(r) for r in db.execute("SELECT id,brand,material,color,manufacturer_code,color_hex,internal_code FROM filament_spools")]
    brand=brand_key(line.get('brand'))
    material=material_key(line.get('material'))
    code=key(line.get('manufacturer_code'))
    name=key(line.get('color'))
    if brand=='bambulab' and material=='plabasic' and name in ('white','weiss','jadewhite'):
        name='jadeweiss'
    if brand=='bambulab' and name=='ivorywhite':name='elfenbeinweiss'
    exact=[]
    for row in rows:
        if brand_key(row['brand'])!=brand or material_key(row['material'])!=material:continue
        if code and key(row['manufacturer_code'])==code:
            exact.append(row)
        elif name and key(row['color'])==name:
            # An incorrect old manufacturer code is a reviewable field conflict,
            # never grounds for silently creating a duplicate color.
            exact.append(row)
    # Same maker+material+code can match despite different translated color names.
    # Never merge two distinct candidates automatically.
    unique={r['id']:r for r in exact}
    matched=list(unique.values())
    return matched[0] if len(matched)==1 else None, len(matched)>1

def detect_vendor(text):
    head=text[:3000].lower()
    if 'bambu' in head:return 'Bambu Lab'
    # Bambu's German order table can be pasted without the shop heading.
    # The shop-specific "Filament-Großverkauf" promotion identifies this
    # format; a manufacturer code alone is not a trustworthy vendor signal.
    if re.search(r'filament[- ]großverkauf',head,re.I) and re.search(r'pla\s*basic|pla\s*matte|petg\s*matte',head,re.I):
        return 'Bambu Lab'
    for name in ('amazon','sunlu','polymaker','prusament','elegoo','ebay','3djake','esun'):
        if name in head:return {'esun':'eSUN','ebay':'eBay'}.get(name,name.capitalize())
    return 'Unbekannter Händler'

def tall_screenshot_tiles(path, tile_height=1450):
    """Return independent image bands for OCR, avoiding whole-page layout failures.

    Returns [] for normal photos. No raw image or OCR content is persisted.
    """
    import io
    from PIL import Image, ImageOps
    with Image.open(path) as original:
        width,height=original.size
        if width<100 or height<2200 or height/width<3.5:
            return []
        if width*height>30_000_000:
            raise ValueError('Bildauflösung ist zu groß. Bitte einen kleineren Screenshot verwenden.')
        img=ImageOps.exif_transpose(original).convert('RGB')
    width,height=img.size
    tiles=[]
    top=0
    while top<height:
        bottom=min(top+tile_height,height)
        if bottom<height:
            # Prefer a whitespace break so product names and prices stay together.
            low=max(top+900,bottom-120)
            high=min(height-1,bottom+120)
            if high>=low:
                blanks=[]
                for y in range(low,high+1,2):
                    values=img.crop((0,y,width,y+1)).getextrema()
                    if all(lowest>=245 for lowest,highest in values):
                        blanks.append(y)
                if blanks:
                    bottom=min(blanks,key=lambda y:abs(y-bottom))
        if bottom<=top:
            raise ValueError('Bild konnte nicht in Abschnitte aufgeteilt werden.')
        output=io.BytesIO()
        img.crop((0,top,width,bottom)).save(output,format='PNG')
        tiles.append(output.getvalue())
        top=bottom
        if len(tiles)>24:
            raise ValueError('Screenshot enthält zu viele Abschnitte.')
    return tiles


def parse_bambu_payment(source):
    """Parse Bambu order-payment rows, without duplicate progress products."""
    start=re.search(r'Zahlungsdetails',source,re.I)
    if not start:return [],0
    part=re.split(r'(?im)^\s*(?:Zwischensumme|Bestellrabatt|Credit verwenden|Gesamtsumme|Steuer|Nettobetrag|Lieferadresse)\b',source[start.end():])[0]
    expected=len(re.findall(r'\(\s*\d{4,6}\s*\)',part))
    pattern=r'(?im)^[^\n]*?\b(PLA\s*(?:Basic|Matte|Silk|Plus)|PETG\s*(?:Matte|Basic)|ABS|ASA|TPU)\s*$'
    heads=list(re.finditer(pattern,part))
    items=[]
    for i,m in enumerate(heads):
        section=part[m.end():heads[i+1].start() if i+1<len(heads) else len(part)]
        code=re.search(r'\(\s*(\d{4,6})\s*\)',section)
        if not code:continue
        prefix=section[section.rfind('\n',0,code.start())+1:code.start()]
        color=re.sub(r'^[^A-Za-zÄÖÜäöüß]+','',prefix.strip()).strip()
        qty=re.search(r'[x×]\s*(\d{1,3})\b',section[code.end():code.end()+160],re.I)
        if not color or not qty or not 1<=int(qty.group(1))<=100:continue
        material=re.sub(r'(?i)^(PLA|PETG)(?=[a-z])',r'\1 ',m.group(1))
        packaging='refill' if re.search(r'nachfüll|refill',section,re.I) else 'spool' if re.search(r'mit spule|with spool',section,re.I) else 'unknown'
        prices=[re.search(r'(\d{1,5}[.,]\d{2})\s*(?:€|EUR)',line,re.I) for line in section.splitlines() if not re.search('mengenrabatt|discount',line,re.I)]
        price=next((money_to_cents(x.group(1)) for x in prices if x),None)
        gift=price==0 or bool(re.search(r'geschenk|gift',section[:220],re.I))
        items.append({'brand':'Bambu Lab','material':' '.join(material.split()),'color':color,
          'manufacturer_code':code.group(1),'internal_code':'','color_hex':'',
          'quantity':int(qty.group(1)),'grams':1000,'packaging':packaging,
          'gross_cents':0 if gift else price,'description':'Gratisartikel' if gift else ''})
    return items,expected


def parse_text(text, db):
    """Conservative extraction: never invent unknown colors, prices or codes."""
    if not isinstance(text,str) or not 1<=len(text)<=100000:
        raise ValueError('Bitte lesbaren Bestelltext einfügen.')
    normalized=text.replace('\u00a0',' ').replace('\r','')
    vendor=detect_vendor(normalized)
    items,expected=(parse_bambu_payment(normalized) if vendor=='Bambu Lab' else ([],0))
    # Bambu's order confirmation consistently contains material x quantity and (maker code).
    pattern=re.compile(r'\b(PLA\s*(?:Basic|Matte|Silk(?:\+)?|Plus)?|PETG\s*(?:Matte|Basic)?|ABS|ASA|TPU)\s*[x×]\s*(\d{1,3})\b',re.I)
    hits=[] if items else list(pattern.finditer(normalized))
    for idx,match in enumerate(hits[:100]):
        segment=normalized[match.end():hits[idx+1].start() if idx+1<len(hits) else len(normalized)]
        segment=segment[:1500]
        material=' '.join(match.group(1).split())
        quantity=int(match.group(2))
        if quantity<1 or quantity>100:continue
        c=re.search(r'([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß\- ]{1,45}?)\s*\((\d{4,6})\)',segment)
        color=c.group(1).strip() if c else ''
        code=c.group(2) if c else ''
        if color and len(color)>30:color=color[-30:].split('/')[-1].strip()
        grams=1000
        g=re.search(r'(\d+(?:[.,]\d+)?)\s*(kg|g)\b',segment,re.I)
        if g:
            value=float(g.group(1).replace(',','.'))
            grams=round(value*(1000 if g.group(2).lower()=='kg' else 1))
        amounts=re.findall(r'(?<![-−])€\s*(\d{1,5}[.,]\d{2})',segment)
        if not amounts:
            amounts=re.findall(r'\b(\d{1,5}[.,]\d{2})\s*(?:€|EUR)\b',segment,re.I)
        is_gift=bool(re.search(r'geschenk|gift|free|kostenlos',segment[:350],re.I))
        price=0 if is_gift else money_to_cents(amounts[0]) if amounts else None
        packing='refill' if re.search('nachfüll|refill',segment,re.I) else (
            'spool' if re.search('mit spule|with spool',segment,re.I) else 'unknown')
        row={'brand':vendor if vendor!='Unbekannter Händler' else '',
             'material':material,'color':color,'manufacturer_code':code,
             'internal_code':'','color_hex':'','quantity':quantity,'grams':grams,
             'packaging':packing,'gross_cents':price,'description':''}
        if is_gift:row['description']='Gratisartikel'
        items.append(row)
    # General fallback: extract recognizable product lines conservatively;
    # OCR layouts and seller formats are inherently variable.
    if not items:
        for raw in normalized.splitlines():
            line=re.sub(r'\s+',' ',raw).strip()
            if not re.search(r'\b(PLA\+?|PETG|ABS|ASA|TPU)\b',line,re.I):continue
            if len(line)<12 or len(line)>320:continue
            m=re.search(r'\b(PLA\+?|PLA\s+(?:Basic|Matte|Silk)|PETG(?:\s+Matte)?|ABS|ASA|TPU)\b',line,re.I)
            if not m:continue
            material=m.group(1)
            qty=re.search(r'\b(\d{1,2})\s*[x×]\s*1\s*kg\b|\b(\d{1,2})er[- ]?pack\b',line,re.I)
            quantity=int(next((x for x in qty.groups() if x),1)) if qty else 1
            grams=1000
            price=re.search(r'€\s*(\d{1,5}[.,]\d{2})|(\d{1,5}[.,]\d{2})\s*€',line)
            amount=money_to_cents(price.group(1) or price.group(2)) if price else None
            maker=next((s for s in ('Bambu Lab','SUNLU','eSUN','Polymaker','Prusament','ELEGOO','ERYONE','Creality') if key(s) in key(line)),vendor if vendor not in ('Amazon','eBay','Unbekannter Händler') else '')
            # Unknown color is intentionally blank and must be supplied in the review.
            items.append({'brand':maker,'material':material,'color':'',
             'manufacturer_code':'','internal_code':'','color_hex':'',
             'quantity':quantity,'grams':grams,'packaging':'unknown',
             'gross_cents':amount,'description':line[:180]})
            if len(items)>=40:break
    for item in items:
        existing,ambiguous=suggest_matches(db,item) if item['brand'] and item['color'] else (None,False)
        item['filament_id']=existing['id'] if existing else None
        item['existing']=existing
        item['ambiguous']=ambiguous
        item['needs_review']=not (item['brand'] and item['color'] and item['material'] and item['gross_cents'] is not None and not ambiguous)
        if existing:
            item['changes']={k:{'old':existing[k],'new':item[k]} for k in ('manufacturer_code','color_hex')
               if item.get(k) and item[k]!=existing[k]}
    # Optional invoice-level figures. Avoid counting line-item bulk rebates a
    # second time; infer the *additional* checkout rebate from the final total.
    total=None
    m=re.search(r'(?i)Gesamtsumme[^\n]{0,140}?[€ ]\s*(\d{1,6}[.,]\d{2})',normalized)
    if not m:m=re.search(r'(?i)Bruttobetrag[^\n]{0,140}?[€ ]\s*(\d{1,6}[.,]\d{2})',normalized)
    if m:total=money_to_cents(m.group(1))
    credit=0
    m=re.search(r'(?i)Credit verwenden[^\n]{0,100}?[-−]?\s*(\d{1,6}[.,]\d{2})',normalized)
    if m:credit=money_to_cents(m.group(1)) or 0
    shipping=0
    m=re.search(r'(?im)^\s*[\|* ]*Versand[^\n]{0,100}?€\s*(\d{1,6}[.,]\d{2})',normalized)
    if m:shipping=money_to_cents(m.group(1)) or 0
    discount=0
    if total is not None and items and all(x['gross_cents'] is not None for x in items):
        checkout=sum(x['gross_cents'] for x in items)+shipping-credit-total
        if checkout>=0:discount=checkout
    warning=(f'Nur {len(items)} von mindestens {expected} Positionen erkannt. Bitte prüfen.' if expected and len(items)<expected else '')
    return {'vendor':vendor,'ordered_on':dt.date.today().isoformat(),'reference':'',
            'items':items,'expected_positions':expected,'total_cents':total,'discount_cents':discount,'credit_cents':credit,
            'shipping_cents':shipping,
            'warnings':([warning] if warning else []) + ([] if items else ['Keine eindeutigen Produktpositionen erkannt. Bitte Positionen manuell ergänzen.'])
                + (['Unvollständige Positionen bitte einzeln prüfen.'] if any(i['needs_review'] for i in items) else [])}

def distribute(deduction, weights):
    total=sum(weights)
    if total<=0:return [0]*len(weights)
    amounts=[(deduction*w)//total for w in weights]
    remainders=sorted(range(len(weights)),key=lambda i:(-(deduction*weights[i]%total),i))
    for i in remainders[:deduction-sum(amounts)]:amounts[i]+=1
    return amounts

def overview(db):
    orders=[]
    for order in db.execute('SELECT * FROM pp_filament_orders ORDER BY created DESC,id DESC'):
        obj=dict(order)
        lines=[dict(r) for r in db.execute("""
          SELECT l.*,f.internal_code,f.color_hex AS stored_hex,f.price_cents AS last_price_cents
          FROM pp_filament_order_lines l JOIN filament_spools f ON l.filament_id=f.id
          WHERE l.order_id=? ORDER BY l.id""",(obj['id'],))]
        for ln in lines:
            f=db.execute("SELECT brand,material,color,manufacturer_code FROM filament_spools WHERE id=?",(ln['filament_id'],)).fetchone()
            ln.update(dict(f))
            ln['remaining']=ln['quantity']-ln['received']
        obj['lines']=lines
        qty=sum(l['quantity'] for l in lines)
        received=sum(l['received'] for l in lines)
        obj['status']='Erhalten' if qty and received==qty else ('Teilweise erhalten' if received else 'Bestellt')
        obj['received_count']=received
        obj['ordered_count']=qty
        orders.append(obj)
    return {'orders':orders}

def create(db,data):
    vendor=label(data.get('vendor',''),100,'Händler',True)
    reference=label(data.get('reference',''),100,'Bestellnummer')
    ordered_on=label(data.get('ordered_on',''),10,'Bestelldatum')
    if ordered_on:
        try:dt.date.fromisoformat(ordered_on)
        except ValueError:raise ValueError('Ungültiges Bestelldatum.')
    source_type=label(data.get('source_type','manual'),25,'Quelle')
    fingerprint=label(data.get('fingerprint',''),100,'Importkennung')
    if fingerprint and not re.fullmatch(r'[0-9a-f]{64}',fingerprint):
        raise ValueError('Ungültige Importkennung.')
    raw=data.get('lines')
    if not isinstance(raw,list) or not 1<=len(raw)<=100:
        raise ValueError('Mindestens eine, höchstens 100 Positionen erforderlich.')
    discount=num(data.get('discount_cents',0),0,10000000,'Rabatt')
    credit=num(data.get('credit_cents',0),0,10000000,'Guthaben')
    shipping=num(data.get('shipping_cents',0),0,10000000,'Versand')
    total=data.get('total_cents')
    if total is not None:total=num(total,0,100000000,'Rechnungsbetrag')
    now=int(time.time())
    order_id=secrets.token_hex(12)
    if fingerprint:
        duplicate=db.execute("SELECT id FROM pp_filament_orders WHERE fingerprint=?",(fingerprint,)).fetchone()
        if duplicate:raise ValueError('Diese Bestellunterlage wurde bereits importiert. Bitte die gespeicherte Bestellung öffnen.')
    clean=[]
    for entry in raw:
        if not isinstance(entry,dict):raise ValueError('Ungültige Bestellposition.')
        item={k:label(entry.get(k,''),maxlen,k,k in ('brand','material','color'))
              for k,maxlen in [('brand',70),('material',45),('color',70),('manufacturer_code',24),('internal_code',24),('color_hex',7),('packaging',12),('description',200)]}
        item['brand']=canonical_brand(db,item['brand'])
        item['material']=canonical_material(db,item['brand'],item['material'])
        item['quantity']=num(entry.get('quantity'),1,500,'Rollenanzahl')
        item['grams']=num(entry.get('grams'),50,5000,'Gramm pro Rolle')
        item['gross_cents']=entry.get('gross_cents')
        if item['gross_cents'] is not None:item['gross_cents']=num(item['gross_cents'],0,10000000,'Positionspreis')
        if item['color_hex'] and not re.fullmatch(r'#[0-9a-fA-F]{6}',item['color_hex']):
            raise ValueError('HEX-Farbe muss ein sechsstelliger Farbcode sein.')
        if item['internal_code'] and not re.fullmatch(r'[0-9]+(?:[.,][0-9]+)?',item['internal_code']):
            raise ValueError('Interner Farbcode muss numerisch sein.')
        item['internal_code']=item['internal_code'].replace(',','.')
        if item['manufacturer_code'] and not re.fullmatch(r'[A-Za-z0-9._/-]+',item['manufacturer_code']):
            raise ValueError('Herstellercode enthält ungültige Zeichen.')
        if item['packaging'] not in ('spool','refill','unknown'):
            raise ValueError('Unbekannte Verpackungsart.')
        item['filament_id']=entry.get('filament_id')
        if item['filament_id'] is not None:item['filament_id']=num(item['filament_id'],1,999999999,'Filament-Zuordnung')
        item['accept_changes']=entry.get('accept_changes') or []
        if not isinstance(item['accept_changes'],list) or any(f not in ('manufacturer_code','color_hex','brand','material','color') for f in item['accept_changes']):
            raise ValueError('Ungültige Stammdatenänderung.')
        clean.append(item)
    known=[i['gross_cents'] for i in clean]
    if total is not None and all(x is not None for x in known):
        expected=sum(known)-discount-credit+shipping
        if expected!=total and data.get('confirm_total_difference') is not True:
            raise ValueError(f'Positionssumme {expected/100:.2f} € stimmt nicht mit Gesamtbetrag {total/100:.2f} € überein. Bitte korrigieren oder Abweichung ausdrücklich bestätigen.')
    db.execute("""INSERT INTO pp_filament_orders
      (id,vendor,reference,ordered_on,total_cents,discount_cents,credit_cents,shipping_cents,fingerprint,source_type,created,updated)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
      (order_id,vendor,reference,ordered_on,total,discount,credit,shipping,fingerprint,source_type,now,now))
    weights=[v or 0 for v in known]
    # Known price lines receive proportional order-wide discounts (free lines stay free).
    deduction=discount+credit
    if deduction>sum(weights):raise ValueError('Rabatte überschreiten die Positionssumme.')
    allocated=distribute(deduction,weights)
    for item,deduct in zip(clean,allocated):
        fid=item['filament_id']
        matched,ambiguous=suggest_matches(db,item)
        if fid is not None:
            f=db.execute('SELECT * FROM filament_spools WHERE id=?',(fid,)).fetchone()
            if not f:raise ValueError('Filament nicht gefunden.')
            if brand_key(f['brand'])!=brand_key(item['brand']) and 'brand' not in item['accept_changes']:
                raise ValueError('Herstellerabweichung muss ausdrücklich übernommen werden.')
            if material_key(f['material'])!=material_key(item['material']) and 'material' not in item['accept_changes']:
                raise ValueError('Materialabweichung muss ausdrücklich übernommen werden.')
            if matched and matched['id']!=fid:raise ValueError('Filamentzuordnung passt nicht zum Herstellercode.')
        elif ambiguous:raise ValueError('Mehrdeutiges Filament: vorhandene Farbe manuell zuordnen.')
        elif matched:fid=matched['id']
        else:
            # A user must never unintentionally assign a number already
            # belonging to another color; use the existing code picker instead.
            if item['internal_code']:
                existing_code=db.execute('SELECT id,color FROM filament_spools WHERE internal_code=?',
                                        (item['internal_code'],)).fetchone()
                if existing_code:
                    raise ValueError('Interner Code '+item['internal_code']+' gehört bereits zur Farbe '+
                                     existing_code['color']+'. Bitte vorhandenes Filament auswählen.')
            # The source may not contain a HEX code. Use neutral default, not guessed colors.
            db.execute("""INSERT INTO filament_spools
             (brand,color,material,color_hex,price_cents,purchase_url,stock_qty,open_qty,cart_qty,
              internal_code,manufacturer_code,notes,created,updated)
             VALUES (?,?,?,?,NULL,'',0,0,0,?,?,?, ?,?)""",
             (item['brand'],item['color'],item['material'],item['color_hex'] or '#c1c9c1',
              item['internal_code'],item['manufacturer_code'],'Per Bestellung automatisch angelegt',now,now))
            fid=db.execute('SELECT last_insert_rowid()').fetchone()[0]
        if fid and (matched or item['filament_id']):
            old=db.execute('SELECT * FROM filament_spools WHERE id=?',(fid,)).fetchone()
            changes={}
            for field in item['accept_changes']:
                incoming=item[field]
                if incoming and incoming!=old[field]:
                    changes[field]=incoming
            if changes:
                identity=(key(changes.get('brand',old['brand'])),material_key(changes.get('material',old['material'])),key(changes.get('color',old['color'])))
                for candidate in db.execute('SELECT id,brand,material,color FROM filament_spools WHERE id<>?',(fid,)):
                    if identity==(key(candidate['brand']),material_key(candidate['material']),key(candidate['color'])):
                        raise ValueError('Stammdatenänderung würde eine bestehende Farbe duplizieren.')
                sets=','.join(k+'=?' for k in changes)
                db.execute('UPDATE filament_spools SET '+sets+',updated=? WHERE id=?',
                           (*changes.values(),now,fid))
                for name,value in changes.items():
                    db.execute('INSERT INTO pp_filament_catalog_audit (order_id,filament_id,field,old_value,new_value,created) VALUES (?,?,?,?,?,?)',
                               (order_id,fid,name,str(old[name] or ''),value,now))
            # Internal numbers only if manually entered, and never overwrite an existing assignment.
            if item['internal_code'] and not old['internal_code']:
                conflict=db.execute('SELECT id FROM filament_spools WHERE internal_code=? AND id<>?',
                                    (item['internal_code'],fid)).fetchone()
                if conflict:raise ValueError('Interner Farbcode bereits vergeben.')
                db.execute('UPDATE filament_spools SET internal_code=?,updated=? WHERE id=?',
                           (item['internal_code'],now,fid))
        effective=item['gross_cents']-deduct if item['gross_cents'] is not None else None
        if effective is not None and effective<0:raise ValueError('Negativer Positionspreis.')
        db.execute("""INSERT INTO pp_filament_order_lines
          (order_id,filament_id,quantity,grams,packaging,gross_cents,effective_cents,description,created)
          VALUES (?,?,?,?,?,?,?,?,?)""",(order_id,fid,item['quantity'],item['grams'],
          item['packaging'],item['gross_cents'],effective,item['description'],now))
    return order_id

def complete_missing_purchase_data(db,data):
    """Complete missing supplier/price data after receipt; never add stock again.

    Costs are reconstructed only for lines whose gross price was previously
    unknown. Already recorded costs and nonempty catalog prices are immutable.
    """
    order_id=label(data.get('order_id',''),50,'Bestellung',True)
    order=db.execute('SELECT * FROM pp_filament_orders WHERE id=?',(order_id,)).fetchone()
    if not order:raise ValueError('Bestellung nicht gefunden. Bitte aktualisieren.')
    vendor=label(data.get('vendor',''),100,'Händler',True)
    if order['vendor'] not in ('Unbekannter Händler','') and vendor!=order['vendor']:
        raise ValueError('Ein bereits erfasster Händler kann hier nicht überschrieben werden.')
    raw=data.get('lines')
    if not isinstance(raw,list) or not raw:raise ValueError('Bitte Einkaufspositionen übergeben.')
    existing=[dict(r) for r in db.execute('SELECT * FROM pp_filament_order_lines WHERE order_id=? ORDER BY id',(order_id,))]
    if len(raw)!=len(existing):raise ValueError('Die Bestellung wurde verändert. Bitte neu öffnen.')
    incoming={}
    for item in raw:
        if not isinstance(item,dict):raise ValueError('Ungültige Einkaufsposition.')
        lid=num(item.get('id'),1,999999999,'Position')
        if lid in incoming:raise ValueError('Doppelte Einkaufsposition.')
        incoming[lid]=item
    changed=[]
    prices=[]
    for line in existing:
        item=incoming.get(line['id'])
        if not item:raise ValueError('Einkaufsposition fehlt. Bitte aktualisieren.')
        before=item.get('expected_gross_cents')
        if before is not None:before=num(before,0,10000000,'Bisheriger Preis')
        if before!=line['gross_cents']:
            raise ValueError('Einkaufspreis wurde zwischenzeitlich verändert. Bitte neu öffnen.')
        amount=item.get('gross_cents')
        if amount is not None:amount=num(amount,0,10000000,'Positionspreis')
        if line['gross_cents'] is not None and amount!=line['gross_cents']:
            raise ValueError('Vorhandene Einkaufspreise bleiben unverändert.')
        if line['gross_cents'] is None and amount is not None:changed.append((line,amount))
        prices.append(amount)
    if changed and (order['discount_cents'] or order['credit_cents'] or order['shipping_cents']):
        raise ValueError('Bei bereits gebuchten Bestellungen mit weiteren Rabatten oder Versandkosten bitte die Kostenaufteilung prüfen lassen.')
    if order['total_cents'] is not None and all(x is not None for x in prices):
        if sum(prices)!=order['total_cents']:
            raise ValueError('Positionspreise ergeben nicht den gespeicherten Rechnungsbetrag. Bitte Werte prüfen.')
    now=int(time.time())
    for line,amount in changed:
        receipts=[dict(r) for r in db.execute(
            'SELECT id,quantity,cost_cents FROM pp_filament_cost_history WHERE line_id=? ORDER BY created,id',
            (line['id'],))]
        if any(r['cost_cents'] is not None for r in receipts):
            raise ValueError('Diese Einkaufsposition hat bereits Kostenwerte. Keine rückwirkende Änderung möglich.')
        count=0
        for receipt in receipts:
            following=count+receipt['quantity']
            cost=round(amount*following/line['quantity'])-round(amount*count/line['quantity'])
            db.execute('UPDATE pp_filament_cost_history SET cost_cents=? WHERE id=?',(cost,receipt['id']))
            count=following
        if count!=line['received']:raise ValueError('Wareneingangshistorie stimmt nicht überein. Keine Änderung vorgenommen.')
        db.execute('UPDATE pp_filament_order_lines SET gross_cents=?,effective_cents=? WHERE id=?',
                   (amount,amount,line['id']))
        if line['received']:
            # Existing manual or more recent prices always win.
            db.execute('UPDATE filament_spools SET price_cents=?,updated=? WHERE id=? AND price_cents IS NULL',
                       (round(amount/line['quantity']),now,line['filament_id']))
    if order['total_cents'] is None and all(x is not None for x in prices):
        db.execute('UPDATE pp_filament_orders SET total_cents=? WHERE id=?',(sum(prices),order_id))
    db.execute('UPDATE pp_filament_orders SET vendor=?,updated=? WHERE id=?',(vendor,now,order_id))
    return {'order_id':order_id,'updated_prices':len(changed)}

def correct_quantity(db,data):
    """Correct an unreceived order line without changing stock or its total price.

    A historic receipt has a quantity-based cost split, so correcting a booked
    line would silently rewrite the meaning of its inventory valuation.
    """
    order_id=label(data.get('order_id',''),50,'Bestellung',True)
    line_id=num(data.get('line_id'),1,999999999,'Position')
    quantity=num(data.get('quantity'),1,500,'Bestellte Rollen')
    expected=num(data.get('expected_quantity'),1,500,'Bisherige Bestellmenge')
    line=db.execute('SELECT id,quantity,received FROM pp_filament_order_lines WHERE id=? AND order_id=?',
                    (line_id,order_id)).fetchone()
    if not line:raise ValueError('Bestellposition nicht gefunden. Bitte aktualisieren.')
    if line['quantity']!=expected:
        raise ValueError('Die Bestellmenge wurde zwischenzeitlich verändert. Bitte neu öffnen.')
    if line['received'] or db.execute(
        'SELECT 1 FROM pp_filament_cost_history WHERE line_id=? LIMIT 1',(line_id,)).fetchone():
        raise ValueError('Bei bereits eingebuchten Rollen ist eine nachträgliche Mengenkorrektur gesperrt.')
    if quantity!=expected:
        db.execute('UPDATE pp_filament_order_lines SET quantity=? WHERE id=?',(quantity,line_id))
        db.execute('UPDATE pp_filament_orders SET updated=? WHERE id=?',(int(time.time()),order_id))
    return {'line_id':line_id,'quantity':quantity,'remaining':quantity}


def receive(db,data):
    order_id=label(data.get('order_id',''),50,'Bestellung',True)
    request_key=label(data.get('request_key',''),100,'Buchungskennung',True)
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',request_key):
        raise ValueError('Ungültige Buchungskennung.')
    prior=db.execute('SELECT id FROM pp_filament_receipts WHERE request_key=?',(request_key,)).fetchone()
    if prior:return prior['id']
    if not db.execute('SELECT 1 FROM pp_filament_orders WHERE id=?',(order_id,)).fetchone():
        raise ValueError('Bestellung nicht gefunden.')
    quantities=data.get('lines')
    if not isinstance(quantities,list) or not quantities:raise ValueError('Keine erhaltenen Rollen ausgewählt.')
    seen=set();changes=[];now=int(time.time())
    for entry in quantities:
        if not isinstance(entry,dict):raise ValueError('Ungültige Wareneingangsposition.')
        line_id=num(entry.get('id'),1,999999999,'Position')
        if line_id in seen:raise ValueError('Doppelte Wareneingangsposition.')
        seen.add(line_id)
        qty=num(entry.get('quantity'),0,500,'Erhaltene Rollen')
        before=num(entry.get('expected_received'),0,500,'Veraltete Mengenprüfung')
        line=db.execute('SELECT * FROM pp_filament_order_lines WHERE id=? AND order_id=?',(line_id,order_id)).fetchone()
        if not line:raise ValueError('Position nicht gefunden.')
        if line['received']!=before:raise ValueError('Die Bestellung wurde zwischenzeitlich verändert. Bitte neu öffnen.')
        if qty>line['quantity']-before:raise ValueError('Mehr Rollen als bestellt ausgewählt.')
        if qty:changes.append((line,qty))
    if not changes:raise ValueError('Bitte mindestens eine erhaltene Rolle auswählen.')
    receipt_id=secrets.token_hex(12)
    for line,qty in changes:
        db.execute('UPDATE pp_filament_order_lines SET received=received+? WHERE id=?',
                   (qty,line['id']))
        # Exact cumulative rounding prevents price drift over partial receipts.
        cost=None
        if line['effective_cents'] is not None:
            old=round(line['effective_cents']*line['received']/line['quantity'])
            new=round(line['effective_cents']*(line['received']+qty)/line['quantity'])
            cost=new-old
        f=db.execute('SELECT stock_qty,cart_qty,price_cents FROM filament_spools WHERE id=?',
                     (line['filament_id'],)).fetchone()
        if not f or f['stock_qty']+qty>100000:raise ValueError('Filamentbestand überschreitet das Limit.')
        # Capture an original catalog price only before the first purchase receipt.
        # Already-recorded receipts serve as historical price sources.
        prior=db.execute('SELECT 1 FROM pp_filament_cost_history WHERE filament_id=? LIMIT 1',
                         (line['filament_id'],)).fetchone()
        if not prior:
            db.execute('INSERT OR IGNORE INTO pp_filament_price_baselines (filament_id,price_cents,created) VALUES (?,?,?)',
                       (line['filament_id'],f['price_cents'],now))
        # Free promotional spools have a zero actual cost, but never replace
        # the reference / last paid price with zero.
        paid=(round(line['effective_cents']/line['quantity'])
              if line['effective_cents'] is not None and line['effective_cents']>0 else None)
        db.execute("""UPDATE filament_spools SET stock_qty=stock_qty+?,
          cart_qty=MAX(0,cart_qty-?),price_cents=COALESCE(?,price_cents),updated=? WHERE id=?""",
          (qty,qty,paid,now,line['filament_id']))
        db.execute("""INSERT INTO pp_filament_cost_history
          (receipt_id,line_id,filament_id,quantity,cost_cents,created) VALUES (?,?,?,?,?,?)""",
          (receipt_id,line['id'],line['filament_id'],qty,cost,now))
    db.execute('INSERT INTO pp_filament_receipts (id,order_id,request_key,quantities_json,created) VALUES (?,?,?,?,?)',
      (receipt_id,order_id,request_key,json.dumps([{'line':l['id'],'quantity':q} for l,q in changes]),now))
    db.execute('UPDATE pp_filament_orders SET updated=? WHERE id=?',(now,order_id))
    return receipt_id

def delete_order(db,data):
    """Atomically delete a purchase, reverse received stock and restore valid unit prices."""
    order_id=label(data.get('order_id',''),50,'Bestellung',True)
    order=db.execute('SELECT id FROM pp_filament_orders WHERE id=?',(order_id,)).fetchone()
    if not order:raise ValueError('Bestellung existiert nicht mehr. Bitte die Liste aktualisieren.')
    lines=[dict(row) for row in db.execute(
      'SELECT id,filament_id,quantity,received FROM pp_filament_order_lines WHERE order_id=?',(order_id,))]
    actual_received=sum(row['received'] for row in lines)
    expected=data.get('expected_received_count')
    if expected is not None and num(expected,0,100000,'Erwarteter Wareneingang')!=actual_received:
        raise ValueError('Der Wareneingang wurde zwischenzeitlich verändert. Bitte die Bestellung erneut öffnen.')
    by_spool={}
    for line in lines:
        fid=line['filament_id']
        by_spool[fid]=by_spool.get(fid,0)+line['received']
        booked=db.execute('SELECT COALESCE(SUM(quantity),0) FROM pp_filament_cost_history WHERE line_id=?',
                          (line['id'],)).fetchone()[0]
        if booked!=line['received']:
            raise ValueError('Buchungshistorie ist unvollständig. Bestellung aus Sicherheitsgründen nicht gelöscht.')
    changes={}
    for fid,received in by_spool.items():
        if not received:continue  # A saved-but-unreceived order never changed stock or unit prices.
        spool=db.execute('SELECT stock_qty,price_cents,color,material FROM filament_spools WHERE id=?',(fid,)).fetchone()
        if not spool:raise ValueError('Filament zur Bestellung existiert nicht mehr.')
        if spool['stock_qty']<received:
            raise ValueError(
              f"{spool['material']} {spool['color']}: {received} Rolle(n) aus der Bestellung eingebucht, "
              f"aber nur {spool['stock_qty']} im Lager. Löschen ohne negativen Lagerbestand nicht möglich.")
        # Respect a later manually edited unit price.
        latest=db.execute("""
          SELECT l.effective_cents,l.quantity
          FROM pp_filament_cost_history h
          JOIN pp_filament_order_lines l ON l.id=h.line_id
          WHERE h.filament_id=? AND l.effective_cents>0
          ORDER BY h.created DESC,h.id DESC LIMIT 1""",(fid,)).fetchone()
        manually_changed=bool(latest and spool['price_cents'] != round(latest['effective_cents']/latest['quantity']))
        remaining=db.execute("""
          SELECT l.effective_cents,l.quantity
          FROM pp_filament_cost_history h
          JOIN pp_filament_order_lines l ON l.id=h.line_id
          WHERE h.filament_id=? AND l.order_id<>? AND l.effective_cents>0
          ORDER BY h.created DESC,h.id DESC LIMIT 1""",(fid,order_id)).fetchone()
        if remaining:
            new_price=round(remaining['effective_cents']/remaining['quantity'])
        else:
            baseline=db.execute('SELECT price_cents FROM pp_filament_price_baselines WHERE filament_id=?',(fid,)).fetchone()
            new_price=baseline['price_cents'] if baseline else None
        changes[fid]=(received,spool['price_cents'] if manually_changed else new_price)
    now=int(time.time())
    for fid,(received,price) in changes.items():
        db.execute('UPDATE filament_spools SET stock_qty=stock_qty-?,price_cents=?,updated=? WHERE id=?',
                   (received,price,now,fid))
    db.execute('DELETE FROM pp_filament_cost_history WHERE line_id IN (SELECT id FROM pp_filament_order_lines WHERE order_id=?)',(order_id,))
    db.execute('DELETE FROM pp_filament_receipts WHERE order_id=?',(order_id,))
    db.execute('DELETE FROM pp_filament_order_lines WHERE order_id=?',(order_id,))
    db.execute('DELETE FROM pp_filament_orders WHERE id=?',(order_id,))
    return {'reversed_spools':actual_received,
            'price_recalculated':sum(1 for _,price in changes.values() if price is not None),
            'price_unknown':sum(1 for _,price in changes.values() if price is None)}
