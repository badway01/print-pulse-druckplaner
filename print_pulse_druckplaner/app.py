#!/usr/bin/env python3
"""Private Home Assistant ingress-only Etsy production planner."""
import base64
import io
import zipfile
import datetime as dt
import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import contextmanager
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("PP_DATA_DIR", "/data"))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "production.sqlite3"
TZ = ZoneInfo("Europe/Berlin")
API_BASE = "https://api.etsy.com/v3"
OAUTH_AUTH = "https://www.etsy.com/oauth/connect"
OAUTH_TOKEN = "https://api.etsy.com/v3/public/oauth/token"
SYNC_INTERVAL_SEC = 15 * 60
TITLE_REFRESH_SEC = 24 * 60 * 60
IMAGE_REFRESH_SEC = 7 * 24 * 60 * 60
IMAGE_RETRY_SEC = 60 * 60
DISPLAY_VARIANT_NAMES = {
    "color": "Farbe", "colour": "Farbe", "size": "Größe",
    "length": "Länge", "width": "Breite", "height": "Höhe",
    "finish": "Ausführung", "style": "Ausführung",
    "primary color": "Hauptfarbe", "secondary color": "Zweitfarbe",
    "primary colour": "Hauptfarbe", "secondary colour": "Zweitfarbe",
}
PRINTERS = ("H2D", "P1S Old", "P1S New", "Snapmaker U1", "A1 mini", "Prusa MK4")
MAX_3MF_BYTES = 100 * 1024 * 1024
CATALOG_LOCK = threading.Lock()
CATALOG_STATUS = {"running": False, "error": None, "count": 0}
SYNC_LOCK = threading.Lock()
SYNC_STATUS = {"running": False, "at": None, "error": None, "ok": False, "excluded": 0, "review_receipts": []}
# Proxy is the Home Assistant Supervisor ingress gateway. Tests run with PP_DEV=1.
INGRESS_PEER = "172.30.32.2"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("print-pulse")


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


