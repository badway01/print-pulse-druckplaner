#!/usr/bin/env python3
"""Print & Pulse Lager v0.1. Local inventory, read-only Etsy integration."""
import base64
import datetime as dt
import hashlib
import hmac
import html
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import threading
import time
import zipfile
import urllib.error
import urllib.parse
import urllib.request
import unicodedata
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
APP_VERSION = os.environ.get('PP_VERSION') or '0.11.23'
DATA = Path(os.environ.get("PP_DATA_DIR", "/data"))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "production.sqlite3"
MASTER_ROOT = Path(os.environ.get("PP_MASTER_DIR", "/share/print-pulse/masterdateien"))
MAX_MASTER_SIZE = 100 * 1024 * 1024
PRINTERS = ("H2D","P1S Old","P1S New","Snapmaker U1","A1 mini","Prusa MK4")
MONITOR_PRINTERS = ("H2D","P1S Old","P1S New","Snapmaker U1")
MONITOR_FIELDS = ("status","progress","remaining","filename","nozzle","nozzle_left","nozzle_right",
                  "bed","chamber","layer","total_layers","stage","active_tray",
                  "head0","head1","head2","head3","ams1","ams2","ams3","ams4")
HA_CACHE_LOCK = threading.Lock()
HA_CACHE = {"at": 0, "data": None, "error": None}
HA_CACHE_SECONDS = 12
API_BASE = "https://api.etsy.com/v3"
OAUTH_AUTH = "https://www.etsy.com/oauth/connect"
OAUTH_TOKEN = "https://api.etsy.com/v3/public/oauth/token"
SYNC_LOCK = threading.Lock()
IMPORT_LOCK = threading.Lock()
STATUS_LOCK = threading.Lock()
STATUS = {"running": False, "error": None, "message": ""}
CATALOG_INTERVAL = 24 * 3600
RECEIPT_INTERVAL = 15 * 60

class EtsyRateLimited(RuntimeError):
    """An Etsy quota response or local cooldown, never silently ignored."""

def cooldown_notice(until):
    when=dt.datetime.fromtimestamp(until,ZoneInfo('Europe/Berlin')).strftime('%d.%m. um %H:%M')
    return f'Etsy-Anfragelimit erreicht. Abgleich pausiert bis {when} Uhr. Bestände bleiben erhalten.'

def rate_limit_until():
    with connect() as db:
        return int(cfg(db,'etsy_rate_limit_until','0'))

def check_cooldown():
    until=rate_limit_until()
    if until>time.time():
        raise EtsyRateLimited(cooldown_notice(until))

def record_rate_limit(headers):
    try:
        seconds=int(float(headers.get('retry-after','900')))
    except (ValueError,TypeError):
        seconds=900
    seconds=max(1,min(86400,seconds))
    with connect() as db:
        failures=min(6,int(cfg(db,'etsy_rate_limit_failures','0'))+1)
        delay=max(seconds,min(6*3600,15*60*2**(failures-1)))
        until=max(int(time.time())+delay,int(cfg(db,'etsy_rate_limit_until','0')))
        put_cfg(db,'etsy_rate_limit_failures',failures)
        put_cfg(db,'etsy_rate_limit_until',until)
    return until

INGRESS_PEER = "172.30.32.2"
log = logging.getLogger("print-pulse-lager")
logging.basicConfig(level=logging.INFO)

@contextmanager
def connect():
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=30000")
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()

def cfg(db, key, default=""):
    row = db.execute("SELECT value FROM config WHERE k=?", (key,)).fetchone()
    return row["value"] if row else default

def put_cfg(db, key, value):
    db.execute("INSERT INTO config(k,value) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET value=excluded.value", (key, str(value)))

def safe_etsy_image_url(value):
    """Accept only HTTPS images from the official Etsy image CDN."""
    try:
        url = urllib.parse.urlsplit(str(value or ""))
        host = (url.hostname or "").casefold()
        if (url.scheme != "https" or not host.endswith(".etsystatic.com")
                or host == ".etsystatic.com" or url.username or url.password
                or url.port is not None or not url.path.startswith("/")):
            return ""
        return urllib.parse.urlunsplit((url.scheme, url.netloc, url.path, url.query, ""))
    except (ValueError, TypeError):
        return ""

def api_request(endpoint, params=None, method="GET", body=None, retry=True):
    if method != "GET" or body is not None:
        raise ValueError("Etsy wird nur gelesen.")
    with connect() as db:
        key = cfg(db, "keystring")
        secret = cfg(db, "shared_secret")
        token = cfg(db, "access_token")
        expires = int(cfg(db, "expires_at", "0"))
        cooldown = int(cfg(db, "etsy_rate_limit_until", "0"))
    if not key or not secret or not token:
        raise RuntimeError("Etsy ist noch nicht vollständig verbunden.")
    if cooldown > time.time():
        raise EtsyRateLimited(cooldown_notice(cooldown))
    if expires < time.time() + 120:
        refresh_token()
        with connect() as db:
            token = cfg(db, "access_token")
    url = API_BASE + endpoint
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"x-api-key": f"{key}:{secret}", "Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": "PrintPulseLager/0.1"}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    time.sleep(.26)  # Stay below Etsy's default request rate.
    try:
        with urllib.request.urlopen(req, timeout=35) as res:
            data=json.load(res)
            # Reset exponential backoff only after a successful API read.
            with connect() as db:
                if cfg(db,'etsy_rate_limit_failures','0')!='0':
                    put_cfg(db,'etsy_rate_limit_failures',0)
                    put_cfg(db,'etsy_rate_limit_until',0)
            return data
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise EtsyRateLimited(cooldown_notice(record_rate_limit(e.headers))) from None
        if e.code == 401 and retry:
            refresh_token()
            return api_request(endpoint, params=params, method=method, body=body, retry=False)
        raise RuntimeError(f"Etsy API meldet HTTP {e.code} bei {endpoint.split('?')[0]}. Berechtigungen und Verbindung prüfen.") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Etsy ist nicht erreichbar: {e.reason}") from None

