"""Local workshop orders: isolated source records, existing inventory booking rules.

A local order mirrors an Etsy receipt/transaction only while open, using a
reserved LOK- prefix. Etsy sync never creates these IDs and only touches
receipts identified by Etsy itself. No write-back to Etsy.
"""
import datetime as dt
import json
import secrets
import time
from zoneinfo import ZoneInfo

BERLIN=ZoneInfo('Europe/Berlin')
MAX_LINES=25

def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_local_orders(
      id TEXT PRIMARY KEY,customer TEXT NOT NULL,fulfillment TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,
      due INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',
      completed INTEGER NOT NULL DEFAULT 0,
      request_key TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS pp_local_custom_jobs(
      transaction_id TEXT PRIMARY KEY,printing INTEGER NOT NULL DEFAULT 0
      CHECK(printing>=0),finished INTEGER NOT NULL DEFAULT 0 CHECK(finished>=0)
    );
    CREATE INDEX IF NOT EXISTS pp_local_status ON pp_local_orders(status,due);
    """)
    # All older LOK rows stay intact; readiness is derived from their saved
    # production quantities and never needs a destructive status migration.
    columns={c['name'] for c in db.execute('PRAGMA table_info(pp_local_orders)')}
    for name,sql in (
        ('handover_method',"TEXT NOT NULL DEFAULT ''"),
        ('handover_to',"TEXT NOT NULL DEFAULT ''"),
        ('handover_at','INTEGER NOT NULL DEFAULT 0'),
        ('handover_debits',"TEXT NOT NULL DEFAULT ''"),
    ):
        if name not in columns:
            db.execute('ALTER TABLE pp_local_orders ADD COLUMN '+name+' '+sql)

def clean(value,name,limit,required=False):
    if not isinstance(value,str): raise ValueError(name+' muss Text sein.')
    result=value.strip()
    if len(result)>limit or (required and not result):
        raise ValueError(name+' fehlt oder ist zu lang.')
    return result

def due_timestamp(value):
    raw=clean(value,'Fertigstellungstermin',10,True)
    try: day=dt.date.fromisoformat(raw)
    except ValueError: raise ValueError('Bitte ein gültiges Endtermin-Datum angeben.')
    today=dt.datetime.now(BERLIN).date()
    if not today<=day<=today+dt.timedelta(days=730):
        raise ValueError('Der Endtermin muss zwischen heute und zwei Jahren liegen.')
    return int(dt.datetime.combine(day,dt.time(12,0),BERLIN).timestamp())

def fields(data):
    customer=clean(data.get('customer'),'Kundenname',120,True)
    fulfillment=data.get('fulfillment')
    if fulfillment not in ('pickup','shipping'):
        raise ValueError('Abholung oder Versand auswählen.')
    notes=clean(data.get('notes',''),'Bestellhinweis',1200)
    due=due_timestamp(data.get('due_date'))
    return customer,fulfillment,notes,due

def _prepare_lines(db,lines):
    if not isinstance(lines,list) or not 1<=len(lines)<=MAX_LINES:
        raise ValueError('Bitte 1 bis 25 Bestellpositionen anlegen.')
    output=[]
    for index,entry in enumerate(lines):
        if not isinstance(entry,dict): raise ValueError('Ungültige Bestellposition.')
        listing_id=str(entry.get('listing_id') or '')
        item_id=str(entry.get('item_id') or '')
        found=db.execute("""SELECT i.*,l.title,l.state
            FROM stock_items i JOIN stock_listings l ON l.id=i.listing_id
            WHERE i.id=? AND i.listing_id=?""",(item_id,listing_id)).fetchone()
        if not found or found['state'] not in ('active','sold_out') or not found['enabled']:
            raise ValueError('Gewählte Produktvariante ist nicht verfügbar. Bitte neu auswählen.')
        qty=entry.get('quantity')
        if type(qty) is not int or not 1<=qty<=1000:
            raise ValueError('Stückzahl muss zwischen 1 und 1000 liegen.')
        color=clean(entry.get('color',''),'Wunschfarbe',100)
        personalization=clean(entry.get('personalization',''),'Gravur / Personalisierung',600)
        note=clean(entry.get('note',''),'Positionshinweis',600)
        custom=bool(color or personalization)
        output.append({'listing_id':listing_id,'selected_variant_id':item_id,
          'quantity':qty,'variant':found['label'],'color':color,
          'personalization':personalization,'note':note,
          'local_custom':custom,'title':found['title']})
    return output

def create(db,data):
    customer,fulfillment,notes,due=fields(data)
    lines=_prepare_lines(db,data.get('lines'))
    direct=data.get('direct_sale',False)
    if type(direct) is not bool: raise ValueError('Ungültiger Direktverkauf.')
    if direct and any(line['local_custom'] for line in lines):
        raise ValueError('Direktverkauf nur ohne Gravur oder Sonderfarbe.')
    request_key=clean(data.get('request_key'),'Anfragekennung',120,True)
    if len(request_key)<12: raise ValueError('Anfragekennung ungültig.')
    previous=db.execute('SELECT id,status FROM pp_local_orders WHERE request_key=?',(request_key,)).fetchone()
    if previous: return {'id':previous['id'],'status':previous['status']}
    now=int(time.time())
    oid='LOK-'+dt.datetime.now(BERLIN).strftime('%y%m%d')+'-'+secrets.token_hex(3).upper()
    prepared=[]
    # Reserve/debit physical stock atomically for a direct handover.
    debits={}
    for line in lines:
        iid=line['selected_variant_id']
        if direct: debits[iid]=debits.get(iid,0)+line['quantity']
    if direct:
        for iid,qty in debits.items():
            row=db.execute('SELECT on_hand FROM stock_items WHERE id=?',(iid,)).fetchone()
            if not row or row['on_hand'] is None:
                raise ValueError('Direktverkauf: Bestand der ausgewählten Variante zuerst zählen.')
            locked=db.execute("""SELECT COALESCE(SUM(j.finished),0)
                FROM stock_order_prints j JOIN stock_transactions t
                ON t.id=j.transaction_id
                WHERE j.item_id=? AND t.status='open'""",(iid,)).fetchone()[0]
            if qty>row['on_hand']-locked:
                raise ValueError('Direktverkauf: Zu wenig freier Bestand für eine Variante.')
        for iid,qty in debits.items():
            db.execute('UPDATE stock_items SET on_hand=on_hand-?,revision=revision+1 WHERE id=?',
                       (qty,iid))
    status='completed' if direct else 'open'
    db.execute('''INSERT INTO pp_local_orders
        (id,customer,fulfillment,notes,created,due,status,completed,request_key)
        VALUES(?,?,?,?,?,?,?,?,?)''',
        (oid,customer,fulfillment,notes,now,due,status,now if direct else 0,request_key))
    for i,line in enumerate(lines):
        tid='LOKLINE-'+secrets.token_hex(12)
        entry={k:v for k,v in line.items() if k!='title'}
        entry['transaction_id']=tid
        prepared.append(entry)
        db.execute('INSERT INTO stock_transactions VALUES(?,?,?,?,?,?,?)',
                   (tid,oid,line['listing_id'],
                    None if line['local_custom'] else line['selected_variant_id'],
                    line['quantity'],now,'shipped' if direct else 'open'))
    db.execute('INSERT INTO stock_receipts VALUES(?,?,?,?,?)',
               (oid,now,due,customer,json.dumps(prepared,ensure_ascii=False)))
    return {'id':oid,'status':status}

def update(db,data):
    oid=str(data.get('id') or '')
    if not db.execute("SELECT 1 FROM pp_local_orders WHERE id=? AND status='open'",(oid,)).fetchone():
        raise ValueError('Nur offene lokale Bestellungen können geändert werden.')
    customer,fulfillment,notes,due=fields(data)
    db.execute('UPDATE pp_local_orders SET customer=?,fulfillment=?,notes=?,due=? WHERE id=?',
               (customer,fulfillment,notes,due,oid))
    db.execute('UPDATE stock_receipts SET customer=?,ship_by=? WHERE id=?',(customer,due,oid))
    return {'id':oid,'status':'open'}

def custom_action(db,data):
    tid=str(data.get('transaction_id') or '')
    tx=db.execute("""SELECT t.*,o.status FROM stock_transactions t
        JOIN pp_local_orders o ON o.id=t.receipt_id WHERE t.id=?""",(tid,)).fetchone()
    if not tx or tx['status']!='open': raise ValueError('Lokale Position nicht offen.')
    receipt=db.execute('SELECT lines_json FROM stock_receipts WHERE id=?',(tx['receipt_id'],)).fetchone()
    line=next((l for l in json.loads(receipt['lines_json']) if l['transaction_id']==tid),None)
    if not line or not line.get('local_custom'):
        raise ValueError('Diese Position verwendet die normale Lagerverwaltung.')
    job=db.execute('SELECT * FROM pp_local_custom_jobs WHERE transaction_id=?',(tid,)).fetchone()
    printing=job['printing'] if job else 0
    finished=job['finished'] if job else 0
    action=data.get('action_type')
    qty=data.get('quantity')
    if type(qty) is not int or not 1<=qty<=1000:
        raise ValueError('Bitte eine gültige Stückzahl eingeben.')
    if action=='start':
        if qty>tx['qty']-printing-finished: raise ValueError('Menge bereits in Druck oder fertig.')
        printing+=qty
    elif action=='finish-direct':
        # Confirm physically completed pieces without requiring an earlier
        # click on "Im Druck". If some are running, consume those first.
        if qty>tx['qty']-finished:
            raise ValueError('Mehr Stücke als noch fertigzumelden sind.')
        printing-=min(printing,qty)
        finished+=qty
    elif action=='reopen':
        # Correct a mistaken completion without creating/consuming shelf stock.
        if qty>finished:
            raise ValueError('Es sind nicht so viele Stücke als fertig bestätigt.')
        finished-=qty
    elif action in ('finish','cancel'):
        if qty>printing: raise ValueError('Es sind nicht so viele Stücke im Druck.')
        printing-=qty
        if action=='finish':finished+=qty
    else:
        raise ValueError('Ungültige Sonderanfertigungsaktion.')
    db.execute('''INSERT INTO pp_local_custom_jobs(transaction_id,printing,finished)
        VALUES(?,?,?) ON CONFLICT(transaction_id) DO UPDATE SET
        printing=excluded.printing,finished=excluded.finished''',(tid,printing,finished))
    return {'id':tx['receipt_id'],'transaction_id':tid}

def close(db,data,components):
    oid=str(data.get('id') or '')
    row=db.execute("SELECT * FROM pp_local_orders WHERE id=? AND status='open'",(oid,)).fetchone()
    if not row: raise ValueError('Lokale Bestellung nicht offen.')
    action=data.get('action')
    if action not in ('complete','cancel'): raise ValueError('Ungültiger Abschluss.')
    method=clean(data.get('method','customer'),'Übergabeart',24,True) if action=='complete' else ''
    if action=='complete' and method not in ('customer','third_party','delivered','shipped'):
        raise ValueError('Ungültige Übergabeart.')
    recipient=clean(data.get('recipient',''),'Mitgenommen von',120) if action=='complete' else ''
    if method!='third_party': recipient=''
    debits={}
    txs=db.execute("SELECT * FROM stock_transactions WHERE receipt_id=? AND status='open'",(oid,)).fetchall()
    if not txs: raise ValueError('Keine offenen Positionen gefunden.')
    receipts=db.execute('SELECT lines_json FROM stock_receipts WHERE id=?',(oid,)).fetchone()
    lines={l['transaction_id']:l for l in json.loads(receipts['lines_json'])}
    for tx in txs:
        line=lines[tx['id']]
        if line.get('local_custom'):
            job=db.execute('SELECT * FROM pp_local_custom_jobs WHERE transaction_id=?',(tx['id'],)).fetchone()
            printing=job['printing'] if job else 0
            finished=job['finished'] if job else 0
            if printing or (action=='complete' and finished<tx['qty']):
                raise ValueError('Sonderanfertigung ist noch im Druck oder nicht fertig.')
            continue
        job=db.execute('SELECT * FROM stock_order_prints WHERE transaction_id=?',(tx['id'],)).fetchone()
        printing=job['printing'] if job else 0
        finished=job['finished'] if job else 0
        allocated=job['allocated'] if job else 0
        assembled=job['assembled'] if job else 0
        if printing: raise ValueError('Auftragsdruck läuft noch. Bitte erst fertigstellen oder abbrechen.')
        if action=='complete':
            if finished+allocated+assembled < tx['qty']:
                raise ValueError('Noch nicht alle Artikel sind fertig oder aus Lager zugeordnet.')
            if finished:
                stock=db.execute('SELECT on_hand FROM stock_items WHERE id=?',(tx['item_id'],)).fetchone()
                if not stock or stock['on_hand'] is None or stock['on_hand']<finished:
                    raise ValueError('Fertiger Lagerbestand zu niedrig. Bitte vor Übergabe prüfen.')
                db.execute("UPDATE stock_items SET on_hand=on_hand-?,revision=revision+1 WHERE id=?",
                           (finished,tx['item_id']))
                debits[tx['item_id']]=debits.get(tx['item_id'],0)+finished
        else:
            if assembled: raise ValueError('Montierte Teile können nicht automatisch storniert werden.')
            if allocated:
                db.execute('UPDATE stock_items SET on_hand=on_hand+?,revision=revision+1 WHERE id=?',
                           (allocated,tx['item_id']))
            # Restore booked, unconsumed component stock, transactionally.
            components.recover_cancelled(db,tx['id'])
        db.execute("UPDATE stock_transactions SET status=? WHERE id=?",
                   ('shipped' if action=='complete' else 'review',tx['id']))
    # Custom lines and classic lines alike are marked closed only at the end.
    db.execute("UPDATE stock_transactions SET status=? WHERE receipt_id=? AND status='open'",
               ('shipped' if action=='complete' else 'review',oid))
    new_status='completed' if action=='complete' else 'cancelled'
    completed_at=int(time.time())
    db.execute("""UPDATE pp_local_orders SET status=?,completed=?,
        handover_method=?,handover_to=?,handover_at=?,handover_debits=? WHERE id=?""",
        (new_status,completed_at,method,recipient,completed_at if action=='complete' else 0,
         json.dumps(debits) if action=='complete' else '',oid))
    return {'id':oid,'status':new_status}

def handover(db,data,components):
    ids=data.get('ids')
    if not isinstance(ids,list) or not 1<=len(ids)<=25 or any(not isinstance(i,str) for i in ids):
        raise ValueError('Bitte mindestens einen gültigen lokalen Auftrag auswählen.')
    if len(ids)!=len(set(ids)): raise ValueError('Auftrag doppelt ausgewählt.')
    names=[]
    for oid in ids:
        row=db.execute("SELECT customer FROM pp_local_orders WHERE id=? AND status='open'",(oid,)).fetchone()
        if not row: raise ValueError('Ein ausgewählter Auftrag ist nicht mehr offen.')
        names.append(' '.join(row['customer'].split()).casefold())
    if len(set(names))!=1: raise ValueError('Gemeinsame Übergabe nur für denselben Kunden.')
    for oid in ids:
        close(db,{'id':oid,'action':'complete','method':data.get('method','customer'),
                  'recipient':data.get('recipient','')},components)
    # Callers hold one BEGIN IMMEDIATE transaction, so either all orders
    # complete and debit stock or no order is changed.
    return {'ids':ids,'status':'completed'}

def undo_handover(db,data):
    oid=str(data.get('id') or '')
    row=db.execute("SELECT * FROM pp_local_orders WHERE id=? AND status='completed'",(oid,)).fetchone()
    if not row or not row['handover_method']:
        raise ValueError('Diese ältere oder nicht übergebene Bestellung kann nicht zurückgesetzt werden.')
    try: debits=json.loads(row['handover_debits'])
    except (TypeError,ValueError): raise ValueError('Übergabebuchung unvollständig.')
    if not isinstance(debits,dict): raise ValueError('Übergabebuchung ungültig.')
    txs=db.execute("SELECT id,status FROM stock_transactions WHERE receipt_id=?",(oid,)).fetchall()
    if not txs or any(tx['status']!='shipped' for tx in txs):
        raise ValueError('Auftragspositionen wurden seit der Übergabe verändert.')
    for item_id,quantity in debits.items():
        if not isinstance(item_id,str) or type(quantity) is not int or quantity<0:
            raise ValueError('Übergabebuchung ungültig.')
        cur=db.execute("""UPDATE stock_items SET on_hand=on_hand+?,revision=revision+1
                          WHERE id=? AND on_hand IS NOT NULL""",(quantity,item_id))
        if cur.rowcount!=1: raise ValueError('Lagerbestand für Rücknahme nicht verfügbar.')
    db.execute("UPDATE stock_transactions SET status='open' WHERE receipt_id=?",(oid,))
    db.execute("""UPDATE pp_local_orders SET status='open',completed=0,
       handover_method='',handover_to='',handover_at=0,handover_debits='' WHERE id=?""",(oid,))
    return {'id':oid,'status':'open'}

def ready(db,oid):
    txs=db.execute("SELECT * FROM stock_transactions WHERE receipt_id=?",(oid,)).fetchall()
    receipt=db.execute("SELECT lines_json FROM stock_receipts WHERE id=?",(oid,)).fetchone()
    if not txs or not receipt or any(tx['status']!='open' for tx in txs): return False
    lines={line['transaction_id']:line for line in json.loads(receipt['lines_json'])}
    for tx in txs:
        line=lines.get(tx['id'])
        if not line: return False
        table='pp_local_custom_jobs' if line.get('local_custom') else 'stock_order_prints'
        job=db.execute('SELECT * FROM '+table+' WHERE transaction_id=?',(tx['id'],)).fetchone()
        if not job or job['printing'] or tx['qty']<=0: return False
        finished=job['finished']
        if not line.get('local_custom'):
            finished+=job['allocated']+job['assembled']
        if finished<tx['qty']:return False
    return True

def enrich(db,orders):
    metadata={row['id']:dict(row) for row in db.execute("SELECT * FROM pp_local_orders WHERE status='open'")}
    custom={row['transaction_id']:dict(row) for row in db.execute('SELECT * FROM pp_local_custom_jobs')}
    for order in orders:
        entry=metadata.get(order['id'])
        if not entry:continue
        order.update({'source':'local','fulfillment':entry['fulfillment'],
                      'notes':entry['notes'],'status':entry['status']})
        for line in order['items']:
            if not line.get('local_custom'):continue
            job=custom.get(line['transaction_id'],{})
            line['printing']=job.get('printing',0)
            line['finished']=job.get('finished',0)
            line['allocated']=0
            line['assembled']=0
            line['remaining']=max(0,line['quantity']-line['printing']-line['finished'])
            line['item_id']=None
            line['components_enabled']=False
            line['components']=[]
        # Readiness is live and works for all existing LOK orders. A corrected
        # print quantity reopens production automatically, without stock moves.
        if order['items'] and all(
            int(l.get('quantity') or 0)>0 and not int(l.get('printing') or 0)
            and not int(l.get('remaining') or 0)
            and (int(l.get('finished') or 0)+int(l.get('allocated') or 0)+
                 int(l.get('assembled') or 0))>=int(l['quantity'])
            for l in order['items']):
            order['status']='ready'
    return orders

def history(db,limit=80):
    rows=[dict(r) for r in db.execute(
        'SELECT * FROM pp_local_orders ORDER BY created DESC,id DESC LIMIT ?',(limit,))]
    for r in rows:
        receipt=db.execute('SELECT lines_json FROM stock_receipts WHERE id=?',(r['id'],)).fetchone()
        r['items']=json.loads(receipt['lines_json']) if receipt else []
        if r['status']=='open' and ready(db,r['id']): r['status']='ready'
    return rows
