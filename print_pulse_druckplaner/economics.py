"""Product costing, verified printer releases and investment decisions.

Isolated, additive tables. Etsy inventory/order mutations never pass this module.
All amounts are EUR, grams are physical grams and roll price is the stored
filament_spools.price_cents for the recorded roll weight (default 1000 g).
"""
import json
import math
import time
import re
import html
import urllib.request
import xml.etree.ElementTree as ET
try:
    from . import cost_v2
except ImportError:
    import importlib.util
    from pathlib import Path
    _spec = importlib.util.spec_from_file_location("pp_cost_v2", Path(__file__).with_name("cost_v2.py"))
    cost_v2 = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(cost_v2)
from html.parser import HTMLParser


PRINTERS = ("H2D", "P1S Old", "P1S New", "Snapmaker U1", "A1 mini", "Prusa MK4")
STATUSES = ("untested", "approved", "issue")

PROFILE_FIELDS = (
    "batch_units", "minutes", "power_watts", "energy_eur_kwh",
    "machine_eur_hour", "labor_minutes", "labor_eur_hour",
    "packaging_eur", "other_eur", "selling_eur", "shipping_paid_eur",
    "shipping_cost_eur", "etsy_percent", "etsy_fixed_eur",
    "additional_fee_eur", "etsy_enabled", "offsite_percent",
    "listing_fee_eur", "units_per_order"
)
DEFAULTS = {
    "batch_units": 1, "minutes": 0, "power_watts": 120,
    "energy_eur_kwh": .35, "machine_eur_hour": 0,
    "labor_minutes": 0, "labor_eur_hour": 0,
    "packaging_eur": 0, "other_eur": 0, "selling_eur": 0,
    "shipping_paid_eur": 0, "shipping_cost_eur": 0,
    "etsy_percent": 10.5, "etsy_fixed_eur": .30, "additional_fee_eur": 0,
    "etsy_enabled": 0, "offsite_percent": 0, "listing_fee_eur": 0,
    "units_per_order": 1
}

