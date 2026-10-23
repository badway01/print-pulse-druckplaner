"""Optional component inventory for all Etsy products.

Physical component stock is separate from finished-product stock. Each order line
uses a stable Etsy transaction ID and component ID; no variation guesses are made.
"""
import json
import re
import secrets
import time


def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_components(
        id TEXT PRIMARY KEY,listing_id TEXT NOT NULL,name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('stock','demand')),
        property_name TEXT NOT NULL DEFAULT '',
        quantity_property TEXT NOT NULL DEFAULT '',
        units INTEGER NOT NULL DEFAULT 1 CHECK(units BETWEEN 1 AND 100),
        stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pp_components_listing ON pp_components(listing_id);
    CREATE TABLE IF NOT EXISTS pp_component_orders(
        transaction_id TEXT NOT NULL,component_id TEXT NOT NULL,
        booked INTEGER NOT NULL DEFAULT 0 CHECK(booked>=0),
        printing INTEGER NOT NULL DEFAULT 0 CHECK(printing>=0),
        finished INTEGER NOT NULL DEFAULT 0 CHECK(finished>=0),
        consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed>=0),
        PRIMARY KEY(transaction_id,component_id)
    );
    """)
    listings={col['name'] for col in db.execute('PRAGMA table_info(stock_listings)')}
    if 'components_enabled' not in listings:
        db.execute('ALTER TABLE stock_listings ADD COLUMN components_enabled INTEGER NOT NULL DEFAULT 0')
    orders={col['name'] for col in db.execute('PRAGMA table_info(stock_order_prints)')}
    if 'assembled' not in orders:
        db.execute('ALTER TABLE stock_order_prints ADD COLUMN assembled INTEGER NOT NULL DEFAULT 0 CHECK(assembled>=0)')
    part_columns={col['name'] for col in db.execute('PRAGMA table_info(pp_components)')}
    if 'target_stock' not in part_columns:
        db.execute('ALTER TABLE pp_components ADD COLUMN target_stock INTEGER NOT NULL DEFAULT 0 CHECK(target_stock>=0)')


def option(line, name):
    if not name:
        return ''
    for entry in str(line.get('variant') or '').split(' · '):
        prop,sep,value=entry.partition(': ')
        if sep and prop.strip().casefold()==name.casefold():
            return value.strip()
    return ''


def requirement(part,line):
    quantity=int(line.get('quantity') or 0)
    label=''
    if part['property_name']:
        label=option(line,part['property_name'])
        if not label:
            return 0,'','Etsy-Eigenschaft „'+part['property_name']+'“ fehlt.'
    per_unit=int(part['units'])
    if part['quantity_property']:
        qty=option(line,part['quantity_property'])
        match=re.search(r'\d+',qty)
        if not match:
            return 0,label,'Setgröße aus „'+part['quantity_property']+'“ nicht erkennbar.'
        size=int(match.group())
        if not 1<=size<=50:
            return 0,label,'Setgröße muss zwischen 1 und 50 liegen.'
        per_unit*=size
    required=quantity*per_unit
    if not 1<=required<=100000:
        return 0,label,'Bauteilmenge ungültig oder zu groß.'
    return required,label,''


def snapshot(db,products,orders):
    parts=[dict(x) for x in db.execute('SELECT * FROM pp_components ORDER BY name COLLATE NOCASE,id')]
    jobs={(x['transaction_id'],x['component_id']):dict(x)
          for x in db.execute('SELECT * FROM pp_component_orders')}
    group={}
    for part in parts:
        group.setdefault(part['listing_id'],[]).append(part)
    enabled={}
    for product in products:
        product['components']=group.get(product['id'],[])
        enabled[product['id']]=bool(product.get('components_enabled'))
    for order in orders:
        for line in order['items']:
            line['components_enabled']=enabled.get(str(line.get('listing_id') or ''),False)
            line['components']=[]
            if not line['components_enabled'] or not line.get('item_id'):
                continue
            for part in group.get(str(line.get('listing_id') or ''),[]):
                total,label,error=requirement(part,line)
                job=jobs.get((str(line['transaction_id']),part['id']),{})
                state={k:int(job.get(k,0)) for k in ('booked','printing','finished','consumed')}
                available=(state['booked'] if part['kind']=='stock' else state['finished'])-state['consumed']
                line['components'].append({
                    'id':part['id'],'name':part['name'],'kind':part['kind'],'label':label,
                    'stock':part['stock'],'required':total,'error':error,
                    'available':max(0,available),**state})
    return products,orders


def recover_cancelled(db,tid):
    """Return unused reserved physical parts when Etsy cancels a transaction."""
    rows=db.execute("""SELECT w.component_id,w.booked,w.consumed,p.kind FROM pp_component_orders w
        JOIN pp_components p ON p.id=w.component_id
        WHERE w.transaction_id=?""",(tid,)).fetchall()
    for job in rows:
        if job['kind']=='stock' and job['booked']>job['consumed']:
            db.execute('UPDATE pp_components SET stock=stock+? WHERE id=?',
                       (job['booked']-job['consumed'],job['component_id']))
    db.execute('DELETE FROM pp_component_orders WHERE transaction_id=?',(tid,))


def mutate(db,data,whole):
    action=str(data.get('action') or '')
    listing_id=str(data.get('listing_id') or '')
    if action in ('toggle','save','delete','stock'):
        listing=db.execute('SELECT * FROM stock_listings WHERE id=?',(listing_id,)).fetchone()
        if not listing: raise ValueError('Produkt nicht gefunden.')
        if action=='toggle':
            if type(data.get('enabled')) is not bool: raise ValueError('Schalterwert ungültig.')
            if not data['enabled']:
                pending=db.execute("""SELECT 1 FROM pp_component_orders w
                    JOIN pp_components p ON p.id=w.component_id
                    WHERE p.listing_id=? AND (w.booked>w.consumed OR w.printing>0 OR w.finished>w.consumed)
                    LIMIT 1""",(listing_id,)).fetchone()
                if pending: raise ValueError('Zuerst offene Bauteilbuchungen abschließen oder zurückgeben.')
            db.execute('UPDATE stock_listings SET components_enabled=? WHERE id=?',
                       (int(data['enabled']),listing_id))
            return
        cid=str(data.get('id') or '')
        old=db.execute('SELECT * FROM pp_components WHERE id=? AND listing_id=?',(cid,listing_id)).fetchone() if cid else None
        if action=='save':
            name=str(data.get('name') or '').strip()[:100]
            kind=str(data.get('kind') or '')
            prop=str(data.get('property_name') or '').strip()[:100]
            qty_prop=str(data.get('quantity_property') or '').strip()[:100]
            units=whole(data.get('units'),1,100)
            target_stock=whole(data.get('target_stock',old['target_stock'] if old else 0),0,100000)
            if kind=='demand': target_stock=0
            if not name or kind not in ('stock','demand'): raise ValueError('Bauteilname und Art fehlen.')
            if kind=='stock' and prop: raise ValueError('Ein Standardbauteil braucht keine Farbvariation.')
            if old:
                if old['kind']=='stock' and kind!='stock' and old['stock']>0:
                    raise ValueError('Vor Umstellung zuerst den vorhandenen Bauteilbestand auf 0 korrigieren.')
                used=db.execute('SELECT 1 FROM pp_component_orders WHERE component_id=? LIMIT 1',(cid,)).fetchone()
                if used and any((old[k]!=v for k,v in [
                    ('kind',kind),('property_name',prop),('quantity_property',qty_prop),('units',units)])):
                    raise ValueError('Dieses Bauteil wird bereits in Aufträgen genutzt. Die Stückliste bleibt unverändert.')
                db.execute("""UPDATE pp_components SET name=?,kind=?,property_name=?,
                    quantity_property=?,units=?,target_stock=?,updated=? WHERE id=?""",
                    (name,kind,prop,qty_prop,units,target_stock,int(time.time()),cid))
            else:
                db.execute("""INSERT INTO pp_components
                    (id,listing_id,name,kind,property_name,quantity_property,units,stock,target_stock,updated)
                    VALUES(?,?,?,?,?,?,?,0,?,?)""",
                    (secrets.token_hex(12),listing_id,name,kind,prop,qty_prop,units,target_stock,int(time.time())))
        elif action=='delete':
            if not old: raise ValueError('Bauteil nicht gefunden.')
            if old['stock']>0:
                raise ValueError('Bauteil hat noch Lagerbestand. Vor dem Löschen den Bestand klären und auf 0 setzen.')
            if db.execute('SELECT 1 FROM pp_component_orders WHERE component_id=? LIMIT 1',(cid,)).fetchone():
                raise ValueError('Bauteil ist bereits mit Aufträgen verknüpft und kann nicht gelöscht werden.')
            db.execute('DELETE FROM pp_components WHERE id=?',(cid,))
        elif action=='stock':
            if not old or old['kind']!='stock': raise ValueError('Vorratsbauteil nicht gefunden.')
            qty=whole(data.get('stock'),0,100000)
            db.execute('UPDATE pp_components SET stock=?,updated=? WHERE id=?',(qty,int(time.time()),cid))
        return

    tid=str(data.get('transaction_id') or '')
    tx=db.execute('SELECT * FROM stock_transactions WHERE id=?',(tid,)).fetchone()
    if not tx or tx['status']!='open':
        raise ValueError('Dieser Etsy-Auftrag ist nicht mehr offen.')
    listing=db.execute('SELECT * FROM stock_listings WHERE id=?',(tx['listing_id'],)).fetchone()
    if not listing or not listing['components_enabled']:
        raise ValueError('Bauteil-Vorproduktion ist nicht aktiviert.')
    source=db.execute('SELECT lines_json FROM stock_receipts WHERE id=?',(tx['receipt_id'],)).fetchone()
    lines=json.loads(source['lines_json']) if source else []
    line=next((x for x in lines if str(x.get('transaction_id'))==tid),None)
    if not line or not tx['item_id']:
        raise ValueError('Etsy-Bestellvariante nicht eindeutig zugeordnet.')
    parts=[dict(x) for x in db.execute(
        'SELECT * FROM pp_components WHERE listing_id=?',(tx['listing_id'],))]
    if not parts: raise ValueError('Bitte zuerst Bauteile im Produktkatalog anlegen.')
    existing=db.execute('SELECT * FROM stock_order_prints WHERE transaction_id=?',(tid,)).fetchone()
    if existing and (existing['printing'] or existing['finished'] or existing['allocated']):
        raise ValueError('Diese Position nutzt bereits die klassische Lager-/Druckverwaltung.')

    if action=='assemble':
        count=whole(data.get('quantity'),1,10000)
        assembled=existing['assembled'] if existing else 0
        if count>tx['qty']-assembled: raise ValueError('Mehr Einheiten als im Auftrag noch offen.')
        to_consume=[]
        for part in parts:
            required,_,err=requirement(part,line)
            if err: raise ValueError(err)
            job=db.execute('SELECT * FROM pp_component_orders WHERE transaction_id=? AND component_id=?',
                           (tid,part['id'])).fetchone()
            units=count*(required//tx['qty'])
            available=((job['booked'] if part['kind']=='stock' else job['finished'])-job['consumed']) if job else 0
            if available<units: raise ValueError('Bauteil fehlt: '+part['name'])
            to_consume.append((units,tid,part['id']))
        for units,tid,cid in to_consume:
            db.execute("""UPDATE pp_component_orders SET consumed=consumed+?
                WHERE transaction_id=? AND component_id=?""",(units,tid,cid))
        # Made-to-order assemblies are assigned to this order, never inserted
        # as general finished inventory or deducted a second time on shipping.
        db.execute("""INSERT INTO stock_order_prints
            (transaction_id,receipt_id,item_id,printing,finished,allocated,assembled,updated)
            VALUES(?,?,?,0,0,0,?,?) ON CONFLICT(transaction_id) DO UPDATE
            SET assembled=assembled+excluded.assembled,updated=excluded.updated""",
            (tid,tx['receipt_id'],tx['item_id'],count,int(time.time())))
        return
    cid=str(data.get('component_id') or '')
    part=next((x for x in parts if x['id']==cid),None)
    if not part: raise ValueError('Bauteil nicht gefunden.')
    required,_,error=requirement(part,line)
    if error: raise ValueError(error)
    job=db.execute('SELECT * FROM pp_component_orders WHERE transaction_id=? AND component_id=?',
                   (tid,cid)).fetchone()
    booked=job['booked'] if job else 0
    printing=job['printing'] if job else 0
    finished=job['finished'] if job else 0
    consumed=job['consumed'] if job else 0
    qty=whole(data.get('quantity'),1,100000)
    if action=='book':
        if part['kind']!='stock' or qty>required-booked or qty>part['stock']:
            raise ValueError('Nicht genügend freie Vorratsbauteile für diese Bestellung.')
        db.execute('UPDATE pp_components SET stock=stock-? WHERE id=?',(qty,cid))
        booked+=qty
    elif action=='release':
        if part['kind']!='stock' or qty>booked-consumed: raise ValueError('Nur unmontierte Bauteile freigeben.')
        booked-=qty
        db.execute('UPDATE pp_components SET stock=stock+? WHERE id=?',(qty,cid))
    elif action=='start':
        if part['kind']!='demand' or qty>required-printing-finished:
            raise ValueError('Bauteil ist bereits in ausreichender Menge vorgesehen.')
        printing+=qty
    elif action in ('finish','cancel'):
        if part['kind']!='demand' or qty>printing:
            raise ValueError('Keine entsprechende Menge im Druck.')
        printing-=qty
        if action=='finish': finished+=qty
    else:
        raise ValueError('Unbekannte Bauteil-Aktion.')
    db.execute("""INSERT INTO pp_component_orders
        (transaction_id,component_id,booked,printing,finished,consumed)
        VALUES(?,?,?,?,?,?) ON CONFLICT(transaction_id,component_id) DO UPDATE SET
        booked=excluded.booked,printing=excluded.printing,finished=excluded.finished,
        consumed=excluded.consumed""",(tid,cid,booked,printing,finished,consumed))
