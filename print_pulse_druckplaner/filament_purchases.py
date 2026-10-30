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
    brand=key(line.get('brand'))
    material=material_key(line.get('material'))
    code=key(line.get('manufacturer_code'))
    name=key(line.get('color'))
    if brand=='bambulab' and material=='plabasic' and name in ('white','weiss','jadewhite'):
        name='jadeweiss'
    if brand=='bambulab' and name=='ivorywhite':name='elfenbeinweiss'
    exact=[]
    for row in rows:
        if key(row['brand'])!=brand or material_key(row['material'])!=material:continue
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
    for name in ('amazon','sunlu','polymaker','prusament','elegoo','ebay','3djake','esun'):
        if name in head:return {'esun':'eSUN','ebay':'eBay'}.get(name,name.capitalize())
    return 'Unbekannter Händler'

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
            if key(f['brand'])!=key(item['brand']) and 'brand' not in item['accept_changes']:
                raise ValueError('Herstellerabweichung muss ausdrücklich übernommen werden.')
            if material_key(f['material'])!=material_key(item['material']) and 'material' not in item['accept_changes']:
                raise ValueError('Materialabweichung muss ausdrücklich übernommen werden.')
            if matched and matched['id']!=fid:raise ValueError('Filamentzuordnung passt nicht zum Herstellercode.')
        elif ambiguous:raise ValueError('Mehrdeutiges Filament: vorhandene Farbe manuell zuordnen.')
        elif matched:fid=matched['id']
        else:
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
        f=db.execute('SELECT stock_qty,cart_qty FROM filament_spools WHERE id=?',
                     (line['filament_id'],)).fetchone()
        if not f or f['stock_qty']+qty>100000:raise ValueError('Filamentbestand überschreitet das Limit.')
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