def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_cost_profiles(
        listing_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '',
        printer TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'untested',
        notes TEXT NOT NULL DEFAULT '',
        fields_json TEXT NOT NULL DEFAULT '{}',
        materials_json TEXT NOT NULL DEFAULT '[]',
        updated INTEGER NOT NULL,
        PRIMARY KEY(listing_id,variant_id,printer));
    CREATE INDEX IF NOT EXISTS pp_cost_listing ON pp_cost_profiles(listing_id);
    CREATE TABLE IF NOT EXISTS pp_investment_scenarios(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        printer TEXT NOT NULL DEFAULT '',
        listing_id TEXT NOT NULL DEFAULT '',
        variant_id TEXT NOT NULL DEFAULT '',
        purchase_eur REAL NOT NULL DEFAULT 0,
        setup_eur REAL NOT NULL DEFAULT 0,
        monthly_units INTEGER NOT NULL DEFAULT 0,
        contribution_eur REAL NOT NULL DEFAULT 0,
        monthly_extra_eur REAL NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_etsy_fee_rates(
        id INTEGER PRIMARY KEY CHECK(id=1), data_json TEXT NOT NULL,
        checked_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pp_cost_history(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '',
        printer TEXT NOT NULL,
        saved INTEGER NOT NULL,
        result_json TEXT NOT NULL);
    """)
    cost_v2.schema(db)


# Initial rates checked against Etsy's official seller-fee pages (27 October 2026).
# USD listing fees are NOT silently treated as EUR.
ETSY_INITIAL = {
    "transaction_percent": 6.5, "payments_percent": 4.0,
    "payments_fixed_eur": .30, "listing_usd": .20,
    "offsite_standard_percent": 15.0, "offsite_reduced_percent": 12.0,
    "usd_per_eur": None, "source": "Etsy Hilfe / EZB", "checked_at": 0
}
ETSY_SOURCES = {
    "fees": "https://help.etsy.com/hc/de/articles/115014" + "483627",
    "payments": "https://help.etsy.com/hc/de/articles/115015" + "628847",
    "offsite": "https://help.etsy.com/hc/de/articles/360000" + "338367-Funktionsweise-von-Etsy-Offsite-Ads",
    "exchange": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
}


class _PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def _source_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PrintPulseFeeChecker/1.0"})
    with urllib.request.urlopen(request, timeout=8) as response:
        if response.status != 200:
            raise ValueError("Gebührenquelle nicht erreichbar.")
        raw = response.read(850000)
    parser = _PlainHTML()
    parser.feed(raw.decode("utf-8", errors="replace"))
    return re.sub(r"\s+", " ", html.unescape(" ".join(parser.parts)))


def _extract(text_value, pattern, label):
    match = re.search(pattern, text_value, re.IGNORECASE)
    if not match:
        raise ValueError("Etsy-Gebühr konnte nicht sicher geprüft werden: " + label)
    return float(match.group(1).replace(",", "."))


def parse_official_rates(fees_text, payments_text, offsite_text, exchange_xml):
    """Fail closed if the official pages changed structure or rates look implausible."""
    rates = {
        "transaction_percent": _extract(fees_text, r"Transaktion\s*(?:[|:-]\s*)?(\d+(?:[,.]\d+)?)\s*%", "Transaktion"),
        "payments_percent": _extract(payments_text, r"Deutschland\s*(\d+(?:[,.]\d+)?)\s*%\s*\+", "Etsy Payments"),
        "payments_fixed_eur": _extract(payments_text, r"Deutschland\s*\d+(?:[,.]\d+)?\s*%\s*\+\s*(\d+(?:[,.]\d+)?)\s*EUR", "Zahlungspauschale"),
        "listing_usd": _extract(fees_text, r"Artikel\s*(?:[|:-]\s*)?(\d+(?:[,.]\d+)?)\s*USD", "Einstellgebühr"),
        "offsite_standard_percent": _extract(offsite_text, r"(?:Standardgebühr|Gebühr\s+von)\s*(\d+(?:[,.]\d+)?)\s*%", "Offsite Standard"),
        "offsite_reduced_percent": _extract(offsite_text, r"(?:reduzierte Gebühr|ermäßigte Gebührenrate)\s*(?:von\s*)?(\d+(?:[,.]\d+)?)\s*%", "Offsite reduziert")
    }
    root = ET.fromstring(exchange_xml)
    usd = next((el.get("rate") for el in root.iter() if el.get("currency") == "USD"), None)
    if usd is None:
        raise ValueError("EZB-USD-Kurs fehlt.")
    rates["usd_per_eur"] = float(usd)
    limits = {"transaction_percent": (0.1, 30), "payments_percent": (0.1, 30),
              "payments_fixed_eur": (.01, 10), "listing_usd": (.01, 10),
              "offsite_standard_percent": (0.1, 35),
              "offsite_reduced_percent": (0.1, 35), "usd_per_eur": (.5, 2.5)}
    if any(not math.isfinite(rates[key]) or not low <= rates[key] <= high
           for key, (low, high) in limits.items()):
        raise ValueError("Unplausible Gebühren oder Wechselkurse. Bestehende Werte bleiben erhalten.")
    rates["checked_at"] = int(time.time())
    rates["source"] = "Etsy Hilfe / EZB"
    return rates


def fetch_official_rates():
    pages = {k: _source_text(ETSY_SOURCES[k]) for k in ("fees", "payments", "offsite")}
    request = urllib.request.Request(ETSY_SOURCES["exchange"], headers={"User-Agent": "PrintPulseFeeChecker/1.0"})
    with urllib.request.urlopen(request, timeout=8) as response:
        exchange = response.read(100000)
    return parse_official_rates(pages["fees"], pages["payments"], pages["offsite"], exchange)


def fee_rates(db):
    row = db.execute("SELECT data_json FROM pp_etsy_fee_rates WHERE id=1").fetchone()
    rates = {**ETSY_INITIAL, **(json.loads(row[0]) if row else {})}
    rates["listing_eur"] = (round(rates["listing_usd"] / rates["usd_per_eur"], 4)
                            if rates.get("usd_per_eur") else None)
    return rates


def store_fee_rates(db, rates):
    keys = ("transaction_percent", "payments_percent", "payments_fixed_eur",
            "listing_usd", "offsite_standard_percent", "offsite_reduced_percent",
            "usd_per_eur", "source", "checked_at")
    clean = {key: rates[key] for key in keys}
    db.execute("INSERT INTO pp_etsy_fee_rates(id,data_json,checked_at) VALUES(1,?,?) "
               "ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,checked_at=excluded.checked_at",
               (json.dumps(clean), clean["checked_at"]))

def text(value, maximum=300):
    if not isinstance(value, str) or len(value) > maximum:
        raise ValueError("Textfeld ungültig oder zu lang.")
    return value.strip()

def number(value, name, minimum=0, maximum=1000000):
    if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(name + ": ungültiger Zahlenwert.")
    return float(value)

def target(db, data):
    listing_id = str(data.get("listing_id") or "")
    variant_id = str(data.get("variant_id") or "")
    printer = data.get("printer")
    if not listing_id.isdigit() or len(listing_id) > 32 or printer not in PRINTERS:
        raise ValueError("Produkt oder Drucker ungültig.")
    if not db.execute("SELECT 1 FROM stock_listings WHERE id=?", (listing_id,)).fetchone():
        raise ValueError("Produkt nicht gefunden.")
    if variant_id and not db.execute(
        "SELECT 1 FROM stock_items WHERE id=? AND listing_id=?", (variant_id, listing_id)
    ).fetchone():
        raise ValueError("Variante gehört nicht zu diesem Produkt.")
    return listing_id, variant_id, printer

def calculate(fields, materials, filaments):
    """Per-piece costs. Print-only profiles do not require a sale price."""
    units = fields["batch_units"]
    missing = []
    material_total = 0.0
    detail = []
    for part in materials:
        filament = filaments.get(part["filament_id"])
        label = ((filament["brand"] + " · " + filament["color"]) if filament else
                 "Filament #" + str(part["filament_id"]))
        price = filament["price_cents"] if filament else None
        if price is None:
            missing.append(label)
            cost = None
        else:
            cost = round(part["grams"] * float(price) / 100 / part["spool_g"], 5)
            material_total += cost
        detail.append({"filament_id": part["filament_id"], "label": label,
                       "grams": part["grams"], "spool_g": part["spool_g"], "cost_eur": cost})
    material_eur = material_total / units if not missing else None
    hours = fields["minutes"] / 60.0
    electricity = hours * fields["power_watts"] / 1000.0 * fields["energy_eur_kwh"] / units
    machine = hours * fields["machine_eur_hour"] / units
    print_eur = (material_eur + electricity + machine) if material_eur is not None else None
    enabled = bool(fields.get("etsy_enabled", 0))
    order_units = max(1, int(fields.get("units_per_order", 1)))
    labor = fields["labor_minutes"] / 60.0 * fields["labor_eur_hour"] if enabled else 0
    fees = 0.0
    other = 0.0
    income = 0.0
    if enabled:
        income = fields["selling_eur"] + fields["shipping_paid_eur"] / order_units
        fees = (income * (fields["etsy_percent"] + fields.get("offsite_percent", 0)) / 100.0
                + fields["etsy_fixed_eur"] / order_units
                + fields.get("listing_fee_eur", 0) + fields["additional_fee_eur"])
        other = (fields["packaging_eur"] + fields["other_eur"]
                 + fields["shipping_cost_eur"] / order_units)
    total = (print_eur + labor + fees + other) if print_eur is not None else None
    complete_print = not missing and bool(materials) and fields["minutes"] > 0
    complete = complete_print and (not enabled or (fields["selling_eur"] > 0 and fields.get("listing_fee_eur", 0) > 0))
    profit = round(income - total, 2) if enabled and complete and total is not None else None
    return {"material_eur": round(material_eur, 2) if material_eur is not None else None,
            "electricity_eur": round(electricity, 2), "machine_eur": round(machine, 2),
            "print_eur": round(print_eur, 2) if print_eur is not None else None,
            "labor_eur": round(labor, 2), "fees_eur": round(fees, 2),
            "other_eur": round(other, 2), "total_eur": round(total, 2) if total is not None else None,
            "revenue_eur": round(income, 2) if enabled else None, "profit_eur": profit,
            "margin_percent": round(profit / income * 100, 1) if profit is not None and income > 0 else None,
            "missing_prices": missing, "materials": detail,
            "minutes_per_unit": round(fields["minutes"] / units, 1),
            "etsy_enabled": enabled, "complete": complete}



def read(db, listing_id=None):
    args = (listing_id,) if listing_id else ()
    where = " WHERE listing_id=?" if listing_id else ""
    rows = [dict(r) for r in db.execute(
        "SELECT * FROM pp_cost_profiles" + where + " ORDER BY listing_id,variant_id,printer", args)]
    cols = {r[1] for r in db.execute("PRAGMA table_info(filament_spools)")}
    extra = ("spool_g" if "spool_g" in cols else "1000 AS spool_g") + "," + (
        "manufacturer_code" if "manufacturer_code" in cols else "'' AS manufacturer_code")
    filaments = {r["id"]: dict(r) for r in db.execute(
        "SELECT id,brand,color,material,color_hex,internal_code,price_cents,stock_qty,open_qty," + extra + " FROM filament_spools")}
    settings = cost_v2.get_settings(db, PRINTERS)
    fees = fee_rates(db)
    for row in rows:
        try:
            raw_fields = json.loads(row.pop("fields_json"))
            materials = json.loads(row.pop("materials_json"))
            if not isinstance(raw_fields, dict) or not isinstance(materials, list):
                raise ValueError("invalid profile")
            fields = {**DEFAULTS, **raw_fields}
            if "etsy_enabled" not in raw_fields and raw_fields.get("selling_eur", 0) > 0:
                fields["etsy_enabled"] = 1  # retain legacy saved sales calculations
            row["fields"], row["materials"] = fields, materials
            row["result"] = (cost_v2.calculate(fields, materials, filaments, settings, row["printer"], fees)
                             if fields.get("calc_version") == 2 else calculate(fields, materials, filaments))
        except (ValueError, TypeError, KeyError, ZeroDivisionError):
            row["fields"], row["materials"] = dict(DEFAULTS), []
            row["result"] = {"complete": False, "missing_prices": ["Profil prüfen"]}
    investments = [dict(r) for r in db.execute(
        "SELECT * FROM pp_investment_scenarios ORDER BY updated DESC,id DESC LIMIT 100")]
    for investment in investments:
        investment["result"] = investment_result(investment)
    return {"profiles": rows, "investments": investments, "printers": list(PRINTERS),
            "filaments": list(filaments.values()), "etsy_fees": fees, "cost_settings": settings,
            "catalog_recommendations": [dict(r) for r in db.execute(
                "SELECT listing_id,variant_id,printer,result_json,updated FROM pp_catalog_cost_recommendations")]}

def save_profile(db, data):
    listing_id, variant_id, printer = target(db, data)
    previous = db.execute("SELECT status,notes FROM pp_cost_profiles WHERE listing_id=? AND variant_id=? AND printer=?",
                          (listing_id, variant_id, printer)).fetchone()
    # Saving cost calculations cannot grant, revoke or alter printer approval.
    status = data.get("status") if data.get("approval_change") is True else (
        previous["status"] if previous else "untested")
    if status not in STATUSES:
        raise ValueError("Druckstatus muss offen, freigegeben oder problematisch sein.")
    notes = text(data.get("notes", previous["notes"] if previous else ""), 1000)
    supplied = data.get("fields")
    if not isinstance(supplied, dict):
        raise ValueError("Kalkulationsdaten fehlen.")
    fields = {}
    for key in PROFILE_FIELDS:
        val = supplied.get(key, DEFAULTS[key])
        maximum = 100 if key in ("etsy_percent", "offsite_percent") else 10000 if key in ("minutes", "labor_minutes", "power_watts") else 100000
        amount = number(val, key, 0, maximum)
        if key in ("batch_units", "units_per_order"):
            if int(amount) != amount or not 1 <= amount <= 1000:
                raise ValueError("Stückzahl muss 1 bis 1000 sein.")
            fields[key] = int(amount)
        elif key == "etsy_enabled":
            if amount not in (0, 1):
                raise ValueError("Etsy-Modus ungültig.")
            fields[key] = int(amount)
        else:
            fields[key] = amount
    if supplied.get("calc_version") == 2:
        fields["calc_version"] = 2
        for key, default in cost_v2.V2_FIELDS.items():
            if key == "calc_version":
                continue
            maximum = 100 if key == "discount_percent" else 100000
            val = number(supplied.get(key, default), key, 0, maximum)
            if key in ("sales_units", "orders_count"):
                if val != int(val) or not 1 <= val <= 1000:
                    raise ValueError("Verkaufs-/Bestellmenge muss 1–1000 sein.")
                fields[key] = int(val)
            elif key in ("shipping_free", "overhead_enabled"):
                if val not in (0, 1):
                    raise ValueError("Schalter muss 0 oder 1 sein.")
                fields[key] = int(val)
            else:
                fields[key] = val
    materials = data.get("materials")
    if not isinstance(materials, list) or len(materials) > 24:
        raise ValueError("Maximal 24 Filamentpositionen erlaubt.")
    clean = []
    for part in materials:
        if not isinstance(part, dict) or type(part.get("filament_id")) is not int:
            raise ValueError("Filamentposition ungültig.")
        fid = part["filament_id"]
        if not db.execute("SELECT 1 FROM filament_spools WHERE id=?", (fid,)).fetchone():
            raise ValueError("Filament existiert nicht mehr. Bitte aktualisieren.")
        grams = number(part.get("grams"), "Verbrauch in Gramm", 0, 100000)
        spool_g = number(part.get("spool_g", 1000), "Spulengewicht", 1, 100000)
        clean.append({"filament_id": fid, "grams": grams, "spool_g": spool_g})
    now = int(time.time())
    db.execute("""INSERT INTO pp_cost_profiles(
        listing_id,variant_id,printer,status,notes,fields_json,materials_json,updated)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(listing_id,variant_id,printer) DO UPDATE SET
        status=excluded.status,notes=excluded.notes,fields_json=excluded.fields_json,
        materials_json=excluded.materials_json,updated=excluded.updated""",
        (listing_id, variant_id, printer, status, notes,
         json.dumps(fields), json.dumps(clean), now))
    # A write captures an immutable calculation snapshot, including then-current filament prices.
    snapshot = next(row for row in read(db, listing_id)["profiles"]
                    if row["variant_id"] == variant_id and row["printer"] == printer)
    db.execute("""INSERT INTO pp_cost_history(listing_id,variant_id,printer,saved,result_json)
                VALUES(?,?,?,?,?)""", (listing_id, variant_id, printer, now,
                json.dumps(snapshot["result"], ensure_ascii=False)))
    return snapshot

def investment_result(row):
    purchase = float(row["purchase_eur"]) + float(row["setup_eur"])
    monthly = int(row["monthly_units"]) * float(row["contribution_eur"]) - float(row["monthly_extra_eur"])
    return {"monthly_net_eur": round(monthly, 2),
            "payback_months": round(purchase / monthly, 1) if monthly > 0 else None,
            "annual_net_eur": round(monthly * 12, 2),
            "investment_eur": round(purchase, 2)}

def save_investment(db, data):
    name = text(data.get("name", ""), 100)
    if not name:
        raise ValueError("Bitte einen Namen für das Szenario angeben.")
    printer = data.get("printer", "")
    if printer not in ("", *PRINTERS):
        raise ValueError("Unbekannter Drucker.")
    lid = str(data.get("listing_id") or "")
    variant = str(data.get("variant_id") or "")
    if lid and (not lid.isdigit() or not db.execute("SELECT 1 FROM stock_listings WHERE id=?", (lid,)).fetchone()):
        raise ValueError("Produkt existiert nicht.")
    fields = {}
    for key in ("purchase_eur", "setup_eur", "contribution_eur", "monthly_extra_eur"):
        fields[key] = number(data.get(key, 0), key, 0, 10000000)
    units = number(data.get("monthly_units", 0), "Zusätzliche Verkäufe", 0, 100000)
    if units != int(units):
        raise ValueError("Zusätzliche Verkäufe müssen ganze Stück sein.")
    notes = text(data.get("notes", ""), 1000)
    identifier = data.get("id")
    now = int(time.time())
    values = (name, printer, lid, variant, fields["purchase_eur"], fields["setup_eur"],
              int(units), fields["contribution_eur"], fields["monthly_extra_eur"], notes, now)
    if identifier in (None, "", 0):
        db.execute("""INSERT INTO pp_investment_scenarios
            (name,printer,listing_id,variant_id,purchase_eur,setup_eur,monthly_units,
             contribution_eur,monthly_extra_eur,notes,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)""", values)
    else:
        if type(identifier) is not int or identifier < 1:
            raise ValueError("Ungültige Szenario-ID.")
        changed = db.execute("""UPDATE pp_investment_scenarios SET
            name=?,printer=?,listing_id=?,variant_id=?,purchase_eur=?,setup_eur=?,
            monthly_units=?,contribution_eur=?,monthly_extra_eur=?,notes=?,updated=?
            WHERE id=?""", (*values, identifier))
        if changed.rowcount != 1:
            raise ValueError("Szenario nicht gefunden.")
    return read(db)

def mutate(db, data):
    action = data.get("action")
    if action == "save-cost-settings":
        cost_v2.save_settings(db, data.get("settings"), PRINTERS)
    elif action == "save-catalog-recommendation":
        listing_id, variant_id, printer = target(db, data)
        snapshot = next((p for p in read(db, listing_id)["profiles"]
                         if p["variant_id"] == variant_id and p["printer"] == printer), None)
        if snapshot is None or not snapshot["result"].get("complete"):
            raise ValueError("Erst eine vollständige Kalkulation speichern.")
        db.execute("INSERT INTO pp_catalog_cost_recommendations(listing_id,variant_id,printer,result_json,updated) "
                   "VALUES(?,?,?,?,?) ON CONFLICT(listing_id,variant_id,printer) DO UPDATE SET "
                   "result_json=excluded.result_json,updated=excluded.updated",
                   (listing_id, variant_id, printer, json.dumps(snapshot["result"], ensure_ascii=False), int(time.time())))
    elif action == "save-profile":
        save_profile(db, data)
    elif action == "save-investment":
        save_investment(db, data)
    elif action == "delete-investment":
        identifier = data.get("id")
        if type(identifier) is not int or identifier < 1:
            raise ValueError("Ungültige Szenario-ID.")
        db.execute("DELETE FROM pp_investment_scenarios WHERE id=?", (identifier,))
    else:
        raise ValueError("Unbekannte Rechneraktion.")
    return read(db)
