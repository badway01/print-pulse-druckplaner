"""Product costing, verified printer releases and investment decisions.

Isolated, additive tables. Etsy inventory/order mutations never pass this module.
All amounts are EUR, grams are physical grams and roll price is the stored
filament_spools.price_cents for the recorded roll weight (default 1000 g).
"""
import json
import math
import time

PRINTERS = ("H2D", "P1S Old", "P1S New", "Snapmaker U1", "A1 mini", "Prusa MK4")
STATUSES = ("untested", "approved", "issue")

PROFILE_FIELDS = (
    "batch_units", "minutes", "power_watts", "energy_eur_kwh",
    "machine_eur_hour", "labor_minutes", "labor_eur_hour",
    "packaging_eur", "other_eur", "selling_eur", "shipping_paid_eur",
    "shipping_cost_eur", "etsy_percent", "etsy_fixed_eur",
    "additional_fee_eur"
)
DEFAULTS = {
    "batch_units": 1, "minutes": 0, "power_watts": 120,
    "energy_eur_kwh": .35, "machine_eur_hour": 0,
    "labor_minutes": 0, "labor_eur_hour": 0,
    "packaging_eur": 0, "other_eur": 0, "selling_eur": 0,
    "shipping_paid_eur": 0, "shipping_cost_eur": 0,
    "etsy_percent": 0, "etsy_fixed_eur": 0, "additional_fee_eur": 0
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
    CREATE TABLE IF NOT EXISTS pp_cost_history(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '',
        printer TEXT NOT NULL,
        saved INTEGER NOT NULL,
        result_json TEXT NOT NULL);
    """)

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
    """Results per sale unit. Unknown prices remain unknown, never invented."""
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
    material_eur = round(material_total / units, 4) if not missing else None
    hours = fields["minutes"] / 60.0
    electricity = hours * fields["power_watts"] / 1000.0 * fields["energy_eur_kwh"] / units
    machine = hours * fields["machine_eur_hour"] / units
    labor = fields["labor_minutes"] / 60.0 * fields["labor_eur_hour"] / units
    fees = ((fields["selling_eur"] + fields["shipping_paid_eur"]) *
            fields["etsy_percent"] / 100.0 + fields["etsy_fixed_eur"] + fields["additional_fee_eur"])
    other = fields["packaging_eur"] + fields["other_eur"] + fields["shipping_cost_eur"]
    total = (material_eur + electricity + machine + labor + fees + other) if material_eur is not None else None
    income = fields["selling_eur"] + fields["shipping_paid_eur"]
    profit = round(income - total, 2) if total is not None else None
    return {"material_eur": round(material_eur, 2) if material_eur is not None else None,
            "electricity_eur": round(electricity, 2), "machine_eur": round(machine, 2),
            "labor_eur": round(labor, 2), "fees_eur": round(fees, 2),
            "other_eur": round(other, 2), "total_eur": round(total, 2) if total is not None else None,
            "revenue_eur": round(income, 2), "profit_eur": profit,
            "margin_percent": round(profit / income * 100, 1) if profit is not None and income > 0 else None,
            "missing_prices": missing, "materials": detail,
            "minutes_per_unit": round(fields["minutes"] / units, 1),
            "complete": not missing and bool(materials) and fields["minutes"] > 0 and fields["selling_eur"] > 0}

def read(db, listing_id=None):
    args = (listing_id,) if listing_id else ()
    where = " WHERE listing_id=?" if listing_id else ""
    rows = [dict(r) for r in db.execute(
        "SELECT * FROM pp_cost_profiles" + where + " ORDER BY listing_id,variant_id,printer", args)]
    filaments = {r["id"]: dict(r) for r in db.execute(
        "SELECT id,brand,color,material,color_hex,internal_code,price_cents,stock_qty,open_qty FROM filament_spools")}
    for row in rows:
        try:
            raw_fields = json.loads(row.pop("fields_json"))
            materials = json.loads(row.pop("materials_json"))
            if not isinstance(raw_fields, dict) or not isinstance(materials, list):
                raise ValueError("invalid profile")
            fields = {**DEFAULTS, **raw_fields}
            row["fields"], row["materials"] = fields, materials
            row["result"] = calculate(fields, materials, filaments)
        except (ValueError, TypeError, KeyError, ZeroDivisionError):
            row["fields"], row["materials"] = dict(DEFAULTS), []
            row["result"] = {"complete": False, "missing_prices": ["Profil prüfen"]}
    investments = [dict(r) for r in db.execute(
        "SELECT * FROM pp_investment_scenarios ORDER BY updated DESC,id DESC LIMIT 100")]
    for investment in investments:
        investment["result"] = investment_result(investment)
    return {"profiles": rows, "investments": investments, "printers": list(PRINTERS),
            "filaments": list(filaments.values())}

def save_profile(db, data):
    listing_id, variant_id, printer = target(db, data)
    status = data.get("status")
    if status not in STATUSES:
        raise ValueError("Druckstatus muss offen, freigegeben oder problematisch sein.")
    notes = text(data.get("notes", ""), 1000)
    supplied = data.get("fields")
    if not isinstance(supplied, dict):
        raise ValueError("Kalkulationsdaten fehlen.")
    fields = {}
    for key in PROFILE_FIELDS:
        val = supplied.get(key, DEFAULTS[key])
        maximum = 100 if key == "etsy_percent" else 10000 if key in ("minutes", "labor_minutes", "power_watts") else 100000
        amount = number(val, key, 0, maximum)
        if key == "batch_units":
            if int(amount) != amount or not 1 <= amount <= 1000:
                raise ValueError("Stückzahl pro Druck muss 1 bis 1000 sein.")
            fields[key] = int(amount)
        else:
            fields[key] = amount
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
    if action == "save-profile":
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