def init_db():
    with connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
          CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS orders (
            receipt_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1,
            due_api TEXT, due_override TEXT, updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS lines (
            transaction_id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL,
            listing_id TEXT NOT NULL, title TEXT NOT NULL,
            qty INTEGER NOT NULL, produced INTEGER NOT NULL DEFAULT 0,
            variants TEXT NOT NULL, variant_key TEXT NOT NULL,
            due_api TEXT,
            FOREIGN KEY (receipt_id) REFERENCES orders(receipt_id)
          );
          CREATE INDEX IF NOT EXISTS idx_lines_receipt ON lines(receipt_id);
          CREATE TABLE IF NOT EXISTS products (
            variant_key TEXT PRIMARY KEY, short_name TEXT, printer TEXT
          );
          CREATE TABLE IF NOT EXISTS listing_titles (
            listing_id TEXT PRIMARY KEY, german_title TEXT NOT NULL,
            checked_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS listing_images (
            listing_id TEXT PRIMARY KEY, image_url TEXT NOT NULL,
            checked_at INTEGER NOT NULL
          );
        """)
        # Additive migration: existing production counts, tokens and names survive.
        for table, column, declaration in (
            ("orders", "created_at", "INTEGER"),
            ("orders", "first_seen", "INTEGER NOT NULL DEFAULT 0"),
            ("products", "stage", "TEXT NOT NULL DEFAULT 'planned'"),
        ):
            columns = {r["name"] for r in db.execute(f"PRAGMA table_info({table})")}
            if column not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")
        db.executescript("""
          CREATE TABLE IF NOT EXISTS catalog (
            id TEXT PRIMARY KEY, listing_id TEXT UNIQUE, title TEXT NOT NULL,
            custom_title TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
            image_url TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS product_files (
            product_id TEXT NOT NULL REFERENCES catalog(id), printer TEXT NOT NULL,
            filename TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
            uploaded_at INTEGER NOT NULL, content BLOB NOT NULL,
            PRIMARY KEY(product_id, printer)
          );
        """)
        db.executescript("""
          CREATE TABLE IF NOT EXISTS print_profiles (
            product_id TEXT NOT NULL REFERENCES catalog(id), printer TEXT NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 1, minutes INTEGER NOT NULL DEFAULT 0,
            slicer TEXT NOT NULL DEFAULT 'Bambu Studio', PRIMARY KEY(product_id,printer)
          );
          CREATE TABLE IF NOT EXISTS reservations (
            transaction_id TEXT PRIMARY KEY REFERENCES lines(transaction_id),
            printer TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0)
          );
        """)
        seed_catalog(db)
        try:
            os.chmod(DB_PATH, 0o600)
        except OSError:
            pass


def seed_catalog(db):
    """Keep a permanent listing catalog, including products in archived orders."""
    db.execute("""INSERT OR IGNORE INTO catalog(id,listing_id,title,updated_at)
                  SELECT 'etsy-' || listing_id, listing_id, MAX(title), ?
                  FROM lines WHERE listing_id != '0' GROUP BY listing_id""", (int(time.time()),))


def catalog_view():
    with connect() as db:
        rows = db.execute("""SELECT c.*,lt.german_title,li.image_url AS cached_image
            FROM catalog c LEFT JOIN listing_titles lt ON c.listing_id=lt.listing_id
            LEFT JOIN listing_images li ON c.listing_id=li.listing_id
            ORDER BY COALESCE(NULLIF(c.custom_title,''),lt.german_title,c.title) COLLATE NOCASE""").fetchall()
        files = [dict(r) for r in db.execute("SELECT product_id,printer,filename,size,sha256,uploaded_at FROM product_files")]
        profiles = [dict(r) for r in db.execute("SELECT * FROM print_profiles")]
    result = []
    for row in rows:
        item = dict(row)
        item["title"] = item["custom_title"] or item.pop("german_title") or html.unescape(item["title"])
        item["image_url"] = safe_etsy_image_url(item.pop("cached_image") or item["image_url"])
        item["files"] = [f for f in files if f["product_id"] == item["id"]]
        item["profiles"] = [p for p in profiles if p["product_id"] == item["id"]]
        result.append(item)
    return {"products": result, "printers": PRINTERS, "sync": dict(CATALOG_STATUS)}


def pull_catalog():
    with connect() as db:
        shop = cfg(db, "shop_id")
    if not shop.isdigit():
        raise ValueError("Bitte zuerst Etsy verbinden.")
    items, offset = [], 0
    while True:
        page = api_request(f"/application/shops/{shop}/listings/active", {"limit": 100, "offset": offset})
        batch = page.get("results")
        if not isinstance(batch, list):
            raise ValueError("Etsy lieferte keinen gültigen Katalog.")
        items.extend(batch)
        offset += len(batch)
        if offset > 10000:
            raise ValueError("Katalog zu groß; bisherige Produkte bleiben erhalten.")
        if len(batch) < 100 or offset >= page.get("count", offset + 1):
            break
        time.sleep(.3)
    # No destructive deletion; local titles, notes and files are never overwritten.
    with connect() as db:
        for item in items:
            lid = str(item.get("listing_id") or "")
            if not lid.isdigit():
                raise ValueError("Ungültige Produkt-ID von Etsy.")
            db.execute("""INSERT INTO catalog(id,listing_id,title,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(listing_id) DO UPDATE SET title=excluded.title,updated_at=excluded.updated_at""",
                ('etsy-' + lid, lid, html.unescape(str(item.get("title") or "Produkt")), int(time.time())))
    # Images are best effort and cached; failure cannot lose a catalog item.
    for item in items:
        get_listing_image(str(item["listing_id"]))
        time.sleep(.3)
    return len(items)


def run_catalog_sync():
    if not CATALOG_LOCK.acquire(blocking=False):
        return False
    CATALOG_STATUS.update(running=True, error=None)
    def job():
        try:
            CATALOG_STATUS["count"] = pull_catalog()
        except Exception as exc:
            CATALOG_STATUS["error"] = str(exc)[:240]
        finally:
            CATALOG_STATUS["running"] = False
            CATALOG_LOCK.release()
    threading.Thread(target=job, daemon=True).start()
    return True


def validate_3mf(data, filename):
    if not filename.lower().endswith('.3mf') or not 1 <= len(data) <= MAX_3MF_BYTES:
        raise ValueError("Bitte eine 3MF-Datei bis 100 MB auswählen.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            names = {x.filename.casefold() for x in entries}
            if (len(entries) > 20000 or '[content_types].xml' not in names
                    or not any(n.endswith('.model') for n in names)
                    or sum(x.file_size for x in entries) > 2 * 1024 * 1024 * 1024
                    or any(x.flag_bits & 1 for x in entries)):
                raise ValueError("Keine unterstützte 3MF-Projektdatei.")
            # Inspect the ZIP directory only. Never extract or execute uploaded content.
    except zipfile.BadZipFile:
        raise ValueError("Die Datei ist kein gültiges 3MF-Archiv.") from None


def cfg(db, key, default=""):
    row = db.execute("SELECT value FROM config WHERE k=?", (key,)).fetchone()
    return row["value"] if row else default


def put_cfg(db, key, value):
    db.execute("INSERT INTO config(k,value) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET value=excluded.value", (key, str(value)))


def due_iso(raw):
    if not raw:
        return None
    try:
        if isinstance(raw, (int, float)) or str(raw).isdigit():
            n = int(raw)
            if n < 946684800:
                return None
            return dt.datetime.fromtimestamp(n, TZ).date().isoformat()
        return dt.date.fromisoformat(str(raw)[:10]).isoformat()
    except (ValueError, OverflowError, OSError):
        return None


def normalized_variants(item):
    result = []
    raw = item.get("variations") or []
    for x in raw:
        if not isinstance(x, dict):
            continue
        name = x.get("formatted_name") or x.get("property_name") or x.get("property") or "Variante"
        val = x.get("formatted_value") or x.get("value") or x.get("values") or ""
        if isinstance(val, list):
            val = ", ".join(map(str, val))
        if str(val).strip():
            result.append({"name": str(name), "value": str(val)})
    if not result:
        for x in item.get("product_data") or []:
            if isinstance(x, dict):
                val = x.get("values") or []
                if isinstance(val, list):
                    val = ", ".join(map(str, val))
                if str(val).strip():
                    result.append({"name": str(x.get("property_name") or "Variante"), "value": str(val)})
    return sorted(result, key=lambda x: (x["name"].casefold(), x["value"].casefold()))


def variant_key(listing_id, variants):
    b = json.dumps([str(listing_id), variants], ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(b.encode("utf-8")).hexdigest()[:32]


def get_german_title(listing_id):
    """German Etsy listing title, with a 24 h cache and an order-title fallback.

    The endpoint is read-only and does not require an extra OAuth scope.
    Never fails a paid-order synchronization just because a title is missing.
    """
    if not listing_id.isdigit() or listing_id == "0":
        return ""
    now = int(time.time())
    with connect() as db:
        cached = db.execute("SELECT german_title,checked_at FROM listing_titles WHERE listing_id=?", (listing_id,)).fetchone()
    if cached and now - cached["checked_at"] < TITLE_REFRESH_SEC:
        return cached["german_title"]
    title = ""
    try:
        # Prefer Etsy's own German wording over automatic machine translation.
        listing = api_request(f"/application/listings/{listing_id}", {"language": "de"})
        if isinstance(listing, dict):
            language = str(listing.get("language") or "").lower()
            fetched = html.unescape(str(listing.get("title") or "")).strip()
            # Etsy may fall back to English; local user-defined names still
            # take priority in the product settings.
            title = fetched
    except Exception as exc:
        log.info("German title for listing %s unavailable: %s", listing_id, exc)
        if cached and cached["german_title"]:
            return cached["german_title"]
        # Short retry after temporary API issues.
        now = int(time.time()) - TITLE_REFRESH_SEC + 1800
    # No guessed translation: the German title cache and manual user override
    # live locally, never as shop-specific data in public source code.
    with connect() as db:
        db.execute("INSERT INTO listing_titles(listing_id,german_title,checked_at) VALUES(?,?,?) "
                   "ON CONFLICT(listing_id) DO UPDATE SET german_title=excluded.german_title,checked_at=excluded.checked_at",
                   (listing_id, title, now))
    return title


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


def get_listing_image(listing_id):
    """Retrieve Etsy's primary listing image, cached locally for 7 days.

    Missing/deactivated images never block production order synchronization.
    No API token or confidential data is embedded in the resulting image URL.
    """
    if not listing_id.isdigit() or listing_id == "0":
        return ""
    now = int(time.time())
    with connect() as db:
        cached = db.execute("SELECT image_url, checked_at FROM listing_images WHERE listing_id=?",
                            (listing_id,)).fetchone()
    if cached and now - cached["checked_at"] < IMAGE_REFRESH_SEC:
        return cached["image_url"]
    image_url = ""
    checked_at = now
    try:
        response = api_request(f"/application/listings/{listing_id}/images")
        images = response.get("results") if isinstance(response, dict) else []
        if not isinstance(images, list):
            images = []
        for entry in sorted((x for x in images if isinstance(x, dict)),
                            key=lambda x: int(x.get("rank") or 999999)):
            # Rank 1 is Etsy's primary (hero) image.
            for dimension in ("url_170x135", "url_570xN", "url_75x75"):
                image_url = safe_etsy_image_url(entry.get(dimension))
                if image_url:
                    break
            if image_url:
                break
    except Exception as exc:
        # Retry temporary errors sooner but retain any previously cached image.
        log.info("Thumbnail for listing %s unavailable: %s", listing_id, exc)
        if cached and cached["image_url"]:
            return cached["image_url"]
        checked_at = now - IMAGE_REFRESH_SEC + IMAGE_RETRY_SEC
    with connect() as db:
        db.execute("""INSERT INTO listing_images(listing_id,image_url,checked_at) VALUES (?,?,?)
                      ON CONFLICT(listing_id) DO UPDATE SET
                      image_url=excluded.image_url, checked_at=excluded.checked_at""",
                   (listing_id, image_url, checked_at))
    return image_url


def german_display_variants(raw):
    result = []
    for item in raw:
        name = html.unescape(str(item.get("name") or "Variante")).strip()
        value = html.unescape(str(item.get("value") or "")).strip()
        name = DISPLAY_VARIANT_NAMES.get(name.casefold(), name)
        result.append({"name": name, "value": value})
    return result


def api_request(endpoint, params=None, method="GET", body=None, retry=True):
    with connect() as db:
        key = cfg(db, "keystring")
        secret = cfg(db, "shared_secret")
        token = cfg(db, "access_token")
        expires = int(cfg(db, "expires_at", "0"))
    if not key or not secret or not token:
        raise RuntimeError("Etsy ist noch nicht vollständig verbunden.")
    if expires < time.time() + 120:
        refresh_token()
        with connect() as db:
            token = cfg(db, "access_token")
    url = API_BASE + endpoint
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"x-api-key": f"{key}:{secret}", "Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": "PrintPulseDruckplaner/0.7"}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=35) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
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


def pull_orders():
    with connect() as db:
        shop_id = cfg(db, "shop_id")
    if not shop_id.isdigit():
        raise RuntimeError("Etsy-Shop-ID fehlt oder ist ungültig.")
    receipts = []
    offset = 0
    while True:
        # Critical: paid+unshipped alone can include old canceled/refunded
        # orders. Etsy explicitly supports was_canceled=false.
        page = api_request(f"/application/shops/{shop_id}/receipts", {"was_paid": "true", "was_shipped": "false", "was_canceled": "false", "limit": 100, "offset": offset, "sort_on": "created", "sort_order": "desc"})
        results = page.get("results") or []
        receipts.extend(results)
        offset += len(results)
        if len(receipts) > 1000:
            raise RuntimeError("Mehr als 1000 offene Bestellungen. Synchronisierung nicht abgeschlossen; bisherige Daten bleiben erhalten.")
        if len(results) < 100 or (isinstance(page.get("count"), int) and offset >= page["count"]):
            break
        time.sleep(0.24)
    normalized_orders = []
    created_dates = {}
    normalized_lines = []
    excluded_count = 0
    review_ids = []
    for order in receipts:
        rid = str(order.get("receipt_id") or "")
        if not rid.isdigit():
            raise RuntimeError("Etsy lieferte eine Bestellung ohne gültige Bestellnummer.")
        status = str(order.get("status") or "").strip().casefold().replace("_", " ").replace("-", " ")
        # Defense in depth: do not rely on API query filters alone.
        # Paid is the only unambiguous production-ready state; canceled,
        # completed and fully refunded orders must never become print jobs.
        if (status in {"canceled", "cancelled", "fully refunded", "completed"}
                or order.get("was_canceled") is True or order.get("is_canceled") is True
                or order.get("was_shipped") is True or order.get("is_shipped") is True
                or order.get("is_fully_refunded") is True):
            excluded_count += 1
            continue
        if status != "paid":
            # Partial refunds, payment processing and unknown statuses must
            # first be resolved in Etsy; do not silently recommend printing.
            review_ids.append(rid)
            continue
        # Fetch each receipt's transactions, even if receipt object embeds fewer fields.
        raw_lines = order.get("transactions")
        if not isinstance(raw_lines, list):
            time.sleep(0.24)  # 5 QPS limit, leaving headroom.
            data = api_request(f"/application/shops/{shop_id}/receipts/{rid}/transactions")
            raw_lines = data.get("results") or []
        if not raw_lines:
            raise RuntimeError(f"Bestellung {rid} enthält keine abrufbaren Artikel. Keine unvollständige Planung übernommen.")
        order_due = due_iso(order.get("expected_ship_date") or order.get("ship_by_date"))
        normalized_orders.append((rid, order_due))
        raw_created = order.get("create_timestamp") or order.get("created_timestamp") or order.get("creation_timestamp")
        try:
            created_dates[rid] = int(raw_created) if raw_created else None
        except (TypeError, ValueError):
            created_dates[rid] = None
        for item in raw_lines:
            txn = str(item.get("transaction_id") or "")
            if not txn.isdigit():
                raise RuntimeError(f"Bestellung {rid} enthält einen Artikel ohne ID.")
            listing_id = str(item.get("listing_id") or "0")
            variants = normalized_variants(item)
            normalized_lines.append((txn, rid, listing_id, str(item.get("title") or "Unbenannt"), int(item.get("quantity") or 0), json.dumps(variants, ensure_ascii=False), variant_key(listing_id, variants), due_iso(item.get("expected_ship_date")) or order_due))
    # Read-only listing metadata. Fetch/cached per listing ID, not per order;
    # an unavailable title or image must never block production planning.
    for listing_id in sorted({row[2] for row in normalized_lines}):
        get_german_title(listing_id)
        time.sleep(0.28)
        get_listing_image(listing_id)
        time.sleep(0.28)  # respect Etsy's 5 QPS limit
    now = int(time.time())
    # One transaction: never partially overwrite cached orders on failure.
    with connect() as db:
        previously_synced = bool(cfg(db, "last_sync"))
        known_receipts = {r[0] for r in db.execute("SELECT receipt_id FROM orders")}
        db.execute("UPDATE orders SET active=0")
        for rid, due in normalized_orders:
            db.execute("INSERT INTO orders(receipt_id,active,due_api,updated_at) VALUES (?,1,?,?) ON CONFLICT(receipt_id) DO UPDATE SET active=1,due_api=excluded.due_api,updated_at=excluded.updated_at", (rid, due, now))
            db.execute("UPDATE orders SET created_at=COALESCE(?,created_at) WHERE receipt_id=?", (created_dates.get(rid), rid))
            if rid not in known_receipts and previously_synced:
                db.execute("UPDATE orders SET first_seen=? WHERE receipt_id=?", (now, rid))
        for txn, rid, listing_id, title, qty, variants, vkey, due in normalized_lines:
            db.execute("""INSERT INTO lines(transaction_id,receipt_id,listing_id,title,qty,variants,variant_key,due_api)
                          VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(transaction_id) DO UPDATE SET
                          receipt_id=excluded.receipt_id,listing_id=excluded.listing_id,title=excluded.title,
                          qty=excluded.qty,variants=excluded.variants,variant_key=excluded.variant_key,due_api=excluded.due_api,
                          produced=MIN(lines.produced,excluded.qty)""", (txn, rid, listing_id, title, qty, variants, vkey, due))
        seed_catalog(db)
        # Remove stale archived orders 90 days after last update; never expose buyer info.
        old = now - 90 * 86400
        db.execute("DELETE FROM lines WHERE receipt_id IN (SELECT receipt_id FROM orders WHERE active=0 AND updated_at < ?)", (old,))
        db.execute("DELETE FROM orders WHERE active=0 AND updated_at < ?", (old,))
        put_cfg(db, "last_sync", now)
    return len(normalized_orders), len(normalized_lines), excluded_count, review_ids


def run_sync():
    if SYNC_STATUS["running"]:
        return False
    SYNC_STATUS["running"] = True
    SYNC_STATUS["error"] = None
    def job():
        try:
            count, n, excluded, review_ids = pull_orders()
            SYNC_STATUS.update({"ok": True, "at": int(time.time()), "error": None, "excluded": excluded, "review_receipts": review_ids})
            log.info("Etsy sync successful: %d active receipts, %d lines, %d excluded, %d to review", count, n, excluded, len(review_ids))
        except Exception as exc:
            log.warning("Etsy sync failed: %s", exc)
            SYNC_STATUS["error"] = str(exc)[:240]
        finally:
            SYNC_STATUS["running"] = False
    threading.Thread(target=job, daemon=True).start()
    return True


def periodic_sync():
    while True:
        time.sleep(SYNC_INTERVAL_SEC)
        with connect() as db:
            authorized = bool(cfg(db, "refresh_token"))
        if authorized:
            run_sync()


def reconcile_reservations(db):
    # A reservation never survives a closed order or exceeds its remaining demand.
    db.execute("""UPDATE reservations SET amount=MIN(amount,COALESCE((
        SELECT MAX(0,l.qty-l.produced) FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id
        WHERE l.transaction_id=reservations.transaction_id AND o.active=1),0))
        WHERE EXISTS (SELECT 1 FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id
          WHERE l.transaction_id=reservations.transaction_id AND o.active=1 AND l.qty>l.produced)""")
    db.execute("""DELETE FROM reservations WHERE NOT EXISTS (
        SELECT 1 FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id
        WHERE l.transaction_id=reservations.transaction_id AND o.active=1 AND l.qty>l.produced)""")


def consume_reservation(db, txn, amount):
    row = db.execute("SELECT amount FROM reservations WHERE transaction_id=?", (txn,)).fetchone()
    if row and amount > 0:
        if amount >= row["amount"]:
            db.execute("DELETE FROM reservations WHERE transaction_id=?", (txn,))
        else:
            db.execute("UPDATE reservations SET amount=amount-? WHERE transaction_id=?", (amount,txn))


def dashboard():
    with connect() as db:
        reconcile_reservations(db)
        rows = db.execute("""SELECT l.transaction_id,l.receipt_id,l.listing_id,l.title,l.qty,l.produced,l.variants,l.variant_key,
                        COALESCE(o.due_override,l.due_api,o.due_api) AS due, p.short_name,p.printer,
                        lt.german_title, li.image_url, o.created_at, o.first_seen, p.stage, c.custom_title AS catalog_title
                        FROM lines l JOIN orders o ON l.receipt_id=o.receipt_id
                        LEFT JOIN products p ON l.variant_key=p.variant_key
                        LEFT JOIN catalog c ON l.listing_id=c.listing_id
                        LEFT JOIN listing_titles lt ON l.listing_id=lt.listing_id
                        LEFT JOIN listing_images li ON l.listing_id=li.listing_id
                        WHERE o.active=1 ORDER BY l.receipt_id DESC""").fetchall()
        shop = cfg(db, "shop_id")
        shop_configured = bool(cfg(db, "keystring") and cfg(db, "shared_secret") and shop and cfg(db, "callback"))
        authorized = bool(cfg(db, "refresh_token"))
        last_sync = int(cfg(db, "last_sync", "0"))
        pending = bool(cfg(db, "pending_state"))
        seen_at = int(cfg(db, "orders_seen_at", "0"))
        reserved = {r["transaction_id"]: dict(r) for r in db.execute("SELECT * FROM reservations")}
        profiles = {(r["product_id"],r["printer"]):dict(r) for r in db.execute("SELECT * FROM print_profiles")}
        files = {(r["product_id"],r["printer"]) for r in db.execute("SELECT product_id,printer FROM product_files")}
        product_ids = {r["listing_id"]:r["id"] for r in db.execute("SELECT id,listing_id FROM catalog")}

    groups = {}
    today = dt.datetime.now(TZ).date().isoformat()
    for r in rows:
        line = dict(r)
        line["variants"] = german_display_variants(json.loads(line["variants"]))
        line["remaining"] = max(0, line["qty"] - line["produced"])
        line["new_today"] = due_iso(line["created_at"]) == today
        line["unseen"] = line["first_seen"] > seen_at
        line["reserved"] = reserved.get(line["transaction_id"],{}).get("amount",0)
        line["reserved_printer"] = reserved.get(line["transaction_id"],{}).get("printer","")
        key = line["variant_key"]
        if key not in groups:
            groups[key] = {"key": key, "title": line["short_name"] or line["catalog_title"] or line["german_title"] or html.unescape(line["title"]), "listing_id": line["listing_id"],
                "image_url": safe_etsy_image_url(line["image_url"]),
                "printer": line["printer"] or "", "variants": line["variants"], "qty": 0, "remaining": 0,
                "due": None, "missing_due": False, "lines": [], "stage": line["stage"] or "planned", "new_today": False, "unseen": False}
        group = groups[key]
        group["new_today"] |= line["new_today"]
        group["unseen"] |= line["unseen"]
        group["qty"] += line["qty"]
        group["remaining"] += line["remaining"]
        if line["due"]:
            group["due"] = min(group["due"], line["due"]) if group["due"] else line["due"]
        else:
            group["missing_due"] = True
        group["lines"].append({k: line[k] for k in ("transaction_id", "receipt_id", "qty", "produced", "remaining", "due", "new_today", "unseen", "reserved", "reserved_printer")})
    all_groups = list(groups.values())
    for g in all_groups:
        g["reserved"] = sum(l["reserved"] for l in g["lines"])
        g["available"] = max(0,g["remaining"]-g["reserved"]) if g["stage"] != "printing" else 0
        if g["remaining"] == 0:
            g["stage"] = "done"
        g["lines"].sort(key=lambda l: (l["due"] is None, l["due"] or "9999", l["receipt_id"]))
    all_groups.sort(key=lambda g: (g["remaining"] == 0, g["due"] is None, g["due"] or "9999", g["title"].casefold()))
    pending_groups = [g for g in all_groups if g["remaining"] > 0]
    # Propose a single plate per variant, using earliest still-unreserved deadline.
    busy = {r["printer"] for r in reserved.values()}
    busy.update(g["printer"] for g in all_groups if g["stage"]=="printing" and g["printer"])
    suggestions = []
    for g in pending_groups:
        if not g["available"] or g["reserved"]:
            continue
        pid = product_ids.get(g["listing_id"])
        candidates = [p for p in PRINTERS if (pid,p) in files]
        printer = g["printer"] or next((p for p in candidates if p not in busy), next(iter(candidates), ""))
        profile = profiles.get((pid,printer),{})
        amount = min(g["available"], profile.get("capacity",1))
        available_lines = [l for l in g["lines"] if l["remaining"]>l["reserved"]]
        due = min((l["due"] for l in available_lines if l["due"]),default=None)
        suggestions.append({"key":g["key"],"title":g["title"],"variants":g["variants"],
            "printer":printer,"amount":amount,"available":g["available"],"due":due,
            "minutes":profile.get("minutes",0),"has_profile":bool(profile),
            "has_file":(pid,printer) in files,"busy":printer in busy,
            "missing_due":any(not l["due"] for l in available_lines)})
    suggestions.sort(key=lambda s:(s["due"] is None,s["due"] or "9999",s["busy"],-s["available"],s["title"]))
    return {"suggestions":suggestions, "configured": shop_configured, "authorized": authorized, "oauth_pending": pending,
            "shop_id": shop, "last_sync": last_sync, "sync": dict(SYNC_STATUS),
            "new_today": len({r["receipt_id"] for r in rows if due_iso(r["created_at"]) == today}),
            "unseen_orders": len({r["receipt_id"] for r in rows if r["first_seen"] > seen_at}),
            "orders": len({r["receipt_id"] for r in rows}), "positions": len(rows),
            "missing_dates": len({r["receipt_id"] for r in rows if not r["due"]}),
            "open_units": sum(g["remaining"] for g in all_groups), "groups": pending_groups,
            "done_groups": [g for g in all_groups if g["remaining"] == 0]}


class Handler(BaseHTTPRequestHandler):
    server_version = "PrintPulse/0.8"
    def log_message(self, fmt, *args):
        # Deliberately avoid logging paths that might contain OAuth codes.
        log.debug("Request %s", self.command)

    def respond(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.end_headers()
        self.wfile.write(data)

    def allowed(self):
        return self.client_address[0] == INGRESS_PEER

    def json_body(self, max_bytes=16384):
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > max_bytes:
            raise ValueError("Ungültige Eingabegröße")
        obj = json.loads(self.rfile.read(length))
        if not isinstance(obj, dict):
            raise ValueError("JSON-Objekt erforderlich")
        return obj

    def do_GET(self):
        if not self.allowed():
            return self.respond(403, {"error": "Zugriff nur über Home Assistant"})
        path = urllib.parse.urlsplit(self.path).path
        if path in ("/", "/index.html"):
            return self.static_file("index.html", "text/html; charset=utf-8")
        if path in ("/app.js", "/style.css"):
            return self.static_file(path[1:], "application/javascript; charset=utf-8" if path.endswith(".js") else "text/css; charset=utf-8")
        if path == "/brand.png":
            return self.static_file("brand.png", "image/png")
        if path == "/api/catalog":
            return self.respond(200, catalog_view())
        if path == "/api/file":
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            with connect() as db:
                row = db.execute("SELECT filename,content FROM product_files WHERE product_id=? AND printer=?",
                                 ((query.get("product_id") or [""])[0], (query.get("printer") or [""])[0])).fetchone()
            if not row:
                return self.respond(404, {"error": "Druckdatei nicht gefunden"})
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(row["content"])))
            self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(row["filename"], safe=""))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(row["content"])
            return
        if path == "/api/status":
            return self.respond(200, dashboard())
        if path == "/api/export":
            with connect() as db:
                orders = [dict(x) for x in db.execute("SELECT receipt_id,due_override FROM orders WHERE active=1")]
                progress = [dict(x) for x in db.execute("SELECT transaction_id,produced FROM lines WHERE produced>0")]
                products = [dict(x) for x in db.execute("SELECT variant_key,short_name,printer FROM products")]
            return self.respond(200, {"version": 1, "orders": orders, "progress": progress, "products": products})
        return self.respond(404, {"error": "Nicht gefunden"})

    def static_file(self, name, mime):
        contents = (ROOT / "web" / name).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(contents)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.etsystatic.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'")
        self.end_headers()
        self.wfile.write(contents)

    def upload_3mf(self):
        if self.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none"):
            return self.respond(403, {"error": "Ungültiger Ursprung"})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/octet-stream":
            return self.respond(415, {"error": "Binäre 3MF-Datei erforderlich"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= MAX_3MF_BYTES:
                raise ValueError("Die 3MF-Datei darf höchstens 100 MB groß sein.")
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            pid = (query.get("product_id") or [""])[0]
            printer = (query.get("printer") or [""])[0]
            filename = (query.get("filename") or [""])[0]
            if printer not in PRINTERS or len(filename)>180 or not filename or any(ord(c)<32 or c in '/\\' for c in filename):
                raise ValueError("Ungültiger Drucker oder Dateiname")
            with connect() as db:
                if not db.execute("SELECT 1 FROM catalog WHERE id=?", (pid,)).fetchone():
                    raise ValueError("Produkt zuerst speichern.")
            self.connection.settimeout(120)
            payload = self.rfile.read(length)
            if len(payload) != length:
                raise ValueError("Upload unvollständig; bitte erneut versuchen.")
            validate_3mf(payload, filename)
            with connect() as db:
                db.execute("""INSERT INTO product_files(product_id,printer,filename,size,sha256,uploaded_at,content)
                    VALUES(?,?,?,?,?,?,?) ON CONFLICT(product_id,printer) DO UPDATE SET
                    filename=excluded.filename,size=excluded.size,sha256=excluded.sha256,
                    uploaded_at=excluded.uploaded_at,content=excluded.content""",
                    (pid,printer,filename,len(payload),hashlib.sha256(payload).hexdigest(),int(time.time()),payload))
            return self.respond(200, {"ok": True})
        except (ValueError, OSError) as exc:
            return self.respond(400, {"error": str(exc)[:240]})

    def do_POST(self):
        if not self.allowed():
            return self.respond(403, {"error": "Zugriff nur über Home Assistant"})
        # Binary uploads have the same ingress and same-origin boundary as JSON.
        if urllib.parse.urlsplit(self.path).path == "/api/file":
            return self.upload_3mf()
        # JSON only; no CORS; the browser sends same-origin only.
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.respond(415, {"error": "JSON erforderlich"})
        # Ingress may rewrite the Host header. Sec-Fetch-Site is the reliable
        # browser signal; application/json is intentionally not CORS-enabled.
        site = self.headers.get("Sec-Fetch-Site")
        if site and site not in ("same-origin", "none"):
            return self.respond(403, {"error": "Ungültiger Ursprung"})
        try:
            path = urllib.parse.urlsplit(self.path).path
            data = self.json_body(max_bytes=2097152 if path == "/api/import" else 16384)
            if path == "/api/profile":
                pid, printer = str(data.get("product_id", "")), str(data.get("printer", ""))
                capacity, minutes, slicer = data.get("capacity"), data.get("minutes"), data.get("slicer")
                if (printer not in PRINTERS or type(capacity) is not int or not 1<=capacity<=5000
                    or type(minutes) is not int or not 0<=minutes<=43200
                    or slicer not in ("Bambu Studio","OrcaSlicer","Snapmaker Orca","PrusaSlicer")):
                    raise ValueError("Druckprofil ungültig: 1–5000 Stück, 0–43200 Minuten.")
                with connect() as db:
                    if not db.execute("SELECT 1 FROM catalog WHERE id=?",(pid,)).fetchone():
                        raise ValueError("Produkt nicht gefunden")
                    db.execute("""INSERT INTO print_profiles VALUES(?,?,?,?,?) ON CONFLICT(product_id,printer)
                        DO UPDATE SET capacity=excluded.capacity,minutes=excluded.minutes,slicer=excluded.slicer""",
                        (pid,printer,capacity,minutes,slicer))
                return self.respond(200,{"ok":True})
            if path == "/api/reserve":
                key, printer, amount = str(data.get("key","")), str(data.get("printer","")), data.get("amount")
                if printer not in PRINTERS or type(amount) is not int or not 1<=amount<=5000:
                    raise ValueError("Bitte Drucker und gültige Stückzahl auswählen.")
                with connect() as db:
                    db.execute("BEGIN IMMEDIATE")
                    reconcile_reservations(db)
                    if db.execute("SELECT 1 FROM reservations r JOIN lines l ON l.transaction_id=r.transaction_id WHERE r.printer=? OR l.variant_key=?",(printer,key)).fetchone():
                        raise ValueError("Dieser Drucker hat bereits eine Reservierung. Erst abschließen oder freigeben.")
                    if db.execute("""SELECT 1 FROM products p JOIN lines l ON l.variant_key=p.variant_key
                        JOIN orders o ON o.receipt_id=l.receipt_id WHERE p.stage='printing' AND o.active=1
                        AND l.qty>l.produced AND (p.printer=? OR p.variant_key=?)""",(printer,key)).fetchone():
                        raise ValueError("Drucker oder Variante ist bereits als Im Druck markiert.")
                    lines=db.execute("""SELECT l.transaction_id,MAX(0,l.qty-l.produced-COALESCE(r.amount,0)) AS available
                        FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id
                        LEFT JOIN reservations r ON r.transaction_id=l.transaction_id
                        WHERE o.active=1 AND l.variant_key=? AND r.transaction_id IS NULL
                        ORDER BY COALESCE(o.due_override,l.due_api,o.due_api,'9999'),l.transaction_id""",(key,)).fetchall()
                    if amount>sum(l["available"] for l in lines):
                        raise ValueError("Menge inzwischen eingeplant oder gedruckt. Bitte aktualisieren.")
                    left=amount
                    for line in lines:
                        add=min(left,line["available"])
                        if add:
                            db.execute("INSERT INTO reservations VALUES(?,?,?)",(line["transaction_id"],printer,add))
                            left-=add
                        if not left: break
                return self.respond(200,{"ok":True})
            if path == "/api/reservation/delete":
                with connect() as db:
                    db.execute("DELETE FROM reservations WHERE transaction_id IN (SELECT transaction_id FROM lines WHERE variant_key=?)",(str(data.get("key","")),))
                return self.respond(200,{"ok":True})
            if path == "/api/seen":
                with connect() as db:
                    put_cfg(db, "orders_seen_at", int(time.time()))
                return self.respond(200, {"ok": True})
            if path == "/api/stage":
                key, stage = str(data.get("key", "")), data.get("stage")
                if stage not in ("planned", "printing"):
                    raise ValueError("Ungültiger Produktionsstatus")
                with connect() as db:
                    if not db.execute("SELECT 1 FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id WHERE o.active=1 AND l.variant_key=? AND l.produced<l.qty", (key,)).fetchone():
                        raise ValueError("Keine offene Druckposition gefunden")
                    db.execute("INSERT INTO products(variant_key,stage) VALUES(?,?) ON CONFLICT(variant_key) DO UPDATE SET stage=excluded.stage", (key, stage))
                return self.respond(200, {"ok": True})
            if path == "/api/catalog/sync":
                run_catalog_sync()
                return self.respond(202, {"ok": True})
            if path == "/api/catalog/save":
                pid = str(data.get("id") or secrets.token_hex(16))
                title = str(data.get("title") or "").strip()
                notes = str(data.get("notes") or "").strip()
                lid = str(data.get("listing_id") or "").strip() or None
                if (not re.fullmatch(r"[a-zA-Z0-9-]{1,80}", pid) or not title or len(title)>200
                        or len(notes)>4000 or (lid and not re.fullmatch(r"[0-9]{1,24}", lid))):
                    raise ValueError("Produktname, Notizen oder Etsy-ID ungültig.")
                with connect() as db:
                    other = db.execute("SELECT id FROM catalog WHERE listing_id=? AND id!=?", (lid, pid)).fetchone()
                    if other:
                        raise ValueError("Diese Etsy-ID ist bereits im Katalog hinterlegt.")
                    db.execute("""INSERT INTO catalog(id,listing_id,title,custom_title,notes,updated_at) VALUES(?,?,?,?,?,?)
                        ON CONFLICT(id) DO UPDATE SET listing_id=excluded.listing_id,custom_title=excluded.custom_title,
                        notes=excluded.notes,updated_at=excluded.updated_at""", (pid,lid,title,title,notes,int(time.time())))
                return self.respond(200, {"ok": True, "id": pid})
            if path == "/api/file/delete":
                with connect() as db:
                    db.execute("DELETE FROM product_files WHERE product_id=? AND printer=?", (str(data.get("product_id", "")), str(data.get("printer", ""))))
                return self.respond(200, {"ok": True})
            if path == "/api/import":
                # Migration of production state only, after fresh OAuth and sync.
                # Never accepts credentials, buyer details or arbitrary columns.
                if data.get("version") != 1:
                    raise ValueError("Unbekanntes Sicherungsformat.")
                orders = data.get("orders")
                progress = data.get("progress")
                products = data.get("products")
                if (not isinstance(orders, list) or not isinstance(progress, list)
                        or not isinstance(products, list)
                        or len(orders) > 1000 or len(progress) > 10000
                        or len(products) > 10000):
                    raise ValueError("Sicherungsformat oder Anzahl der Einträge ungültig.")
                # Validate everything before starting the transaction.
                parsed_orders, parsed_progress, parsed_products = [], [], []
                for o in orders:
                    if not isinstance(o, dict) or not str(o.get("receipt_id", "")).isdigit():
                        raise ValueError("Ungültige Bestellnummer in der Sicherung.")
                    rid = str(o["receipt_id"])
                    date = o.get("due_override")
                    if date is not None and (not isinstance(date, str) or due_iso(date) != date):
                        raise ValueError("Ungültiger Versandtermin in der Sicherung.")
                    parsed_orders.append((date, rid))
                for p in progress:
                    if not isinstance(p, dict) or not str(p.get("transaction_id", "")).isdigit():
                        raise ValueError("Ungültige Position in der Sicherung.")
                    produced = p.get("produced")
                    if type(produced) is not int or produced < 0 or produced > 100000:
                        raise ValueError("Ungültige Druckmenge in der Sicherung.")
                    parsed_progress.append((produced, str(p["transaction_id"])))
                for p in products:
                    if not isinstance(p, dict):
                        raise ValueError("Ungültiges Produkt in der Sicherung.")
                    key = p.get("variant_key")
                    if not isinstance(key, str) or not re.fullmatch(r"[a-f0-9]{32}", key):
                        raise ValueError("Ungültiger Variantenschlüssel in der Sicherung.")
                    short, printer = p.get("short_name"), p.get("printer")
                    if (short is not None and (not isinstance(short, str) or len(short) > 100)) or (printer is not None and (not isinstance(printer, str) or len(printer) > 60)):
                        raise ValueError("Ungültige Produktbezeichnung in der Sicherung.")
                    parsed_products.append((key, short, printer))
                with connect() as db:
                    if not cfg(db, "last_sync"):
                        raise ValueError("Bitte erst Etsy verbinden und erfolgreich synchronisieren.")
                    applied = {"orders": 0, "progress": 0, "products": 0}
                    for date, rid in parsed_orders:
                        cur = db.execute("UPDATE orders SET due_override=? WHERE receipt_id=? AND active=1", (date, rid))
                        applied["orders"] += cur.rowcount
                    for produced, txn in parsed_progress:
                        cur = db.execute("UPDATE lines SET produced=MIN(qty,?) WHERE transaction_id=? AND receipt_id IN (SELECT receipt_id FROM orders WHERE active=1)", (produced,txn))
                        applied["progress"] += cur.rowcount
                    for key, short, printer in parsed_products:
                        # Only accept product keys belonging to an active Etsy position.
                        exists = db.execute("SELECT 1 FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id WHERE l.variant_key=? AND o.active=1 LIMIT 1", (key,)).fetchone()
                        if exists:
                            db.execute("INSERT INTO products(variant_key,short_name,printer) VALUES(?,?,?) ON CONFLICT(variant_key) DO UPDATE SET short_name=excluded.short_name, printer=excluded.printer", (key,short,printer))
                            applied["products"] += 1
                return self.respond(200, {"ok": True, "applied": applied})
            if path == "/api/config":
                key = str(data.get("keystring", "")).strip()
                secret = str(data.get("shared_secret", "")).strip()
                shop = str(data.get("shop_id", "")).strip()
                callback = str(data.get("callback", "")).strip()
                parsed = urllib.parse.urlsplit(callback)
                if not key or not secret or not shop.isdigit() or parsed.scheme != "https" or not parsed.hostname or parsed.fragment or parsed.query:
                    raise ValueError("Keystring, Shared Secret, numerische Shop-ID und registrierte HTTPS-Callback-URL erforderlich.")
                with connect() as db:
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
                query = {"response_type":"code", "redirect_uri": callback,"scope":"transactions_r", "client_id":key,"state":state,"code_challenge":challenge,"code_challenge_method":"S256"}
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
            if path == "/api/due":
                rid = str(data.get("receipt_id", ""))
                date = str(data.get("due", "")).strip()
                if date and due_iso(date) != date:
                    raise ValueError("Datum muss JJJJ-MM-TT sein.")
                with connect() as db:
                    result = db.execute("UPDATE orders SET due_override=? WHERE receipt_id=? AND active=1", (date or None,rid))
                    if result.rowcount < 1:
                        raise ValueError("Bestellung nicht gefunden")
                return self.respond(200, {"ok": True})
            if path == "/api/batch":
                vkey = str(data.get("key", ""))
                amount = data.get("amount")
                if not isinstance(amount, int) or isinstance(amount, bool) or amount < 1 or amount > 5000:
                    raise ValueError("Bitte eine gültige Stückzahl eingeben.")
                with connect() as db:
                    lines = db.execute("""SELECT l.transaction_id,l.qty,l.produced,COALESCE(o.due_override,l.due_api,o.due_api) AS due
                        FROM lines l JOIN orders o ON l.receipt_id=o.receipt_id
                        WHERE o.active=1 AND l.variant_key=?""", (vkey,)).fetchall()
                    lines = sorted(lines, key=lambda x: (x["due"] is None, x["due"] or "9999", x["transaction_id"]))
                    remaining = sum(max(0, x["qty"]-x["produced"]) for x in lines)
                    if amount > remaining:
                        raise ValueError(f"Es sind nur noch {remaining} Stück offen.")
                    left = amount
                    for line in lines:
                        add = min(max(0, line["qty"]-line["produced"]), left)
                        if add:
                            db.execute("UPDATE lines SET produced=produced+? WHERE transaction_id=?", (add,line["transaction_id"]))
                            consume_reservation(db,line["transaction_id"],add)
                            left -= add
                        if left == 0:
                            break
                    db.execute("UPDATE products SET stage='planned' WHERE variant_key=? AND NOT EXISTS (SELECT 1 FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id WHERE o.active=1 AND l.variant_key=? AND l.produced<l.qty)", (vkey,vkey))
                return self.respond(200, {"ok": True})
            if path == "/api/progress":
                txn = str(data.get("transaction_id", ""))
                qty = data.get("produced")
                if not isinstance(qty,int) or isinstance(qty,bool):
                    raise ValueError("Menge muss eine ganze Zahl sein.")
                with connect() as db:
                    line = db.execute("SELECT l.qty,l.produced FROM lines l JOIN orders o ON o.receipt_id=l.receipt_id WHERE l.transaction_id=? AND o.active=1", (txn,)).fetchone()
                    if line is None or not (0 <= qty <= line["qty"]):
                        raise ValueError("Menge außerhalb der Bestellposition")
                    consume_reservation(db,txn,max(0,qty-line["produced"]))
                    db.execute("UPDATE lines SET produced=? WHERE transaction_id=?", (qty,txn))
                return self.respond(200,{"ok":True})
            if path == "/api/product":
                key = str(data.get("key", ""))
                short = str(data.get("short_name", "")).strip()[:100]
                printer = str(data.get("printer", "")).strip()[:60]
                if not re.fullmatch(r"[a-f0-9]{32}", key):
                    raise ValueError("Ungültiger Produktschlüssel")
                with connect() as db:
                    db.execute("INSERT INTO products(variant_key,short_name,printer) VALUES (?,?,?) ON CONFLICT(variant_key) DO UPDATE SET short_name=excluded.short_name,printer=excluded.printer",(key,short,printer))
                return self.respond(200,{"ok":True})
            return self.respond(404,{"error":"Nicht gefunden"})
        except (ValueError,KeyError,json.JSONDecodeError) as exc:
            return self.respond(400,{"error":str(exc)[:240]})
        except Exception as exc:
            log.warning("Request failed (%s): %s", urllib.parse.urlsplit(self.path).path, exc)
            return self.respond(500,{"error":str(exc)[:240]})


if __name__ == "__main__":
    init_db()
    threading.Thread(target=periodic_sync,daemon=True).start()
    log.info("Starting local production planner ingress server on port 8099")
    ThreadingHTTPServer(("0.0.0.0",8099), Handler).serve_forever()
