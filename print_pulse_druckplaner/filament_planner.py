"""Additive, read-only planning of filament purchases from actual Etsy sales.

The planner does not change production or stock. Missing print weights default to
50 g per sold unit, but material is not assigned to a colour by guessing.
"""
import datetime as dt
import json
import math
import re
import time
import unicodedata

DEFAULT_GRAMS = 50
SHOP_START = int(dt.datetime(2025, 7, 1, tzinfo=dt.timezone.utc).timestamp())


def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_filament_sales(
      transaction_id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL,
      listing_id TEXT NOT NULL, product_id TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '', variant_text TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK(quantity>0),
      created INTEGER NOT NULL, status TEXT NOT NULL,
      updated INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS pp_filament_sales_created ON pp_filament_sales(created);
    CREATE TABLE IF NOT EXISTS pp_filament_history_state(
      id INTEGER PRIMARY KEY CHECK(id=1),
      checked_at INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0);
    """)


def record_synced(db, rows):
    """Persist regular Etsy sync before its transient transaction table expires."""
    now = int(time.time())
    for tid, rid, lid, pid, sig, qty, created, status in rows:
        if not str(tid).isdigit() or not str(rid).isdigit():
            continue
        db.execute("""INSERT INTO pp_filament_sales
          (transaction_id,receipt_id,listing_id,product_id,signature,variant_text,quantity,created,status,updated)
          VALUES (?,?,?,?,?,'',?,?,?,?)
          ON CONFLICT(transaction_id) DO UPDATE SET
          product_id=excluded.product_id,signature=excluded.signature,
          quantity=excluded.quantity,created=excluded.created,
          status=excluded.status,updated=excluded.updated""",
          (tid,rid,lid,pid,sig,qty,created,status,now))


def backfill_existing(db):
    """Recover what is still present in the regular order table on first update."""
    now = int(time.time())
    db.execute("""INSERT OR IGNORE INTO pp_filament_sales
      (transaction_id,receipt_id,listing_id,quantity,created,status,updated)
      SELECT id,receipt_id,listing_id,qty,created,status,? FROM stock_transactions
      WHERE receipt_id NOT LIKE 'LOK-%'""", (now,))


def record_history_receipt(db, receipt, signature_fn, status_fn):
    status = status_fn(receipt)
    rid = str(receipt.get('receipt_id') or '')
    if not rid.isdecimal():
        return 0
    created = int(receipt.get('create_timestamp') or receipt.get('created_timestamp') or 0)
    if created <= 0:
        return 0
    count = 0
    for tx in receipt.get('transactions') or []:
        tid, lid = str(tx.get('transaction_id') or ''), str(tx.get('listing_id') or '')
        if not tid.isdecimal() or not lid.isdecimal():
            continue
        qty = tx.get('quantity')
        if type(qty) is not int or not 1 <= qty <= 100000:
            continue
        opts = []
        for p in tx.get('variations') or []:
            name = str(p.get('formatted_name') or p.get('property_name') or '').strip()
            value = str(p.get('formatted_value') or p.get('value') or '').strip()
            if name and value:
                opts.append(name + ': ' + value)
        db.execute("""INSERT INTO pp_filament_sales
          (transaction_id,receipt_id,listing_id,product_id,signature,variant_text,quantity,created,status,updated)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(transaction_id) DO UPDATE SET
          product_id=excluded.product_id,signature=excluded.signature,
          variant_text=excluded.variant_text,quantity=excluded.quantity,
          created=excluded.created,status=excluded.status,updated=excluded.updated""",
          (tid,rid,lid,str(tx.get('product_id') or ''),
           signature_fn(tx.get('variations'), True), ' · '.join(opts),
           qty,created,status,int(time.time())))
        count += 1
    return count


def _norm(s):
    value = unicodedata.normalize('NFKD',str(s or '').casefold().replace('ß','ss'))
    return ''.join(c for c in value if c.isalnum() and not unicodedata.combining(c))


def _colors_from_sale(sale, filaments, static_parts):
    """Only explicit variant colour options and recorded fixed component colours."""
    names = []
    for chunk in str(sale.get('variant_text') or '').split(' · '):
        prop, sep, value = chunk.partition(': ')
        if sep and any(x in _norm(prop) for x in ('farbe','color','colour','filament')):
            names.append(value)
    for part in static_parts.get(sale['listing_id'], []):
        if not part['property_name'] and part['color']:
            names.extend([part['color']] * min(25, max(1,part['units'])))
    found = []
    for name in names:
        target = _norm(name)
        if not target:
            continue
        candidates = [f for f in filaments if target in
            {_norm(f['color']),_norm(f.get('internal_code')),_norm(f.get('manufacturer_code'))}
            and (target != _norm(f.get('internal_code')) or bool(f.get('internal_code')))]
        if len(candidates) == 1:
            found.append(candidates[0]['id'])
    return found


def _profiles(db):
    profiles = {}
    for row in db.execute("""SELECT listing_id,variant_id,status,materials_json,fields_json,updated
        FROM pp_cost_profiles ORDER BY (status='approved') DESC,updated DESC"""):
        key = (row['listing_id'],row['variant_id'])
        if key in profiles:
            continue
        try:
            mats = json.loads(row['materials_json'])
            fields = json.loads(row['fields_json'])
            units = int(fields.get('batch_units') or 1)
            if not 1 <= units <= 1000 or not isinstance(mats,list):
                continue
            weights = []
            for mat in mats:
                fid = int(mat['filament_id'])
                grams = float(mat['grams'])
                if math.isfinite(grams) and 0 < grams <= 20000:
                    weights.append((fid,grams/units))
            if weights:
                profiles[key] = weights
        except (TypeError,ValueError,KeyError,OverflowError,AttributeError):
            continue
    return profiles


def _master_colours(db):
    """Safely use saved HA master/AMS colour assignments when unambiguous.

    Different printers may have different 3MF filament layouts. Reject
    conflicting assignments rather than counting unrelated loaded spools.
    """
    options={}
    for row in db.execute('SELECT listing_id,variant_id,sources_json FROM pp_master_filament_profiles'):
        ids=set()
        try:
            sources=json.loads(row['sources_json'])
            if not isinstance(sources,list):
                continue
            for source in sources:
                for sid in source.get('slots',[]):
                    if sid not in (None,''):
                        ids.add(int(sid))
        except (ValueError,TypeError,AttributeError):
            continue
        if not ids:
            continue
        key=(row['listing_id'],row['variant_id'])
        options.setdefault(key,[]).append(frozenset(ids))
    result={}
    for key,choices in options.items():
        if len(set(choices))==1:
            result[key]=list(choices[0])
    return result


def plan(db, spools=14, days=60, default_grams=DEFAULT_GRAMS):
    if type(spools) is not int or not 1 <= spools <= 100:
        raise ValueError('Bitte 1 bis 100 Spulen wählen.')
    if type(days) is not int or not 7 <= days <= 180:
        raise ValueError('Bitte 7 bis 180 Tage wählen.')
    if type(default_grams) is not int or not 5 <= default_grams <= 500:
        raise ValueError('Der Schätzwert muss zwischen 5 und 500 g liegen.')
    filaments=[dict(r) for r in db.execute('SELECT * FROM filament_spools ORDER BY brand,color')]
    by_id={f['id']:f for f in filaments}
    profiles=_profiles(db)
    master=_master_colours(db)
    parts={}
    for r in db.execute('SELECT listing_id,property_name,color,units FROM pp_components'):
        parts.setdefault(r['listing_id'],[]).append(dict(r))
    items=[dict(r) for r in db.execute('SELECT id,listing_id,product_id,signature FROM stock_items')]
    by_listing={}
    for i in items: by_listing.setdefault(i['listing_id'],[]).append(i)
    now=int(time.time())
    cutoff=now-90*86400
    sold=[dict(r) for r in db.execute("""SELECT * FROM pp_filament_sales
       WHERE status IN ('open','shipped') AND created>=?""",(cutoff,))]
    grams_30,grams_90,open_g={}, {}, {}
    exact_g=estimated_g=unassigned_g=0.0
    sold_items=unassigned_items=0
    for sale in sold:
        qty=sale['quantity']
        sold_items+=qty
        is30=sale['created']>=now-30*86400
        matches=[i for i in by_listing.get(sale['listing_id'],[])
                 if (sale['product_id'] and i['product_id']==sale['product_id'])
                 or (sale['signature'] and i['signature']==sale['signature'])]
        variant_id=matches[0]['id'] if len(matches)==1 else ''
        weights = profiles.get((sale['listing_id'],variant_id)) or profiles.get((sale['listing_id'],''))
        allocations=[]
        if weights:
            allocations=[(fid,weight*qty) for fid,weight in weights if fid in by_id]
            if len(allocations)!=len(weights):
                allocations=[]
        if allocations:
            exact_g+=sum(g for _,g in allocations)
        else:
            colors=_colors_from_sale(sale,filaments,parts)
            if not colors:
                colors=[fid for fid in (master.get((sale['listing_id'],variant_id)) or
                    master.get((sale['listing_id'],'')) or []) if fid in by_id]
            if colors:
                # Divide the one 50g product estimate across its identified
                # materials, never count 50g once for every colour.
                total=qty*default_grams
                allocations=[(fid,total*colors.count(fid)/len(colors)) for fid in set(colors)]
                estimated_g+=total
            else:
                unassigned_g+=qty*default_grams
                unassigned_items+=qty
        for fid,grams in allocations:
            grams_90[fid]=grams_90.get(fid,0)+grams
            if is30: grams_30[fid]=grams_30.get(fid,0)+grams
            if sale['status']=='open':open_g[fid]=open_g.get(fid,0)+grams
    cart=sum(f['cart_qty'] for f in filaments)
    free=max(0,spools-cart)
    suggestions=[]
    for f in filaments:
        fid=f['id']
        recent=grams_30.get(fid,0)
        ninety=grams_90.get(fid,0)
        # Fast recent trend but never fill the shopping budget blindly.
        forecast=max(recent/30.0,ninety/90.0)*days
        committed=open_g.get(fid,0)
        required=max(forecast,committed)
        reserve=round(required*.15) if required>0 else 0
        available=f['stock_qty']*1000+f['open_qty']*500
        deficit=max(0,required+reserve-available-f['cart_qty']*1000)
        needed=math.ceil(deficit/1000) if deficit>0 else 0
        if not ninety and not committed and not f['cart_qty']:
            continue
        suggestions.append(dict(id=fid,brand=f['brand'],material=f['material'],
          color=f['color'],color_hex=f['color_hex'],internal_code=f['internal_code'],
          stock_spools=f['stock_qty'],open_spools=f['open_qty'],cart_qty=f['cart_qty'],
          historical_g=round(ninety),recent_g=round(recent),forecast_g=round(forecast),
          open_order_g=round(committed),reserve_g=reserve,
          needed_spools=needed,add_spools=0,deficit_g=round(deficit),
          price_cents=f['price_cents'],purchase_url=f['purchase_url']))
    suggestions.sort(key=lambda f:(-bool(f['needed_spools']),-f['deficit_g'],
                    -f['recent_g'],-f['historical_g'],f['color'].casefold()))
    for row in suggestions:
        add=min(free,row['needed_spools'])
        row['add_spools']=add
        free-=add
    checked=db.execute('SELECT checked_at,count FROM pp_filament_history_state WHERE id=1').fetchone()
    known=sum(grams_90.values())
    return {'target_spools':spools,'days':days,'default_grams':default_grams,
      'current_cart':cart,'recommended_add':sum(x['add_spools'] for x in suggestions),
      'remaining_capacity':free,'over_target':max(0,cart-spools),
      'sales_count_90':sold_items,'unassigned_count_90':unassigned_items,
      'unassigned_g_90':round(unassigned_g),
      'exact_g_90':round(exact_g),'estimated_g_90':round(estimated_g),
      'assigned_g_90':round(known),
      'history_checked_at':checked['checked_at'] if checked else 0,
      'history_count':checked['count'] if checked else 0,
      'suggestions':suggestions}


def apply(db, additions, expected_cart):
    """One transaction. Existing cart selections are never cleared or reduced."""
    if type(additions) is not list or len(additions)>100:
        raise ValueError('Ungültiger Einkaufsplan.')
    if type(expected_cart) is not dict:
        raise ValueError('Einkaufsliste wurde geändert. Bitte Empfehlungen neu berechnen.')
    current={str(r['id']):r['cart_qty'] for r in db.execute('SELECT id,cart_qty FROM filament_spools')}
    if current != expected_cart:
        raise ValueError('Einkaufsliste wurde inzwischen geändert. Bitte Empfehlungen neu berechnen.')
    seen=set()
    for item in additions:
        if not isinstance(item,dict):
            raise ValueError('Ungültiger Vorschlag.')
        fid,qty=item.get('id'),item.get('qty')
        if type(fid) is not int or type(qty) is not int or not 1<=qty<=100:
            raise ValueError('Ungültige Spulenmenge.')
        if fid in seen or str(fid) not in current or current[str(fid)]+qty>999:
            raise ValueError('Doppelte oder nicht vorhandene Farbe.')
        seen.add(fid)
    for item in additions:
        db.execute('UPDATE filament_spools SET cart_qty=cart_qty+?,updated=? WHERE id=?',
                   (item['qty'],int(time.time()),item['id']))
    return {'added':sum(x['qty'] for x in additions)}