def token_post(params):
    body = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(OAUTH_TOKEN, data=body, headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Etsy OAuth meldet HTTP {e.code}; Code, Callback-Adresse und App-Zugang prüfen.") from None

def save_tokens(payload):
    if "access_token" not in payload or "refresh_token" not in payload:
        raise RuntimeError("Etsy hat keine vollständigen OAuth-Tokens geliefert.")
    with connect() as db:
        put_cfg(db, "access_token", payload["access_token"])
        put_cfg(db, "refresh_token", payload["refresh_token"])
        put_cfg(db, "expires_at", int(time.time()) + int(payload.get("expires_in", 3600)))

def refresh_token():
    with SYNC_LOCK:
        with connect() as db:
            key = cfg(db, "keystring")
            token = cfg(db, "refresh_token")
        if not key or not token:
            raise RuntimeError("OAuth fehlt. Bitte Etsy erneut verbinden.")
        response = token_post({"grant_type": "refresh_token", "client_id": key, "refresh_token": token})
        save_tokens(response)

def init_db():
    """Add isolated v0.1 tables; retain old tables and credentials for rollback."""
    with connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS config(k TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS stock_listings(
          id TEXT PRIMARY KEY,title TEXT NOT NULL,image TEXT NOT NULL DEFAULT '',
          etsy_qty INTEGER,state TEXT NOT NULL,inventory_error TEXT NOT NULL DEFAULT '',
          made_to_order INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS stock_items(
          id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES stock_listings(id),
          product_id TEXT NOT NULL,label TEXT NOT NULL,signature TEXT NOT NULL,
          etsy_qty INTEGER,enabled INTEGER NOT NULL DEFAULT 1,
          on_hand INTEGER CHECK(on_hand>=0),in_print INTEGER NOT NULL DEFAULT 0 CHECK(in_print>=0),
          minimum INTEGER NOT NULL DEFAULT 2 CHECK(minimum>=0),
          revision INTEGER NOT NULL DEFAULT 0,notice TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS stock_transactions(
          id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL,listing_id TEXT NOT NULL,item_id TEXT,
          qty INTEGER NOT NULL,created INTEGER NOT NULL,status TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS stock_tx_listing ON stock_transactions(listing_id);
        CREATE TABLE IF NOT EXISTS stock_receipts(
          id TEXT PRIMARY KEY,created INTEGER NOT NULL,
          ship_by INTEGER NOT NULL DEFAULT 0,customer TEXT NOT NULL DEFAULT '',
          lines_json TEXT NOT NULL DEFAULT '[]');
        CREATE TABLE IF NOT EXISTS stock_actions(
          id TEXT PRIMARY KEY,item_id TEXT NOT NULL,before_json TEXT NOT NULL,
          after_revision INTEGER NOT NULL,created INTEGER NOT NULL,undone INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS stock_order_prints(
          transaction_id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL,
          item_id TEXT NOT NULL REFERENCES stock_items(id),
          printing INTEGER NOT NULL DEFAULT 0 CHECK(printing>=0),
          finished INTEGER NOT NULL DEFAULT 0 CHECK(finished>=0),
          updated INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS stock_order_prints_item ON stock_order_prints(item_id);
        CREATE TABLE IF NOT EXISTS filament_spools(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          brand TEXT NOT NULL, color TEXT NOT NULL, material TEXT NOT NULL,
          color_hex TEXT NOT NULL DEFAULT '#c1c9c1',
          price_cents INTEGER CHECK(price_cents>=0), purchase_url TEXT NOT NULL DEFAULT '',
          stock_qty INTEGER NOT NULL DEFAULT 0 CHECK(stock_qty>=0),
          cart_qty INTEGER NOT NULL DEFAULT 0 CHECK(cart_qty>=0),
          created INTEGER NOT NULL, updated INTEGER NOT NULL);
        -- Dedicated table: older planner databases may already contain an
        -- unrelated print_profiles table with an incompatible column layout.
        CREATE TABLE IF NOT EXISTS pp_master_filament_profiles(
          listing_id TEXT NOT NULL,variant_id TEXT NOT NULL DEFAULT '',
          printer TEXT NOT NULL,sources_json TEXT NOT NULL DEFAULT '[]',
          updated INTEGER NOT NULL,PRIMARY KEY(listing_id,variant_id,printer));
        CREATE TABLE IF NOT EXISTS master_files(
          id TEXT PRIMARY KEY,listing_id TEXT NOT NULL,variant_id TEXT NOT NULL DEFAULT '',
          printer TEXT NOT NULL,filename TEXT NOT NULL,relative_path TEXT NOT NULL UNIQUE,
          bytes INTEGER NOT NULL,created INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS master_files_listing ON master_files(listing_id);
        """)
        columns={col['name'] for col in db.execute("PRAGMA table_info(filament_spools)")}
        if 'internal_code' not in columns:
            db.execute("ALTER TABLE filament_spools ADD COLUMN internal_code TEXT NOT NULL DEFAULT ''")
        if 'notes' not in columns:
            db.execute("ALTER TABLE filament_spools ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
        # Preserve legacy data: migrate compatible master assignments once.
        # Incompatible print_profiles tables remain entirely untouched.
        old_columns={col['name'] for col in db.execute("PRAGMA table_info(print_profiles)")}
        expected={'listing_id','variant_id','printer','sources_json','updated'}
        if expected.issubset(old_columns):
            db.execute("""INSERT OR IGNORE INTO pp_master_filament_profiles
                (listing_id,variant_id,printer,sources_json,updated)
                SELECT listing_id,variant_id,printer,sources_json,updated
                FROM print_profiles""")
        elif old_columns:
            log.info('Alte print_profiles-Tabelle hat anderes Schema; bleibt unverändert erhalten.')
        os.chmod(DB_PATH, 0o600)


def integer(value, low=0, high=100000):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"Bitte eine ganze Zahl zwischen {low} und {high} eingeben.")
    return value


def signature(properties, transaction=False):
    values=[]
    for prop in properties or []:
        pid=str(prop.get('property_id') or '')
        if not pid:
            continue
        if transaction:
            val=prop.get('value_id')
            value=str(val) if val else str(prop.get('formatted_value') or prop.get('value') or '').strip().casefold()
        else:
            ids=prop.get('value_ids') or []
            value=','.join(map(str,ids)) if ids and all(ids) else ','.join(map(str,prop.get('values') or [])).strip().casefold()
        values.append((pid,value))
    return json.dumps(sorted(values),ensure_ascii=False,separators=(',',':'))


def pages(endpoint, params=None):
    result=[]
    for offset in range(0,10000,100):
        response=api_request(endpoint,{**(params or {}),'limit':100,'offset':offset})
        batch=response.get('results')
        if not isinstance(batch,list):
            raise ValueError('Unvollständige Etsy-Antwort. Bisherige Daten bleiben erhalten.')
        result.extend(batch)
        if len(batch)<100:
            return result
        time.sleep(.3)
    raise ValueError('Etsy-Abruf überschreitet 10.000 Einträge. Keine Teildaten übernommen.')


def receipt_status(receipt):
    status=str(receipt.get('status') or '').lower().replace('_',' ').replace('-',' ')
    if status in ('canceled','cancelled','fully refunded') or receipt.get('was_canceled'):
        return 'excluded'
    if receipt.get('refunds') or status=='partially refunded':
        return 'review'
    if receipt.get('is_paid') is False or status not in ('paid','completed'):
        return 'review'
    return 'shipped' if receipt.get('is_shipped') or receipt.get('was_shipped') or status=='completed' else 'open'


def fetch_catalog(shop):
    """Listings persist even if inventory permissions need renewed authorization."""
    listings=[]
    warning=''
    try:
        for state in ('active','sold_out','inactive','draft','expired'):
            listings.extend(pages(f'/application/shops/{shop}/listings',{'state':state}))
    except RuntimeError as exc:
        if 'HTTP 403' not in str(exc):
            raise
        listings=pages(f'/application/shops/{shop}/listings/active')
        warning='Für alle Varianten und inaktive Produkte bitte Etsy unter Einstellungen erneut verbinden (Leseberechtigung).'
    result=[]
    inventory_forbidden=False
    for index, listing in enumerate(listings):
        lid=str(listing.get('listing_id') or '')
        if not lid.isdigit():
            raise ValueError('Ungültige Etsy-Produkt-ID.')
        with STATUS_LOCK:
            STATUS['message']=f'Produkte laden: {index+1} / {len(listings)}'
        image=''
        error=''
        products=None
        try:
            imgs=api_request(f'/application/listings/{lid}/images').get('results',[])
            if imgs:
                image=safe_etsy_image_url(imgs[0].get('url_570xN') or imgs[0].get('url_fullxfull') or '')
        except EtsyRateLimited:
            raise
        except RuntimeError:
            pass
        if not inventory_forbidden:
            try:
                inv=api_request(f'/application/listings/{lid}/inventory')
                products=inv.get('products')
                if not isinstance(products,list) or not products:
                    error='Keine Varianten von Etsy geliefert. Bestand bleibt erhalten.'
                    products=None
            except EtsyRateLimited:
                raise
            except RuntimeError as exc:
                inventory_forbidden='HTTP 403' in str(exc)
                error='Varianten nicht abrufbar. '+('Bitte Etsy erneut verbinden.' if inventory_forbidden else str(exc))
        else:
            error='Bitte Etsy erneut verbinden, um Varianten lesen zu dürfen.'
        rows=[]
        for product in products or []:
            if product.get('is_deleted'):
                continue
            props=product.get('property_values') or []
            sig=signature(props)
            iid=lid+'-'+hashlib.sha256(sig.encode()).hexdigest()[:24]
            label=' · '.join(html.unescape(str(p.get('property_name') or 'Variante'))+': '+html.unescape(', '.join(map(str,p.get('values') or []))) for p in props) or 'Standard'
            offers=[o for o in product.get('offerings',[]) if not o.get('is_deleted')]
            # Multiple readiness offerings can share inventory; don't sum them.
            quantities=[o.get('quantity') for o in offers if type(o.get('quantity')) is int]
            qty=max(quantities) if quantities else None
            enabled=any(o.get('is_enabled',True) for o in offers)
            rows.append((iid,lid,str(product.get('product_id') or ''),label,sig,qty,int(enabled)))
        if len({r[0] for r in rows}) != len(rows):
            rows=[]
            error='Varianten sind nicht eindeutig. Etsy-Varianten prüfen; Bestand bleibt erhalten.'
            products=None
        result.append((listing,image,error,rows,products is not None))
        time.sleep(.3)
    return result,warning


def fetch_receipts(shop, include_orders=False):
    since=int(time.time())-30*86400
    base=f'/application/shops/{shop}/receipts'
    recent=pages(base,{'min_created':since,'was_paid':'true'})
    opened=pages(base,{'was_paid':'true','was_shipped':'false'})
    receipts={str(r['receipt_id']):r for r in recent+opened}
    # An absent open receipt may have shipped OR been canceled. Verify explicitly.
    with connect() as db:
        tracked={r[0] for r in db.execute("SELECT DISTINCT receipt_id FROM stock_transactions WHERE status='open'")}
        tracked.update(r[0] for r in db.execute("SELECT id FROM stock_receipts"))
    for rid in tracked-receipts.keys():
        receipts[rid]=api_request(base+'/'+rid)
        time.sleep(.3)
    result=[]
    orders=[]
    for rid,r in receipts.items():
        status=receipt_status(r)
        txs=r.get('transactions')
        if not isinstance(txs,list):
            txs=pages(base+'/'+rid+'/transactions')
        if status in ('open','shipped') and not txs:
            raise ValueError('Eine bezahlte Bestellung enthält keine Positionen. Abgleich abgebrochen.')
        lines=[]
        ship_dates=[value for value in [r.get('expected_ship_date'),r.get('ship_by_date')]
                    + [t.get('expected_ship_date') for t in txs]
                    if type(value) is int and value>0]
        for tx in txs:
            tid=str(tx.get('transaction_id') or '')
            lid=str(tx.get('listing_id') or '')
            if not tid.isdigit() or not lid.isdigit():
                raise ValueError('Ungültige Etsy-Bestellposition.')
            qty=integer(tx.get('quantity'),1)
            created=int(r.get('create_timestamp') or r.get('created_timestamp') or 0)
            result.append((tid,rid,lid,str(tx.get('product_id') or ''),signature(tx.get('variations'),True),qty,created,status))
            variations=[]
            for prop in tx.get('variations') or []:
                name=html.unescape(str(prop.get('formatted_name') or prop.get('property_name') or 'Variante'))
                value=html.unescape(str(prop.get('formatted_value') or prop.get('value') or ''))
                if value: variations.append(f'{name}: {value}')
            lines.append({'transaction_id':tid,'listing_id':lid,'quantity':qty,
                          'title':html.unescape(str(tx.get('title') or 'Artikel')),
                          'variant':' · '.join(variations)})
        if status=='open':
            customer=html.unescape(str(r.get('name') or 'Kunde nicht angegeben')).strip()[:120]
            orders.append((rid,int(r.get('create_timestamp') or r.get('created_timestamp') or 0),
                           min(ship_dates) if ship_dates else 0,customer,
                           json.dumps(lines,ensure_ascii=False)))
    return (result,set(receipts),orders) if include_orders else (result,set(receipts))


def apply_snapshot(catalog, transactions, receipt_ids, warning='', orders=None):
    now=int(time.time())
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        previous_sync=int(cfg(db,'stock_last_sync','0'))
        # Only a complete catalog may retire missing listings. Keep stocks for recovery.
        if catalog is not None and not warning:
            returned={str(entry[0]['listing_id']) for entry in catalog}
            for existing in db.execute('SELECT id FROM stock_listings').fetchall():
                if existing['id'] not in returned:
                    db.execute("UPDATE stock_listings SET state='removed' WHERE id=?",(existing['id'],))
        # All stock/print fields survive sync. Never derive physical stock from Etsy.
        for listing,image,error,rows,valid in (catalog or []):
            lid=str(listing['listing_id'])
            qty=listing.get('quantity')
            if type(qty) is not int: qty=None
            db.execute('''INSERT INTO stock_listings(id,title,image,etsy_qty,state,inventory_error,updated)
              VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,
              image=CASE WHEN excluded.image='' THEN stock_listings.image ELSE excluded.image END,
              etsy_qty=excluded.etsy_qty,state=excluded.state,inventory_error=excluded.inventory_error,updated=excluded.updated''',
              (lid,html.unescape(str(listing.get('title') or 'Produkt')),image,qty,str(listing.get('state') or 'active'),error,now))
            if valid:
                db.execute('UPDATE stock_items SET enabled=0 WHERE listing_id=?',(lid,))
                for row in rows:
                    db.execute('''INSERT INTO stock_items(id,listing_id,product_id,label,signature,etsy_qty,enabled)
                      VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id,
                      label=excluded.label,etsy_qty=excluded.etsy_qty,enabled=excluded.enabled''',row)
        old={r['id']:dict(r) for r in db.execute('SELECT * FROM stock_transactions')}
        items=[dict(r) for r in db.execute('SELECT * FROM stock_items')]
        observed=set()
        for tid,rid,lid,pid,sig,qty,created,status in transactions:
            observed.add(tid)
            candidates=[i for i in items if i['listing_id']==lid and ((pid and i['product_id']==pid) or i['signature']==sig)]
            iid=candidates[0]['id'] if len(candidates)==1 else None
            prior=old.get(tid)
            newly_shipped=status=='shipped' and ((prior and prior['status']=='open') or (not prior and previous_sync and created>previous_sync))
            if newly_shipped:
                # Assigned pieces still being printed have never entered physical
                # stock. Deduct only the shipped pieces that were booked into it.
                linked=db.execute('SELECT item_id,printing FROM stock_order_prints WHERE transaction_id=?',(tid,)).fetchone()
                target=(prior['item_id'] if prior else None) or (linked['item_id'] if linked else None) or iid
                stock_debit=max(0,qty-(linked['printing'] if linked else 0))
                if target and stock_debit:
                    stock=db.execute('SELECT on_hand FROM stock_items WHERE id=?',(target,)).fetchone()
                    if stock and stock['on_hand'] is not None:
                        notice='Versandmenge größer als Lagerbestand: bitte nachzählen.' if stock['on_hand']<stock_debit else ''
                        db.execute('UPDATE stock_items SET on_hand=MAX(0,on_hand-?),revision=revision+1,notice=? WHERE id=?',(stock_debit,notice,target))
            db.execute('''INSERT INTO stock_transactions VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
              receipt_id=excluded.receipt_id,listing_id=excluded.listing_id,item_id=excluded.item_id,
              qty=excluded.qty,created=excluded.created,status=excluded.status''',(tid,rid,lid,iid,qty,created,status))
        # Removed positions release reservations, never imply shipment.
        for tid,previous in old.items():
            if previous['receipt_id'] in receipt_ids and tid not in observed:
                db.execute("UPDATE stock_transactions SET status='excluded' WHERE id=?",(tid,))
        if orders is not None:
            # Replace only receipts confirmed in this complete Etsy snapshot.
            # Canceled, refunded and shipped orders disappear without touching stock.
            for rid in receipt_ids:
                db.execute('DELETE FROM stock_receipts WHERE id=?',(rid,))
            for row in orders:
                db.execute('INSERT INTO stock_receipts(id,created,ship_by,customer,lines_json) VALUES(?,?,?,?,?)',row)
        db.execute("""DELETE FROM stock_transactions WHERE status!='open' AND created<?
          AND id NOT IN (SELECT transaction_id FROM stock_order_prints WHERE printing>0)""",(now-31*86400,))
        # Retain running jobs even when their orders disappear from the open list.
        db.execute("""DELETE FROM stock_order_prints WHERE printing=0 AND updated<?
          AND transaction_id NOT IN (SELECT id FROM stock_transactions)""",(now-90*86400,))
        db.execute('DELETE FROM stock_actions WHERE created<?',(now-7*86400,))
        put_cfg(db,'stock_last_sync',now)
        if catalog is not None:
            put_cfg(db,'stock_last_catalog_sync',now)
            put_cfg(db,'stock_warning',warning)


def synchronize():
    with connect() as db:
        shop=cfg(db,'shop_id')
        existing=db.execute('SELECT COUNT(*) FROM stock_listings').fetchone()[0]
        catalog_at=int(cfg(db,'stock_last_catalog_sync',cfg(db,'stock_last_sync','0')))
    if not shop.isdigit(): raise ValueError('Bitte Etsy unter Einstellungen verbinden.')
    # Orders first: changes arrive frequently, without a large catalog import.
    with STATUS_LOCK: STATUS['message']='Offene Bestellungen abrufen …'
    transactions,receipts,orders=fetch_receipts(shop,include_orders=True)
    due=not existing or not catalog_at or time.time()-catalog_at>=CATALOG_INTERVAL
    if not due:
        apply_snapshot(None,transactions,receipts,orders=orders)
        return
    with STATUS_LOCK: STATUS['message']='Täglichen Produktkatalog abrufen …'
    try:
        catalog,warning=fetch_catalog(shop)
    except Exception:
        # Commit fully verified orders even if the costly catalog refresh fails.
        # No listing is disabled or any counted stock overwritten.
        apply_snapshot(None,transactions,receipts,orders=orders)
        raise
    apply_snapshot(catalog,transactions,receipts,warning,orders)


def run_sync():
    check_cooldown()
    if not IMPORT_LOCK.acquire(blocking=False): return False
    with STATUS_LOCK: STATUS.update(running=True,error=None,message='Etsy wird abgeglichen …')
    def job():
        try:
            synchronize()
        except Exception as exc:
            log.warning('Etsy-Abgleich fehlgeschlagen: %s',type(exc).__name__)
            with STATUS_LOCK: STATUS['error']=str(exc)[:300]
        finally:
            with STATUS_LOCK: STATUS.update(running=False,message='')
            IMPORT_LOCK.release()
    threading.Thread(target=job,daemon=True).start()
    return True


def recommendation(stock, printing, demand, sold7, sold30, minimum, days, made_to_order, active=True):
    if stock is None: return {'need':None,'coverage':None,'target':None,'level':'unknown'}
    rate=max(sold7/7,sold30/30)
    target=0 if made_to_order or not active else max(minimum,math.ceil(rate*days))
    need=max(0,demand+target-stock-printing)
    free=max(0,stock-demand)
    coverage=round(free/rate,1) if rate else None
    level='red' if demand>stock+printing or (active and not made_to_order and stock+printing==0 and target>0) else 'yellow' if need else 'green'
    return {'need':need,'coverage':coverage,'target':target,'level':level}




def etsy_stock_alerts(listings, threshold=3):
    """Flag quantities buyers can order on Etsy, never local on_hand or print jobs.

    Etsy inventory is a catalog snapshot, not a real-time counter. Keep alerts
    grouped by listing to avoid flooding the dashboard for hundreds of variants.
    """
    result=[]
    for listing in listings:
        if listing.get('state') not in ('active','sold_out'):
            continue
        total=listing.get('etsy_qty')
        total=total if type(total) is int and total>=0 else None
        sold_out=listing.get('state')=='sold_out'
        listing_low=total is not None and total<threshold
        variants=[]
        for item in listing.get('items',[]):
            qty=item.get('etsy_qty')
            if not item.get('enabled') or type(qty) is not int or qty<0 or qty>=threshold:
                continue
            variants.append({'id':str(item['id']),'label':str(item['label']),
                             'etsy_qty':qty,'sold30':int(item.get('sold30') or 0)})
        if not (sold_out or listing_low or variants):
            continue
        variants.sort(key=lambda v:(v['etsy_qty'],-v['sold30'],v['label'].casefold()))
        has_zero=sold_out or total==0 or any(v['etsy_qty']==0 for v in variants)
        result.append({
            'listing_id':str(listing['id']),
            'title':str(listing['title']),
            'state':listing['state'],
            'etsy_qty':total,
            'severity':'empty' if has_zero else 'low',
            'affected_variants':len(variants),
            'variants':[{'id':v['id'],'label':v['label'],'etsy_qty':v['etsy_qty']}
                        for v in variants[:3]],
            'more_variants':max(0,len(variants)-3)
        })
    result.sort(key=lambda x:(0 if x['severity']=='empty' else 1,
                              x['etsy_qty'] if x['etsy_qty'] is not None else 999999,
                              x['title'].casefold()))
    return result

def overview():
    now=int(time.time())
    with connect() as db:
        listings=[dict(r) for r in db.execute('SELECT * FROM stock_listings')]
        items=[dict(r) for r in db.execute('SELECT * FROM stock_items')]
        txs=[dict(r) for r in db.execute('SELECT * FROM stock_transactions')]
        receipt_rows=[dict(r) for r in db.execute('SELECT * FROM stock_receipts')]
        print_rows=[dict(r) for r in db.execute('SELECT * FROM stock_order_prints')]
        days=int(cfg(db,'stock_days','7'))
        etsy_threshold=max(1,min(99,int(cfg(db,'etsy_alert_threshold','3'))))
        sync_at=int(cfg(db,'stock_last_sync','0'))
        configured=bool(cfg(db,'keystring') and cfg(db,'callback'))
        authorized=bool(cfg(db,'access_token'))
        warning=cfg(db,'stock_warning')
        catalog_at=int(cfg(db,'stock_last_catalog_sync',cfg(db,'stock_last_sync','0')))
        cooldown=int(cfg(db,'etsy_rate_limit_until','0'))
        action=db.execute('SELECT * FROM stock_actions WHERE undone=0 ORDER BY created DESC,rowid DESC LIMIT 1').fetchone()
        undo=None
        if action:
            item=db.execute('SELECT revision FROM stock_items WHERE id=?',(action['item_id'],)).fetchone()
            if item and item['revision']==action['after_revision']:
                undo=action['id']
    tx_by_id={t['id']:t for t in txs}
    prints_by_tx={p['transaction_id']:p for p in print_rows}
    for listing in listings:
        sales=[t for t in txs if t['listing_id']==listing['id'] and t['status'] in ('open','shipped')]
        listing['sold30']=sum(t['qty'] for t in sales if t['created']>=now-30*86400)
        listing['sold7']=sum(t['qty'] for t in sales if t['created']>=now-7*86400)
        listing['unmatched']=sum(t['qty'] for t in sales if t['status']=='open' and not t['item_id'])
        listing['review']=sum(t['qty'] for t in txs if t['listing_id']==listing['id'] and t['status']=='review')
        variants=[]
        for item in (i for i in items if i['listing_id']==listing['id']):
            lines=[t for t in sales if t['item_id']==item['id']]
            item['sold7']=sum(t['qty'] for t in lines if t['created']>=now-7*86400)
            item['sold30']=sum(t['qty'] for t in lines if t['created']>=now-30*86400)
            item['reserved']=sum(t['qty'] for t in lines if t['status']=='open')
            item['order_jobs']=[{'transaction_id':j['transaction_id'],'receipt_id':j['receipt_id'],
                                 'printing':j['printing'],'finished':j['finished'],
                                 'status':tx_by_id.get(j['transaction_id'],{}).get('status','unknown')}
                                for j in print_rows if j['item_id']==item['id'] and j['printing']>0]
            item['order_printing']=sum(j['printing'] for j in item['order_jobs'])
            item['free']=None if item['on_hand'] is None else max(0,item['on_hand']-item['reserved'])
            active=listing['state'] in ('active','sold_out') and bool(item['enabled'])
            item.update(recommendation(item['on_hand'],item['in_print'],item['reserved'],item['sold7'],item['sold30'],item['minimum'],days,bool(listing['made_to_order']),active))
            if item['enabled'] or item['on_hand'] or item['in_print'] or item['reserved']:
                variants.append(item)
        listing['items']=variants
        listing['need']=sum(i['need'] or 0 for i in variants)
        listing['uninitialized']=sum(i['on_hand'] is None for i in variants)
        listing['level']=min((i['level'] for i in variants),key=lambda l:{'red':0,'yellow':1,'unknown':2,'green':3}[l],default='unknown')
    eligible=sorted([p for p in listings if p['sold30']>=5],key=lambda p:-p['sold30'])
    top={p['id'] for p in eligible[:max(1,math.ceil(len(listings)*.2))]}
    for p in listings: p['bestseller']=p['id'] in top
    listings.sort(key=lambda p:({'red':0,'yellow':1,'unknown':2,'green':3}[p['level']],-p['need'],-p['sold7'],p['title'].casefold()))
    low_etsy=etsy_stock_alerts(listings,etsy_threshold) if catalog_at else []
    images={p['id']:safe_etsy_image_url(p['image']) for p in listings}
    titles={p['id']:p['title'] for p in listings}
    orders=[]
    for receipt in receipt_rows:
        lines=json.loads(receipt['lines_json'])
        for line in lines:
            tx=tx_by_id.get(str(line.get('transaction_id') or ''))
            if tx and tx['receipt_id']==receipt['id'] and tx['status']=='open':
                line['item_id']=tx['item_id']
                job=prints_by_tx.get(tx['id'])
                line['printing']=job['printing'] if job else 0
                line['finished']=job['finished'] if job else 0
                line['remaining']=max(0,tx['qty']-line['printing']-line['finished'])
            else:
                line['item_id']=None
                line['printing']=0
                line['finished']=0
                line['remaining']=0
            line['image']=images.get(line['listing_id'],'')
            # Receipt titles follow the buyer's language. Use our cached shop title.
            line['title']=titles.get(line['listing_id']) or 'Artikel '+line['listing_id']
        orders.append({'id':receipt['id'],'customer':receipt['customer'],
                       'created':receipt['created'],'ship_by':receipt['ship_by'],
                       'items':lines,'quantity':sum(line['quantity'] for line in lines)})
    with STATUS_LOCK: status=dict(STATUS)
    return {'orders':orders,'products':listings,'days':days,'last_sync':sync_at,'last_catalog_sync':catalog_at,'etsy_alert_threshold':etsy_threshold,'etsy_stock_alerts':low_etsy,'cooldown_until':cooldown,'sync':status,'configured':configured,'authorized':authorized,'warning':warning,'undo':undo,'version':'0.1'}


def mutate_stock(data):
    iid=str(data.get('id') or '')
    action=data.get('action')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT * FROM stock_items WHERE id=?',(iid,)).fetchone()
        if not row: raise ValueError('Variante nicht gefunden.')
        before={k:row[k] for k in ('on_hand','in_print','minimum','notice')}
        after=dict(before)
        if action=='adjust':
            if row['on_hand'] is None: raise ValueError('Bitte zuerst den tatsächlichen Bestand zählen und eintragen.')
            after['on_hand']=integer(row['on_hand']+integer(data.get('delta'),-1,1))
        elif action=='set':
            if data.get('revision')!=row['revision']: raise ValueError('Bestand wurde inzwischen geändert. Bitte neu laden.')
            after['on_hand']=integer(data.get('quantity'))
            after['notice']=''
        elif action=='printing':
            after['in_print']=integer(row['in_print']+integer(data.get('quantity'),1))
        elif action=='finish':
            if row['on_hand'] is None:
                if 'initial_stock' not in data: raise ValueError('Bitte zuerst den bisherigen Lagerbestand erfassen.')
                starting_stock=integer(data['initial_stock'])
            else:
                starting_stock=row['on_hand']
            linked=db.execute('SELECT COALESCE(SUM(printing),0) FROM stock_order_prints WHERE item_id=?',(iid,)).fetchone()[0]
            qty=integer(data.get('quantity'),1,row['in_print']-linked)
            after['in_print']-=qty
            after['on_hand']=integer(starting_stock+qty)
        elif action=='cancel':
            linked=db.execute('SELECT COALESCE(SUM(printing),0) FROM stock_order_prints WHERE item_id=?',(iid,)).fetchone()[0]
            after['in_print']-=integer(data.get('quantity'),1,row['in_print']-linked)
        elif action=='minimum': after['minimum']=integer(data.get('quantity'))
        else: raise ValueError('Unbekannte Lageraktion.')
        revision=row['revision']+1
        db.execute('UPDATE stock_items SET on_hand=?,in_print=?,minimum=?,notice=?,revision=? WHERE id=?',(*after.values(),revision,iid))
        db.execute('INSERT INTO stock_actions VALUES(?,?,?,?,?,0)',(secrets.token_hex(12),iid,json.dumps(before),revision,int(time.time())))



def mutate_order_print(data):
    """Atomic order-linked print job. Etsy itself is never modified."""
    tid=str(data.get('transaction_id') or '')
    receipt_id=str(data.get('receipt_id') or '')
    action=data.get('action')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        tx=db.execute('SELECT * FROM stock_transactions WHERE id=? AND receipt_id=?',(tid,receipt_id)).fetchone()
        if not tx: raise ValueError('Etsy-Bestellposition nicht gefunden. Bitte Bestellungen aktualisieren.')
        previous=db.execute('SELECT * FROM stock_order_prints WHERE transaction_id=?',(tid,)).fetchone()
        # An already-started job keeps its original item even if a subsequent
        # Etsy catalog refresh can no longer resolve that older variation.
        item_id=(previous['item_id'] if previous else tx['item_id'])
        row=db.execute('SELECT * FROM stock_items WHERE id=?',(item_id,)).fetchone() if item_id else None
        if not row: raise ValueError('Variante nicht eindeutig zugeordnet. Bitte in Etsy prüfen.')
        if data.get('revision')!=row['revision']:
            raise ValueError('Der Bestand wurde inzwischen geändert. Bitte erneut öffnen.')
        if previous and (previous['receipt_id']!=receipt_id or (action=='printing' and tx['item_id'] and tx['item_id']!=previous['item_id'])):
            raise ValueError('Die Zuordnung dieser Bestellvariante hat sich geändert. Bitte prüfen.')
        printing=previous['printing'] if previous else 0
        finished=previous['finished'] if previous else 0
        if action=='printing':
            if tx['status']!='open':
                raise ValueError('Nur offene bezahlte Etsy-Bestellungen können neue Auftragsdrucke erhalten.')
            qty=integer(data.get('quantity'),1,tx['qty']-printing-finished)
            new_stock=row['on_hand']
            new_print=integer(row['in_print']+qty)
            printing+=qty
        elif action in ('finish','cancel'):
            qty=integer(data.get('quantity'),1,printing)
            if action=='finish' and row['on_hand'] is None and tx['status']!='shipped':
                if 'initial_stock' not in data:
                    raise ValueError('Vor dem Fertigmelden bitte den bisherigen Lagerbestand zählen.')
                starting_stock=integer(data['initial_stock'])
            else:
                starting_stock=row['on_hand']
            printing-=qty
            new_print=row['in_print']-qty
            if new_print<0: raise ValueError('Druckbestand nicht mehr konsistent. Bitte Lager prüfen.')
            if action=='finish':
                finished+=qty
                # If Etsy shipment was already recorded, the assigned pieces
                # were excluded from its stock debit; do not add them now.
                new_stock=row['on_hand'] if tx['status']=='shipped' else integer(starting_stock+qty)
            else:
                new_stock=row['on_hand']
        else:
            raise ValueError('Unbekannte Auftragsdruck-Aktion.')
        db.execute('UPDATE stock_items SET on_hand=?,in_print=?,revision=revision+1 WHERE id=?',
                   (new_stock,new_print,row['id']))
        db.execute("""INSERT INTO stock_order_prints(transaction_id,receipt_id,item_id,printing,finished,updated)
          VALUES(?,?,?,?,?,?) ON CONFLICT(transaction_id) DO UPDATE SET
          printing=excluded.printing,finished=excluded.finished,updated=excluded.updated""",
          (tid,receipt_id,row['id'],printing,finished,int(time.time())))


def undo_action(action_id):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT * FROM stock_actions WHERE id=? AND undone=0',(action_id,)).fetchone()
        if not row: raise ValueError('Diese Änderung wurde bereits zurückgenommen.')
        before=json.loads(row['before_json'])
        result=db.execute('UPDATE stock_items SET on_hand=?,in_print=?,minimum=?,notice=?,revision=revision+1 WHERE id=? AND revision=?',(*before.values(),row['item_id'],row['after_revision']))
        if not result.rowcount: raise ValueError('Zwischenzeitlich geändert oder versendet. Bitte Bestand prüfen.')
        db.execute('UPDATE stock_actions SET undone=1 WHERE id=?',(action_id,))


def filament_overview():
    """Manual filament register and local shopping list, independent of Etsy."""
    with connect() as db:
        rows=[dict(row) for row in db.execute(
            "SELECT * FROM filament_spools ORDER BY brand COLLATE NOCASE, color COLLATE NOCASE, material COLLATE NOCASE, id")]
    selected=[row for row in rows if row['cart_qty']>0]
    return {'filaments':rows,'cart_count':sum(row['cart_qty'] for row in selected),
            'cart_known_total_cents':sum(row['cart_qty']*row['price_cents'] for row in selected if row['price_cents'] is not None),
            'cart_missing_prices':sum(row['cart_qty'] for row in selected if row['price_cents'] is None)}



def filament_key(value):
    """Normalize names for duplicate safety while retaining PLA vs PLA+."""
    source=str(value).strip().casefold().replace('ß','ss')
    for original,converted in (('ä','ae'),('ö','oe'),('ü','ue')):
        source=source.replace(original,converted)
    source=unicodedata.normalize('NFKD',source)
    source=''.join(c for c in source if not unicodedata.combining(c))
    return ''.join(c for c in source.replace('+','plus') if c.isalnum())


def filament_brand(value):
    aliases={
      'bambu':'Bambu Lab','bambulab':'Bambu Lab',
      'sunlu':'SUNLU','esun':'eSUN',
      'polymaker':'Polymaker','prusament':'Prusament',
      'eryone':'ERYONE','elegoo':'ELEGOO','creality':'Creality',
      'overture':'OVERTURE','extrudr':'extrudr'
    }
    return aliases.get(filament_key(value),value.strip())


def filament_material_key(value):
    key=filament_key(value)
    return {'basicpla':'plabasic','mattepla':'plamatte',
            'silkpla':'plasilk','silkplaplus':'plasilkplus',
            'plaplus':'plaplus','plaplus20':'plaplus20'}.get(key,key)


def filament_color_key(brand,material,color):
    key=filament_key(color)
    # Official English/German variants of known manufacturer's color names.
    if filament_key(brand)=='bambulab':
        synonyms={'jadewhite':'jadeweiss','ivorywhite':'elfenbeinweiss',
                  'bonewhite':'knochenweiss','cocoabrown':'kakaobraun',
                  'sunfloweryellow':'sonnenblumengelb'}
        if filament_material_key(material)=='plabasic' and key in ('white','weiss'):
            return 'jadeweiss'
        return synonyms.get(key,key)
    return key


def filament_identity(brand,material,color):
    return (filament_key(filament_brand(brand)),filament_material_key(material),
            filament_color_key(brand,material,color))


def filament_mutate(data):
    """Validated atomic CRUD, quantity change and received-goods booking."""
    action=data.get('action')
    now=int(time.time())
    if action=='save':
        fields={}
        for key,limit in (('brand',70),('color',70),('material',45)):
            val=data.get(key)
            if not isinstance(val,str) or not (1<=len(val.strip())<=limit):
                raise ValueError('Hersteller, Farbe und Material müssen ausgefüllt sein.')
            fields[key]=val.strip()
        fields['brand']=filament_brand(fields['brand'])
        internal_code=data.get('internal_code','')
        notes=data.get('notes','')
        if not isinstance(internal_code,str) or len(internal_code.strip())>24:
            raise ValueError('Interner Farbcode darf maximal 24 Zeichen haben.')
        if not isinstance(notes,str) or len(notes.strip())>1500:
            raise ValueError('Filamentnotiz darf maximal 1500 Zeichen haben.')
        internal_code=internal_code.strip()
        notes=notes.strip()
        stock_qty=integer(data.get('stock_qty'),0,100000)
        color_hex=str(data.get('color_hex') or '#c1c9c1')
        if not re.fullmatch(r'#[0-9A-Fa-f]{6}',color_hex):
            raise ValueError('Ungültiger Farbwert.')
        raw_price=data.get('price')
        if raw_price is None or raw_price=='':
            price_cents=None
        else:
            if not isinstance(raw_price,str) or not re.fullmatch(r'\d{1,4}(?:[,.]\d{1,2})?',raw_price.strip()):
                raise ValueError('Preis bitte in Euro eingeben, z. B. 19,90.')
            parts=raw_price.strip().replace(',','.').split('.')
            price_cents=int(parts[0])*100+(int(parts[1].ljust(2,'0')) if len(parts)==2 else 0)
        url=data.get('purchase_url') or ''
        if not isinstance(url,str) or len(url)>1000:
            raise ValueError('Einkaufslink ist zu lang.')
        url=url.strip()
        if url:
            try:
                parsed=urllib.parse.urlsplit(url)
                if (parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password
                        or parsed.port is not None or any(ord(c)<33 for c in url)):
                    raise ValueError('Bitte einen gültigen HTTPS-Einkaufslink eingeben.')
            except (ValueError,TypeError):
                raise ValueError('Bitte einen gültigen HTTPS-Einkaufslink eingeben.')
        with connect() as db:
            # Serialize checking and writing to prevent duplicate variants on tablets.
            db.execute('BEGIN IMMEDIATE')
            rowid=data.get('id')
            if rowid is not None: rowid=integer(rowid,1,999999999)
            identity=filament_identity(fields['brand'],fields['material'],fields['color'])
            for existing in db.execute('SELECT id,brand,material,color FROM filament_spools'):
                if existing['id']==rowid: continue
                if filament_identity(existing['brand'],existing['material'],existing['color'])==identity:
                    raise ValueError('Filament bereits vorhanden: '+existing['brand']+' · '+existing['material']+' · '+existing['color']+'. Bitte vorhandenen Eintrag bearbeiten.')
            if rowid is None:
                db.execute("""INSERT INTO filament_spools
                   (brand,color,material,color_hex,price_cents,purchase_url,stock_qty,internal_code,notes,created,updated)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                   (fields['brand'],fields['color'],fields['material'],color_hex,price_cents,url,stock_qty,internal_code,notes,now,now))
            else:
                changed=db.execute("""UPDATE filament_spools
                   SET brand=?,color=?,material=?,color_hex=?,price_cents=?,purchase_url=?,stock_qty=?,internal_code=?,notes=?,updated=?
                   WHERE id=?""",(fields['brand'],fields['color'],fields['material'],color_hex,
                   price_cents,url,stock_qty,internal_code,notes,now,rowid))
                if not changed.rowcount: raise ValueError('Filament nicht gefunden.')
        return
    rowid=integer(data.get('id'),1,999999999)
    with connect() as db:
        if action=='cart':
            delta=integer(data.get('delta'),-1,1)
            if delta not in (-1,1): raise ValueError('Ungültige Einkaufsmenge.')
            changed=db.execute("""UPDATE filament_spools SET cart_qty=cart_qty+?,updated=?
               WHERE id=? AND cart_qty+? BETWEEN 0 AND 999""",(delta,now,rowid,delta))
            if not changed.rowcount: raise ValueError('Einkaufsmenge nicht verfügbar.')
        elif action=='receive':
            changed=db.execute("""UPDATE filament_spools SET stock_qty=stock_qty+cart_qty,cart_qty=0,updated=?
               WHERE id=? AND cart_qty>0 AND stock_qty+cart_qty<=100000""",(now,rowid))
            if not changed.rowcount: raise ValueError('Keine Spulen auf der Einkaufsliste oder Bestand zu hoch.')
        elif action=='delete':
            changed=db.execute('DELETE FROM filament_spools WHERE id=?',(rowid,))
            if not changed.rowcount: raise ValueError('Filament nicht gefunden.')
        else:
            raise ValueError('Unbekannte Filamentaktion.')




def print_tools_overview(listing_id=None):
    """Central printer assignments and immutable 3MF revisions."""
    with connect() as db:
        where=' WHERE listing_id=?' if listing_id else ''
        args=(listing_id,) if listing_id else ()
        profiles=[dict(r) for r in db.execute(
            'SELECT * FROM pp_master_filament_profiles'+where+' ORDER BY listing_id,printer,variant_id',args)]
        files=[dict(r) for r in db.execute(
            'SELECT id,listing_id,variant_id,printer,filename,bytes,created FROM master_files'
            +where+' ORDER BY created DESC,id DESC',args)]
        # v0.11.x stores two optional filament columns. Old installations may
        # contain older columns; read the common fields without changing data.
        cols={col['name'] for col in db.execute('PRAGMA table_info(filament_spools)')}
        standard=('id','brand','color','material','color_hex')
        available=[col for col in (*standard,'internal_code','notes') if col in cols]
        spools={r['id']:{**dict(r),'internal_code':dict(r).get('internal_code',''),
                         'notes':dict(r).get('notes','')}
                for r in db.execute('SELECT '+','.join(available)+' FROM filament_spools')}
    for row in profiles:
        raw=row.pop('sources_json',None)
        try:
            parsed=json.loads(raw) if isinstance(raw,str) else []
        except (ValueError,TypeError):
            log.warning('Druckprofil hat unlesbare Filament-Zuordnung, Anzeige bleibt verfügbar.')
            parsed=[]
        if not isinstance(parsed,list):
            parsed=[]
        clean=[]
        row['colors']=[]
        for source in parsed[:12]:
            if not isinstance(source,dict):
                continue
            slots=source.get('slots')
            if not isinstance(slots,list):
                continue
            label=str(source.get('label') or 'Spule')[:80]
            clean.append({**source,'label':label,'slots':slots[:4]})
            for number,fid in enumerate(slots[:4],1):
                # Historical saved JSON may encode ids as strings.
                try: sid=int(fid) if fid not in (None,'') else None
                except (TypeError,ValueError):continue
                f=spools.get(sid)
                if f:
                    row['colors'].append({'id':sid,'code':f['internal_code'],'color':f['color'],
                        'brand':f['brand'],'material':f['material'],'hex':f['color_hex'],
                        'slot':label+' · '+str(number)})
        row['sources']=clean
    return {'profiles':profiles,'files':files}


def validate_profile_target(db, data):
    lid=str(data.get('listing_id') or '')
    variant=str(data.get('variant_id') or '')
    printer=data.get('printer')
    if not lid.isdigit() or len(lid)>32 or printer not in PRINTERS:
        raise ValueError('Produkt oder Drucker ungültig.')
    if not db.execute('SELECT 1 FROM stock_listings WHERE id=?',(lid,)).fetchone():
        raise ValueError('Produkt nicht gefunden.')
    if variant and not db.execute(
        'SELECT 1 FROM stock_items WHERE id=? AND listing_id=?',(variant,lid)).fetchone():
        raise ValueError('Variante gehört nicht zum Produkt.')
    return lid,variant,printer


def save_print_profile(data):
    sources=data.get('sources')
    if not isinstance(sources,list) or len(sources)>12:
        raise ValueError('Maximal 12 Filamentquellen erlaubt.')
    clean=[]
    for source in sources:
        if not isinstance(source,dict): raise ValueError('Ungültige Filamentquelle.')
        typ=source.get('type')
        if typ not in ('ams','ams_ht','external'): raise ValueError('Unbekannte Filamentquelle.')
        slots=source.get('slots')
        expected=4 if typ=='ams' else 1
        if not isinstance(slots,list) or len(slots)!=expected:
            raise ValueError('Ungültige Anzahl Filamentplätze.')
        clean_slots=[]
        for fid in slots:
            if fid is None or fid=='': clean_slots.append(None)
            else: clean_slots.append(integer(fid,1,999999999))
        label=('AMS '+str(sum(s['type']=='ams' for s in clean)+1) if typ=='ams'
               else 'AMS HT '+str(sum(s['type']=='ams_ht' for s in clean)+1) if typ=='ams_ht'
               else 'Externe Spule '+str(sum(s['type']=='external' for s in clean)+1))
        clean.append({'type':typ,'label':label,'slots':clean_slots})
    with connect() as db:
        lid,variant,printer=validate_profile_target(db,data)
        ids={fid for source in clean for fid in source['slots'] if fid is not None}
        for fid in ids:
            if not db.execute('SELECT 1 FROM filament_spools WHERE id=?',(fid,)).fetchone():
                raise ValueError('Ein ausgewähltes Filament existiert nicht mehr.')
        db.execute("""INSERT INTO pp_master_filament_profiles(listing_id,variant_id,printer,sources_json,updated)
          VALUES(?,?,?,?,?) ON CONFLICT(listing_id,variant_id,printer)
          DO UPDATE SET sources_json=excluded.sources_json,updated=excluded.updated""",
          (lid,variant,printer,json.dumps(clean,ensure_ascii=False),int(time.time())))
    return print_tools_overview(lid)


def safe_master_basename(filename):
    if not isinstance(filename,str) or not filename.lower().endswith('.3mf') or len(filename)>160:
        raise ValueError('Nur .3mf-Dateien bis 160 Zeichen hochladen.')
    filename=filename.replace('\\','/').split('/')[-1]
    if len(filename)<5 or filename.startswith('.'):
        raise ValueError('Ungültiger Dateiname.')
    return filename


def store_master_file(meta, stream, length):
    """Stream to an immutable master file; never overwrite earlier versions."""
    if not 4<=length<=MAX_MASTER_SIZE:
        raise ValueError('3MF-Datei muss zwischen 4 Byte und 100 MB groß sein.')
    name=safe_master_basename(meta.get('filename'))
    with connect() as db:
        lid,variant,printer=validate_profile_target(db,meta)
    directory=MASTER_ROOT / lid / re.sub(r'[^a-zA-Z0-9_-]', '-', printer)
    directory.mkdir(parents=True,exist_ok=True)
    upload_id=secrets.token_hex(12)
    clean_name=re.sub(r'[^a-zA-Z0-9_.-]', '_',name)
    relative=f'{lid}/{re.sub(r"[^a-zA-Z0-9_-]", "-", printer)}/{upload_id}-{clean_name}'
    path=MASTER_ROOT / relative
    try:
        remaining=length
        with path.open('xb') as target:
            while remaining:
                chunk=stream.read(min(1024*1024,remaining))
                if not chunk: raise ValueError('Upload unvollständig.')
                target.write(chunk)
                remaining-=len(chunk)
        if not zipfile.is_zipfile(path):
            raise ValueError('Die Datei ist kein gültiges 3MF-/ZIP-Archiv.')
        with connect() as db:
            validate_profile_target(db,meta)
            db.execute("""INSERT INTO master_files(id,listing_id,variant_id,printer,filename,
              relative_path,bytes,created) VALUES(?,?,?,?,?,?,?,?)""",
              (upload_id,lid,variant,printer,name,relative,length,int(time.time())))
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return {'ok':True,'id':upload_id,'bytes':length}


def master_download_record(file_id):
    if not re.fullmatch(r'[a-f0-9]{24}',file_id or ''):
        raise ValueError('Ungültige Datei-ID.')
    with connect() as db:
        row=db.execute('SELECT * FROM master_files WHERE id=?',(file_id,)).fetchone()
    if not row: raise FileNotFoundError('Masterdatei nicht gefunden.')
    path=MASTER_ROOT / row['relative_path']
    if not path.resolve().is_relative_to(MASTER_ROOT.resolve()):
        raise ValueError('Ungültiger Dateipfad.')
    return dict(row),path


def homeassistant_states(force=False):
    """Read-only Supervisor proxy, never expose the authentication token to a browser."""
    now=time.monotonic()
    with HA_CACHE_LOCK:
        if not force and HA_CACHE["at"] and now-HA_CACHE["at"] < HA_CACHE_SECONDS:
            if HA_CACHE["error"]: raise RuntimeError(HA_CACHE["error"])
            return HA_CACHE["data"]
        token=os.environ.get('SUPERVISOR_TOKEN') or os.environ.get('HASSIO_TOKEN','')
        if not token:
            message='Home-Assistant-Zugang fehlt. Bitte den Druckplaner 0.11.15 installieren und neu starten.'
            HA_CACHE.update(at=now,data=None,error=message)
            raise RuntimeError(message)
        req=urllib.request.Request('http://supervisor/core/api/states',headers={
            'Authorization':'Bearer '+token,'Accept':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=6) as response:
                data=json.load(response)
            if not isinstance(data,list) or len(data)>50000:
                raise ValueError('Ungültige Sensorantwort.')
            # Keep only entity states; avoid exposing arbitrary HA attributes.
            result={str(item['entity_id']):item for item in data
                    if isinstance(item,dict) and isinstance(item.get('entity_id'),str)}
            HA_CACHE.update(at=time.monotonic(),data=result,error=None)
            return result
        except (urllib.error.URLError,TimeoutError,ValueError,KeyError,OSError) as exc:
            message='Home Assistant liefert aktuell keine Druckersensordaten.'
            HA_CACHE.update(at=time.monotonic(),data=None,error=message)
            raise RuntimeError(message) from None



PRINTER_ENTITY_SUFFIXES = {
 'status': ('print_status','print_state','printer_status','print_stats_state','druckstatus'),
 'progress': ('print_progress','print_percent','progress','druckfortschritt'),
 'remaining': ('remaining_time','time_remaining','print_time_remaining','verbleibende_zeit'),
 'filename': ('gcode_filename','gcode_file','current_file','print_filename','task_name','filename','gcode_dateiname'),
 'nozzle_left': ('left_nozzle_temperature','left_nozzle_temp','nozzle_left_temperature'),
 'nozzle_right': ('right_nozzle_temperature','right_nozzle_temp','nozzle_right_temperature'),
 'nozzle': ('nozzle_temperature','nozzle_temp','temperatur_der_duse'),
 'bed': ('bed_temperature','bed_temp','druckbetttemperatur'),
 'chamber': ('chamber_temperature','chamber_temp'),
 'layer': ('current_layer','print_layer','aktuelle_schicht'),
 'total_layers': ('total_layer_count','total_layers','total_layer','gesamtzahl_der_schichten'),
 'stage': ('current_stage','print_stage','aktueller_arbeitsschritt'),
 'active_tray': ('active_tray','active_ams_tray','aktiver_slot'),
 'head0': ('head_0_nozzle_temperature','head0_nozzle_temperature','tool0_temperature','toolhead_0_temp','extruder_temperature'),
 'head1': ('head_1_nozzle_temperature','head1_nozzle_temperature','tool1_temperature','toolhead_1_temp','extruder1_temperature'),
 'head2': ('head_2_nozzle_temperature','head2_nozzle_temperature','tool2_temperature','toolhead_2_temp','extruder2_temperature'),
 'head3': ('head_3_nozzle_temperature','head3_nozzle_temperature','tool3_temperature','toolhead_3_temp','extruder3_temperature'),
 'ams1': ('tray_1','ams_tray_1','ams_1_slot_1'),
 'ams2': ('tray_2','ams_tray_2','ams_1_slot_2'),
 'ams3': ('tray_3','ams_tray_3','ams_1_slot_3'),
 'ams4': ('tray_4','ams_tray_4','ams_1_slot_4'),
}

def printer_model_for_slug(slug):
    if re.search(r'(?:^|_)h2d(?:_|$)',slug): return 'H2D'
    if re.search(r'(?:^|_)p1s(?:_|$)',slug): return 'P1S'
    if re.search(r'(?:^|_)a1_?mini(?:_|$)',slug): return 'A1 mini'
    if re.search(r'(?:^|_)snapmaker(?:_|$)',slug) or re.search(r'(?:^|_)u1(?:_|$)',slug):
        return 'Snapmaker U1'
    return None

def discover_printer_candidates(states):
    """Group printer sensors by status entity and exact prefix, never by AMS switches."""
    candidates=[]
    for status_id in sorted(states):
        if not status_id.startswith('sensor.'):continue
        slug=status_id.split('.',1)[1]
        base=next((slug[:-(len(suffix)+1)] for suffix in PRINTER_ENTITY_SUFFIXES['status']
                   if slug.endswith('_'+suffix)),None)
        if not base:continue
        model=printer_model_for_slug(base)
        if not model:continue
        fields={'status':status_id}
        for field,aliases in PRINTER_ENTITY_SUFFIXES.items():
            if field=='status':continue
            found=next((domain+'.'+base+'_'+suffix
                        for suffix in aliases for domain in ('sensor','number')
                        if domain+'.'+base+'_'+suffix in states),None)
            if found:fields[field]=found
        attrs=states[status_id].get('attributes') or {}
        friendly=str(attrs.get('friendly_name') or '') if isinstance(attrs,dict) else ''
        suffix=base.split('_')[-1][:10]
        label=model+' · '+suffix
        if re.search(r'(?:^|[\s_])old(?:[\s_]|$)',base+' '+friendly,re.I):
            label+=' (Old)'
        elif re.search(r'(?:^|[\s_])new(?:[\s_]|$)',base+' '+friendly,re.I):
            label+=' (New)'
        candidates.append({'id':status_id,'model':model,'label':label,'entities':fields})
    return candidates

def automatic_printer_bindings(bindings,candidates):
    """Persist only unique matches; P1S Old/New must be disambiguated."""
    remaining={name:dict(fields) for name,fields in bindings.items()}
    used={fields.get('status') for fields in remaining.values() if fields.get('status')}
    changes={}
    for name in MONITOR_PRINTERS:
        if remaining.get(name,{}).get('status'):continue
        model='P1S' if name.startswith('P1S') else name
        options=[c for c in candidates if c['model']==model and c['id'] not in used]
        if name.startswith('P1S'):
            discriminator='Old' if name.endswith('Old') else 'New'
            options=[c for c in options if c['label'].endswith('('+discriminator+')')]
        if len(options)!=1:continue
        changes[name]=options[0]['entities']
        used.add(options[0]['id'])
    if not changes:return remaining,[]
    with connect() as db:
        try: raw=json.loads(cfg(db,'printer_monitor_bindings','{}'))
        except (ValueError,TypeError):raw={}
        if not isinstance(raw,dict):raw={}
        saved=[]
        for name,fields in changes.items():
            if isinstance(raw.get(name),dict) and raw[name].get('status'):continue
            raw[name]={field:fields.get(field,'') for field in MONITOR_FIELDS}
            saved.append(name)
        put_cfg(db,'printer_monitor_bindings',json.dumps(raw,ensure_ascii=False))
    return saved_printer_bindings(),saved

# Known HA entity patterns from actual printer integrations, with P1S New
# matched against live HA state IDs at runtime. HA display names alone do not
# prove an entity ID exists. Shelly power switches are never printer status.
# No tokens, IPs or private device credentials are stored.
CONFIRMED_PRINTER_ENTITIES = {
    'H2D': {
        'status':'sensor.keller_h2d_druckstatus',
        'progress':'sensor.keller_h2d_druckfortschritt',
        'remaining':'sensor.keller_h2d_verbleibende_zeit',
        'filename':'sensor.keller_h2d_gcode_dateiname',
        'nozzle_left':'sensor.keller_h2d_linke_dusentemperatur',
        'nozzle_right':'sensor.keller_h2d_rechte_dusentemperatur',
        'bed':'sensor.keller_h2d_druckbetttemperatur',
        'chamber':'sensor.keller_h2d_temperatur_im_druckraum',
        'layer':'sensor.keller_h2d_aktuelle_schicht',
        'total_layers':'sensor.keller_h2d_gesamtzahl_der_schichten',
        'stage':'sensor.keller_h2d_aktueller_arbeitsschritt',
        'active_tray':'sensor.keller_h2d_aktiver_slot',
        'ams1':'sensor.keller_h2d_ams_1_slot_1',
        'ams2':'sensor.keller_h2d_ams_1_slot_2',
        'ams3':'sensor.keller_h2d_ams_1_slot_3',
        'ams4':'sensor.keller_h2d_ams_1_slot_4',
    },
    'P1S Old': {
        'status':'sensor.keller_p1s_old_druckstatus',
        'progress':'sensor.keller_p1s_old_druckfortschritt',
        'remaining':'sensor.keller_p1s_old_verbleibende_zeit',
        'filename':'sensor.keller_p1s_old_gcode_dateiname',
        'nozzle':'sensor.keller_p1s_old_temperatur_der_duse',
        'bed':'sensor.keller_p1s_old_druckbetttemperatur',
        'layer':'sensor.keller_p1s_old_aktuelle_schicht',
        'total_layers':'sensor.keller_p1s_old_gesamtzahl_der_schichten',
        'stage':'sensor.keller_p1s_old_aktueller_arbeitsschritt',
        'active_tray':'sensor.keller_p1s_old_aktiver_slot',
        'ams1':'sensor.keller_p1s_old_ams_1_slot_1',
        'ams2':'sensor.keller_p1s_old_ams_1_slot_2',
        'ams3':'sensor.keller_p1s_old_ams_1_slot_3',
        'ams4':'sensor.keller_p1s_old_ams_1_slot_4',
    },
    'P1S New': {
        # These IDs follow the existing P1S Old naming convention.
        # Nothing is saved unless the real status entity exists in HA.
        'status':'sensor.keller_p1s_new_druckstatus',
        'progress':'sensor.keller_p1s_new_druckfortschritt',
        'remaining':'sensor.keller_p1s_new_verbleibende_zeit',
        'filename':'sensor.keller_p1s_new_gcode_dateiname',
        'nozzle':'sensor.keller_p1s_new_temperatur_der_duse',
        'bed':'sensor.keller_p1s_new_druckbetttemperatur',
        'layer':'sensor.keller_p1s_new_aktuelle_schicht',
        'total_layers':'sensor.keller_p1s_new_gesamtzahl_der_schichten',
        'stage':'sensor.keller_p1s_new_aktueller_arbeitsschritt',
        'active_tray':'sensor.keller_p1s_new_aktiver_slot',
        'ams1':'sensor.keller_p1s_new_ams_1_slot_1',
        'ams2':'sensor.keller_p1s_new_ams_1_slot_2',
        'ams3':'sensor.keller_p1s_new_ams_1_slot_3',
        'ams4':'sensor.keller_p1s_new_ams_1_slot_4',
    },
    'Snapmaker U1': {
        'status':'sensor.keller_snapmaker_u1_print_state',
        'progress':'sensor.keller_snapmaker_u1_print_progress',
        'remaining':'sensor.keller_snapmaker_u1_time_remaining',
        'filename':'sensor.keller_snapmaker_u1_filename',
        'bed':'sensor.keller_snapmaker_u1_bed_temperature',
        'chamber':'sensor.keller_snapmaker_u1_cavity',
        'layer':'sensor.keller_snapmaker_u1_current_layer',
        'total_layers':'sensor.keller_snapmaker_u1_total_layers',
        'head0':'sensor.keller_snapmaker_u1_t0_nozzle_temperature',
        'head1':'sensor.keller_snapmaker_u1_t1_nozzle_temperature',
        'head2':'sensor.keller_snapmaker_u1_t2_nozzle_temperature',
        'head3':'sensor.keller_snapmaker_u1_t3_nozzle_temperature',
    },
}


def apply_confirmed_printer_bindings(existing,states):
    """Update locally persisted mappings using only verified, present entities.

    The P1S New mappings are candidates inferred from sibling Bambu names:
    only existing Home Assistant sensor entity IDs are accepted. A missing
    device retains a saved mapping but never substitutes Shelly power data.
    """
    patch={}
    for name,known in CONFIRMED_PRINTER_ENTITIES.items():
        if known['status'] not in states:
            continue
        available={field:entity for field,entity in known.items() if entity in states}
        saved=existing.get(name,{})
        target=dict(saved)
        if saved.get('status') != known['status']:
            target={field:'' for field in MONITOR_FIELDS}
        target.update(available)
        if target!=saved:
            patch[name]=target
    if not patch:return existing,[]
    with connect() as db:
        try: stored=json.loads(cfg(db,'printer_monitor_bindings','{}'))
        except (ValueError,TypeError):stored={}
        if not isinstance(stored,dict):stored={}
        for name,fields in patch.items():
            old=stored.get(name,{})
            if isinstance(old,dict) and old.get('status')==CONFIRMED_PRINTER_ENTITIES[name]['status']:
                fields={**old,**{k:v for k,v in fields.items() if v}}
            stored[name]={field:fields.get(field,'') for field in MONITOR_FIELDS}
        put_cfg(db,'printer_monitor_bindings',json.dumps(stored,ensure_ascii=False))
    return saved_printer_bindings(),list(patch)


def saved_printer_bindings():
    with connect() as db:
        try: raw=json.loads(cfg(db,'printer_monitor_bindings','{}'))
        except (ValueError,TypeError): raw={}
    if not isinstance(raw,dict): return {}
    return {name:{field:raw[name].get(field,'') for field in MONITOR_FIELDS
                   if isinstance(raw.get(name),dict) and isinstance(raw[name].get(field,''),str)}
            for name in MONITOR_PRINTERS}


def save_printer_bindings(payload):
    name=payload.get('printer')
    fields=payload.get('entities')
    if name not in MONITOR_PRINTERS or not isinstance(fields,dict):
        raise ValueError('Druckerzuordnung ungültig.')
    if set(fields)-set(MONITOR_FIELDS):
        raise ValueError('Unbekannter Sensortyp.')
    # Only support state domains with no control functionality.
    clean={}
    for field in MONITOR_FIELDS:
        value=fields.get(field,'')
        if not isinstance(value,str) or len(value)>170:
            raise ValueError('Ungültige Sensor-ID.')
        if value and not re.fullmatch(r'(?:sensor|binary_sensor|number|text|select)\.[a-z0-9_]+',value):
            raise ValueError('Sensor-ID muss eine gültige Home-Assistant-Entität sein.')
        clean[field]=value
    with connect() as db:
        try: all_bindings=json.loads(cfg(db,'printer_monitor_bindings','{}'))
        except (ValueError,TypeError): all_bindings={}
        if not isinstance(all_bindings,dict): all_bindings={}
        all_bindings[name]=clean
        put_cfg(db,'printer_monitor_bindings',json.dumps(all_bindings,ensure_ascii=False))
    # Force a subsequent refresh to show new values (only local cache).
    return {'ok':True,'bindings':saved_printer_bindings()}


def ha_entity_choices():
    try:
        states=homeassistant_states()
    except RuntimeError as exc:
        return {'connected':False,'error':str(exc),'entities':[]}
    choices=[]
    for entity_id,item in states.items():
        if not entity_id.startswith(('sensor.','binary_sensor.','number.','text.','select.')):
            continue
        attrs=item.get('attributes') or {}
        if not isinstance(attrs,dict): attrs={}
        friendly=str(attrs.get('friendly_name') or '')[:120]
        # Restrict the picker to printer-related sensors; all existing mappings
        # can still be entered manually as an entity ID.
        haystack=(entity_id+' '+friendly).casefold()
        if not any(term in haystack for term in (
            'bambu','snapmaker','h2d','p1s','a1_mini','a1 mini','u1',
            'nozzle','druck','printer','print_progress','print_status',
            'remaining_time','filament','ams_','toolhead')):
            continue
        choices.append({'id':entity_id,'name':friendly,'state':str(item.get('state',''))[:70],
                        'unit':str(attrs.get('unit_of_measurement') or '')[:16]})
    choices.sort(key=lambda item:item['id'])
    return {'connected':True,'error':'','entities':choices[:1000]}


def sensor_value(states,bindings,field):
    entity_id=bindings.get(field,'')
    if not entity_id:return None
    return states.get(entity_id)


def numeric_sensor(item):
    if not isinstance(item,dict): return None
    value=str(item.get('state','')).strip().replace(',','.').rstrip('%').strip()
    try:
        n=float(value)
        return n if math.isfinite(n) else None
    except (ValueError,TypeError): return None


def sensor_text(item):
    if not isinstance(item,dict): return None
    value=str(item.get('state','')).strip()
    return None if not value or value.casefold() in ('unknown','unavailable','none','null','unbekannt','nicht verfügbar','nicht verfugbar') else value[:180]


def printer_remaining(item,printer):
    if not isinstance(item,dict):return None
    value=sensor_text(item)
    if value is None:return None
    unit=str((item.get('attributes') or {}).get('unit_of_measurement') or '').casefold().strip()
    if ':' in value:
        try:
            parts=[int(n) for n in value.split(':')]
            if len(parts)==3:return max(0,min(parts[0]*3600+parts[1]*60+parts[2],604800))
            if len(parts)==2:return max(0,min(parts[0]*3600+parts[1]*60,604800))
        except ValueError: return None
    amount=numeric_sensor(item)
    if amount is None or amount<0:return None
    # U1 integration exposes remaining seconds; Bambu sensors use minutes.
    factor=3600 if unit in ('h','hr','hour','hours','std') else 1 if unit in ('s','sec','second','seconds','sek') else 60
    if not unit and printer=='Snapmaker U1': factor=1
    return round(min(amount*factor,604800))


def printer_state(item,configured):
    if not configured:return 'setup'
    value=sensor_text(item)
    if value is None:return 'offline'
    key=value.casefold().replace(' ','_')
    if key in ('running','printing','print','working','in_progress','busy','druckt','drucken','druckvorgang_lauft','druckvorgang_läuft'):return 'printing'
    if key in ('finish','finished','complete','completed','success','done','fertig','abgeschlossen'):return 'finished'
    if key in ('pause','paused','pausing','suspended','pausiert','angehalten'):return 'paused'
    if key in ('failed','failure','error','cancelled','canceled','aborted'):return 'error'
    if key in ('offline','disconnected','not_connected','nicht_verbunden'):return 'offline'
    if key in ('idle','ready','standby','stopped','bereit','leerlauf'):return 'idle'
    if key in ('prepare','preparing','heating','calibrating','slicing','vorbereitung','heizt_auf','kalibrierung'):return 'preparing'
    return 'unknown'


def printer_ams_slot(item):
    if not isinstance(item,dict) or sensor_text(item) is None:return None
    attrs=item.get('attributes') or {}
    if not isinstance(attrs,dict):attrs={}
    name=sensor_text(item)
    raw_color=attrs.get('color') or attrs.get('color_hex') or attrs.get('tray_color')
    color=None
    if isinstance(raw_color,str):
        test=raw_color.strip().lstrip('#')[:6]
        if re.fullmatch(r'[0-9A-Fa-f]{6}',test):color='#'+test.upper()
    material=str(attrs.get('type') or attrs.get('filament_type') or attrs.get('tray_type') or '')[:35]
    return {'name':name,'color':color,'material':material}


def printer_dashboard(force=False):
    bindings=saved_printer_bindings()
    try:
        states=homeassistant_states(force=force)
        connected=True;error=''
    except RuntimeError as exc:
        states={}
        connected=False;error=str(exc)
    candidates=discover_printer_candidates(states) if connected else []
    assigned=[]
    if connected:
        bindings,confirmed=apply_confirmed_printer_bindings(bindings,states)
        bindings,detected=automatic_printer_bindings(bindings,candidates)
        assigned=confirmed+detected
    rows=[]
    for printer in MONITOR_PRINTERS:
        selected=bindings.get(printer,{})
        configured=bool(selected.get('status'))
        status=printer_state(sensor_value(states,selected,'status'),configured) if connected else ('offline' if configured else 'setup')
        progress=numeric_sensor(sensor_value(states,selected,'progress'))
        if progress is not None: progress=round(max(0,min(100,progress)))
        if status not in ('printing','paused','finished','preparing'):progress=None
        def n(field):
            value=numeric_sensor(sensor_value(states,selected,field))
            return round(value,1) if value is not None else None
        extras={field:(n(field) if status not in ('offline','setup') else None)
                for field in ('nozzle','nozzle_left','nozzle_right','bed','chamber',
                              'head0','head1','head2','head3')}
        layers={field:(n(field) if status not in ('offline','setup') else None)
                for field in ('layer','total_layers')}
        file=sensor_text(sensor_value(states,selected,'filename')) if status not in ('setup','offline') else None
        remaining=printer_remaining(sensor_value(states,selected,'remaining'),printer) if status in ('printing','paused','preparing') else None
        slots=[printer_ams_slot(sensor_value(states,selected,'ams'+str(i)))
               if status not in ('offline','setup') else None for i in range(1,5)]
        rows.append({'id':printer,'name':('Bambu '+printer if printer!='Snapmaker U1' else printer),
                     'configured':configured,'state':status,'raw_status':sensor_text(sensor_value(states,selected,'status')) if connected else None,
                     'progress':progress,'remaining_seconds':remaining,'filename':file,'stage':sensor_text(sensor_value(states,selected,'stage')) if status not in ('offline','setup') else None,
                     'active_tray':sensor_text(sensor_value(states,selected,'active_tray')) if status not in ('offline','setup') else None,
                     'temps':extras,'layers':layers,'ams':slots})
    return {'connected':connected,'error':error,'printers':rows,'bindings':bindings,
            'candidates':candidates,'auto_assigned':assigned,
            'updated':int(time.time()) if connected else None}

def theme_sun_state():
    """Expose only day/night; never expose HA credentials or other entities."""
    try:
        states=homeassistant_states()
        sun=states.get('sun.sun')
        value=sun.get('state') if isinstance(sun,dict) else None
        if value=='above_horizon':
            return {'theme':'light','source':'sun.sun'}
        if value=='below_horizon':
            return {'theme':'dark','source':'sun.sun'}
    except RuntimeError:
        pass
    return {'theme':None,'source':'system'}


def version_history():
    """Read only the packaged, public changelog; return compact release notes."""
    entries=[]
    try:
        lines=(ROOT/'CHANGELOG.md').read_text(encoding='utf-8').splitlines()
    except OSError:
        lines=[]
    for line in lines:
        heading=re.fullmatch(r'#\s+(\d+\.\d+\.\d+)\s*[·–-]\s*(.+)',line.strip())
        if heading:
            if len(entries)>=12:
                break
            entries.append({'version':heading.group(1),'title':heading.group(2)[:160],'changes':[]})
        elif line.startswith('- ') and entries and len(entries[-1]['changes'])<5:
            entries[-1]['changes'].append(line[2:][:320].replace('`',''))
    return {'version':APP_VERSION,'releases':entries}


class Handler(BaseHTTPRequestHandler):
    server_version='PrintPulseLager/0.1'

    def log_message(self,*args):
        pass  # Never log OAuth codes, paths, credentials or buyer data.

    def allowed(self):
        return self.client_address[0]==INGRESS_PEER

    def send(self,code,content,mime='application/json; charset=utf-8'):
        body=json.dumps(content,ensure_ascii=False).encode() if isinstance(content,(dict,list)) else content
        self.send_response(code)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.etsystatic.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'")
        self.end_headers()
        self.wfile.write(body)

    respond=send

    def do_GET(self):
        if not self.allowed(): return self.send(403,{'error':'Zugriff nur über Home Assistant.'})
        path=urllib.parse.urlsplit(self.path).path
        if path=='/api/status': return self.send(200,overview())
        if path=='/api/theme': return self.send(200,theme_sun_state())
        if path=='/api/versions': return self.send(200,version_history())
        if path=='/api/filaments': return self.send(200,filament_overview())
        if path=='/api/printers':
            params=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            return self.send(200,printer_dashboard(force=params.get('refresh')==['1']))
        if path=='/api/printer-entities': return self.send(200,ha_entity_choices())
        if path=='/api/print-tools':
            params=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            lid=(params.get('listing_id') or [''])[0]
            if lid and (not lid.isdigit() or len(lid)>32):
                return self.send(400,{'error':'Ungültige Produkt-ID.'})
            try:
                return self.send(200,print_tools_overview(lid or None))
            except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
                log.exception('Druckprofile: Abruf fehlgeschlagen (keine gespeicherten Daten verändert)')
                return self.send(500,{'error':'Druckprofile momentan nicht lesbar. Die gespeicherten Druckprofile und 3MF-Dateien bleiben erhalten. Bitte das App-Protokoll prüfen.'})
        if path=='/api/master-download':
            file_id=(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('id') or [''])[0]
            try:
                row,file=master_download_record(file_id)
                with file.open('rb') as stream:
                    self.send_response(200)
                    self.send_header('Content-Type','model/3mf')
                    self.send_header('Content-Length',str(row['bytes']))
                    self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+urllib.parse.quote(row['filename']))
                    self.send_header('X-Content-Type-Options','nosniff')
                    self.send_header('Cache-Control','no-store')
                    self.end_headers()
                    while block:=stream.read(1024*1024): self.wfile.write(block)
                return
            except (ValueError,FileNotFoundError):
                return self.send(404,{'error':'Datei nicht verfügbar.'})
        assets={'/':('index.html','text/html'),'/index.html':('index.html','text/html'),'/app.js':('app.js','application/javascript'),'/style.css':('style.css','text/css'),'/brand.svg':('brand.svg','image/svg+xml')}
        if path in assets:
            name,mime=assets[path]
            return self.send(200,(ROOT/'web'/name).read_bytes(),mime+'; charset=utf-8')
        return self.send(404,{'error':'Nicht gefunden.'})

    def do_POST(self):
        if not self.allowed(): return self.send(403,{'error':'Zugriff nur über Home Assistant.'})
        if urllib.parse.urlsplit(self.path).path=='/api/master-upload':
            if self.headers.get('Sec-Fetch-Site') not in (None,'same-origin','none'):
                return self.send(403,{'error':'Ungültiger Ursprung.'})
            if self.headers.get('Content-Type')!='application/octet-stream' or self.headers.get('X-PP-Upload')!='1':
                return self.send(415,{'error':'3MF-Upload erwartet.'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 4<=length<=MAX_MASTER_SIZE:
                    return self.send(413,{'error':'Maximal 100 MB pro 3MF-Datei.'})
                params=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query,keep_blank_values=True)
                meta={key:(params.get(key) or [''])[0] for key in ('listing_id','variant_id','printer','filename')}
                self.connection.settimeout(120)
                return self.send(200,store_master_file(meta,self.rfile,length))
            except (ValueError,OSError) as exc:
                return self.send(400,{'error':str(exc)[:200]})
            except Exception:
                log.exception('Fehler beim lokalen 3MF-Upload')
                return self.send(500,{'error':'Upload fehlgeschlagen.'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':
            return self.send(415,{'error':'JSON erforderlich.'})
        if self.headers.get('Sec-Fetch-Site') not in (None,'same-origin','none'):
            return self.send(403,{'error':'Ungültiger Ursprung.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 1<=length<=16384: raise ValueError('Ungültige Eingabegröße.')
            self.connection.settimeout(15)
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict): raise ValueError('JSON-Objekt erforderlich.')
            path=urllib.parse.urlsplit(self.path).path
            if path=='/api/printer-config':
                return self.send(200,save_printer_bindings(data))
            if path=='/api/print-profile':
                return self.send(200,save_print_profile(data))
            if path=='/api/filament':
                filament_mutate(data)
                return self.send(200,filament_overview())
            if path=='/api/stock':
                mutate_stock(data)
                return self.send(200,overview())
            if path=='/api/order-print':
                mutate_order_print(data)
                return self.send(200,overview())
            if path=='/api/undo':
                undo_action(str(data.get('id') or ''))
                return self.send(200,overview())
            if path=='/api/mode':
                if type(data.get('enabled')) is not bool: raise ValueError('Ungültiger Modus.')
                with connect() as db:
                    changed=db.execute('UPDATE stock_listings SET made_to_order=? WHERE id=?',(int(data['enabled']),str(data.get('id') or '')))
                    if not changed.rowcount: raise ValueError('Produkt nicht gefunden.')
                return self.send(200,overview())
            if path=='/api/settings':
                days=integer(data.get('days'),1,60)
                threshold=integer(data.get('etsy_alert_threshold',3),1,99)
                with connect() as db:
                    put_cfg(db,'stock_days',days)
                    put_cfg(db,'etsy_alert_threshold',threshold)
                return self.send(200,overview())
            if path == "/api/config":
                if IMPORT_LOCK.locked():
                    raise ValueError("Bitte den laufenden Etsy-Abgleich abwarten.")
                key = str(data.get("keystring", "")).strip()
                secret = str(data.get("shared_secret", "")).strip()
                shop = str(data.get("shop_id", "")).strip()
                callback = str(data.get("callback", "")).strip()
                parsed = urllib.parse.urlsplit(callback)
                if not key or not secret or not shop.isdigit() or parsed.scheme != "https" or not parsed.hostname or parsed.fragment or parsed.query:
                    raise ValueError("Keystring, Shared Secret, numerische Shop-ID und registrierte HTTPS-Callback-URL erforderlich.")
                with connect() as db:
                    if cfg(db,"shop_id") and cfg(db,"shop_id") != shop and db.execute("SELECT 1 FROM stock_listings LIMIT 1").fetchone():
                        raise ValueError("Shopwechsel würde Bestände vermischen. Bitte eine getrennte Installation verwenden.")
                    # Reset only THIS planner's Etsy tokens when identity changes.
                    previous = (cfg(db,"keystring"),cfg(db,"shared_secret"),cfg(db,"shop_id"))
                    for k, v in (("keystring",key),("shared_secret",secret),("shop_id",shop),("callback",callback)):
                        put_cfg(db,k,v)
                    if previous != (key,secret,shop):
                        for k in ("access_token","refresh_token","expires_at","pending_state","pending_verifier","pending_at"):
                            db.execute("DELETE FROM config WHERE k=?", (k,))
                return self.respond(200, {"ok": True})
            if path == "/api/oauth/start":
                with connect() as db:
                    key, callback = cfg(db,"keystring"),cfg(db,"callback")
                    if not key or not callback:
                        raise ValueError("Zuerst Etsy-App konfigurieren.")
                    verifier = secrets.token_urlsafe(48)
                    state = secrets.token_urlsafe(32)
                    put_cfg(db,"pending_verifier",verifier)
                    put_cfg(db,"pending_state",state)
                    put_cfg(db,"pending_at",str(int(time.time())))
                challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
                query = {"response_type":"code", "redirect_uri": callback,"scope":"transactions_r listings_r", "client_id":key,"state":state,"code_challenge":challenge,"code_challenge_method":"S256"}
                return self.respond(200, {"url":OAUTH_AUTH+"?"+urllib.parse.urlencode(query)})
            if path == "/api/oauth/finish":
                redirected = str(data.get("redirected_url", "")).strip()
                parsed = urllib.parse.urlsplit(redirected)
                with connect() as db:
                    registered = cfg(db,"callback")
                    state, verifier = cfg(db,"pending_state"), cfg(db,"pending_verifier")
                    created = int(cfg(db,"pending_at","0"))
                    key = cfg(db,"keystring")
                    if not verifier or time.time()-created>900:
                        raise ValueError("Autorisierung abgelaufen. Bitte neu starten.")
                    clean = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
                    if clean != registered:
                        raise ValueError("Die kopierte Redirect-Adresse stimmt nicht mit deiner registrierten Callback-URL überein.")
                    query = urllib.parse.parse_qs(parsed.query)
                    received_state = (query.get("state") or [""])[0]
                    code = (query.get("code") or [""])[0]
                    if not state or not hmac.compare_digest(state,received_state) or not code:
                        raise ValueError("Ungültiger OAuth-Code oder Status. Bitte erneut autorisieren.")
                    # One-time state invalidated prior to network exchange.
                    for k in ("pending_state","pending_verifier","pending_at"):
                        db.execute("DELETE FROM config WHERE k=?", (k,))
                tokens = token_post({"grant_type":"authorization_code","client_id":key,"redirect_uri":registered,"code":code,"code_verifier":verifier})
                save_tokens(tokens)
                run_sync()
                return self.respond(200, {"ok": True})
            if path == "/api/sync":
                if not run_sync():
                    return self.respond(200, {"ok": True,"running":True})
                return self.respond(202, {"ok": True, "running":True})
            return self.send(404,{'error':'Nicht gefunden.'})
        except EtsyRateLimited as exc:
            return self.send(429,{'error':str(exc)[:300]})
        except RuntimeError as exc:
            return self.send(502,{'error':str(exc)[:300]})
        except (ValueError, TypeError) as exc:
            return self.send(400,{'error':str(exc)[:300]})
        except Exception:
            log.exception('Lokaler Fehler (keine Request-Daten)')
            return self.send(500,{'error':'Aktion fehlgeschlagen. Bitte neu laden und Bestand prüfen.'})


def periodic_sync():
    while True:
        with connect() as db:
            authorized=bool(cfg(db,'access_token'))
        if authorized:
            try:
                run_sync()
            except EtsyRateLimited:
                pass
        time.sleep(RECEIPT_INTERVAL)


if __name__=='__main__':
    init_db()
    threading.Thread(target=periodic_sync,daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0',8099),Handler).serve_forever()
