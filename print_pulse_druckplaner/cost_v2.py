"""V2 sale-aware FDM calculator; no inventory or printer-approval mutations."""
import json
import math

PRINTER_DEFAULT = {
    "power_watts": 120, "purchase_eur": 0, "depreciation_years": 4,
    "annual_hours": 1000, "maintenance_eur_year": 0,
}
DEFAULT_SETTINGS = {
    "energy_eur_kwh": .35, "labor_eur_hour": 0, "failure_percent": 5,
    "fee_vat_percent": 0, "eur_per_usd": .92, "listing_usd": .20,
    "break_even_margin": 0, "minimum_margin": 20,
    "standard_margin": 40, "luxury_margin": 60, "rounding": "none",
    "monthly_overhead_eur": 0, "monthly_sold_units": 100, "use_overhead": False,
}
V2_FIELDS = {
    "calc_version": 2, "sales_units": 1, "orders_count": 1,
    "discount_percent": 0, "shipping_free": 0, "overhead_enabled": 0,
}
PRICE_TIERS = (("break_even", "break_even_margin"),
               ("minimum", "minimum_margin"),
               ("standard", "standard_margin"), ("luxury", "luxury_margin"))


def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_cost_settings(
        id INTEGER PRIMARY KEY CHECK (id=1), data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_catalog_cost_recommendations(
        listing_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '',
        printer TEXT NOT NULL, result_json TEXT NOT NULL, updated INTEGER NOT NULL,
        PRIMARY KEY(listing_id,variant_id,printer));
    """)


def get_settings(db, printers):
    row = db.execute("SELECT data_json FROM pp_cost_settings WHERE id=1").fetchone()
    raw = json.loads(row[0]) if row else {}
    settings = {**DEFAULT_SETTINGS, **{k: v for k, v in raw.items() if k != "printers"}}
    settings["printers"] = {
        name: {**PRINTER_DEFAULT, **raw.get("printers", {}).get(name, {})}
        for name in printers
    }
    return settings


def save_settings(db, raw, printers):
    if not isinstance(raw, dict):
        raise ValueError("Einstellungen fehlen.")
    settings = get_settings(db, printers)
    limits = {"energy_eur_kwh": (0, 10), "labor_eur_hour": (0, 500),
              "failure_percent": (0, 100), "fee_vat_percent": (0, 100),
              "eur_per_usd": (.01, 10), "listing_usd": (0, 10),
              "monthly_overhead_eur": (0, 100000),
              "monthly_sold_units": (1, 1000000),
              "break_even_margin": (0, 95), "minimum_margin": (0, 95),
              "standard_margin": (0, 95), "luxury_margin": (0, 95)}
    def bounded(value, key, low, high):
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError("Ungültige Einstellung: " + key)
        return value
    for key, (low, high) in limits.items():
        if key in raw:
            settings[key] = bounded(raw[key], key, low, high)
    if "rounding" in raw:
        if raw["rounding"] not in ("none", "90", "99"):
            raise ValueError("Preisrundung ungültig.")
        settings["rounding"] = raw["rounding"]
    if "use_overhead" in raw:
        if type(raw["use_overhead"]) is not bool:
            raise ValueError("Fixkosten-Umlage ungültig.")
        settings["use_overhead"] = raw["use_overhead"]
    values = [settings[key] for _, key in PRICE_TIERS]
    if values != sorted(values):
        raise ValueError("Preismargen müssen aufsteigend sein.")
    for printer, config in raw.get("printers", {}).items():
        if printer not in printers or not isinstance(config, dict):
            raise ValueError("Unbekannter Drucker.")
        for key in PRINTER_DEFAULT:
            if key in config:
                low = .01 if key in ("depreciation_years", "annual_hours") else 0
                settings["printers"][printer][key] = bounded(config[key], key, low, 1000000)
    db.execute("INSERT INTO pp_cost_settings(id,data_json) VALUES(1,?) "
               "ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json",
               (json.dumps(settings, ensure_ascii=False),))
    return settings


def rounded_price(amount, mode):
    amount = max(0, amount)
    if mode in ("90", "99"):
        tail = .90 if mode == "90" else .99
        return round(max(tail, math.ceil(amount - tail - 1e-9) + tail), 2)
    return math.ceil((amount - 1e-9) * 100) / 100


def calculate(fields, materials, filaments, settings, printer, fees):
    """Cost complete batch and a separately specified commercial order.

    Costs/fees are EUR, grams cover entire batch, margins are share of revenue.
    Revenue includes charged shipping, seller fees include VAT only if configured.
    """
    units = max(1, int(fields["batch_units"]))
    sold = max(1, int(fields.get("sales_units", 1)))
    orders = max(1, int(fields.get("orders_count", 1)))
    machine_cfg = settings["printers"][printer]
    hours = fields["minutes"] / 60
    material = 0.
    missing = []
    details = []
    for item in materials:
        fil = filaments.get(item["filament_id"])
        label = (fil["brand"] + " · " + fil["color"]) if fil else "Filament #" + str(item["filament_id"])
        spool = item.get("spool_g") or (fil.get("spool_g", 1000) if fil else 1000)
        grams = item["grams"]
        price = fil["price_cents"] if fil else None
        cost = grams * price / (100 * spool) if price is not None else None
        if cost is None:
            missing.append(label)
        else:
            material += cost
        details.append({"filament_id": item["filament_id"], "label": label, "grams": grams,
                        "spool_g": spool, "cost_eur": round(cost, 4) if cost is not None else None})
    electricity = hours * machine_cfg["power_watts"] / 1000 * settings["energy_eur_kwh"]
    machine_hour = (machine_cfg["purchase_eur"] / (machine_cfg["depreciation_years"] * machine_cfg["annual_hours"])
                    + machine_cfg["maintenance_eur_year"] / machine_cfg["annual_hours"])
    machine = hours * machine_hour
    failure = (material + electricity + machine) * settings["failure_percent"] / 100
    batch = material + electricity + machine + failure
    per_unit = batch / units
    labor = fields["labor_minutes"] / 60 * settings["labor_eur_hour"]
    overhead_enabled = bool(fields.get("overhead_enabled", settings["use_overhead"]))
    overhead = settings["monthly_overhead_eur"] / settings["monthly_sold_units"] if overhead_enabled else 0
    other_unit = labor + fields["packaging_eur"] + fields["other_eur"] + overhead
    shipping_expense = fields["shipping_cost_eur"] * orders
    commercial_cost = (per_unit + other_unit) * sold + shipping_expense
    etsy = bool(fields.get("etsy_enabled", 0))
    vat = settings["fee_vat_percent"] / 100 if etsy else 0
    variable_rate = ((fees["transaction_percent"] + fees["payments_percent"] +
                      fields.get("offsite_percent", 0)) / 100 * (1 + vat)) if etsy else 0
    listing_eur = fees["listing_usd"] * settings["eur_per_usd"] if etsy else 0
    fixed_fees = ((listing_eur + fields["additional_fee_eur"]) * sold +
                  fees["payments_fixed_eur"] * orders) * (1 + vat) if etsy else 0
    discount = fields.get("discount_percent", 0) / 100
    paid_shipping = 0 if fields.get("shipping_free", 0) else fields["shipping_paid_eur"] * orders
    revenue = fields["selling_eur"] * sold * (1 - discount) + paid_shipping
    fee_total = revenue * variable_rate + fixed_fees
    profit = revenue - commercial_cost - fee_total
    tiers = {}
    for name, key in PRICE_TIERS:
        margin = settings[key]
        divisor = 1 - variable_rate - margin / 100
        if divisor <= 0 or discount >= 1:
            tiers[name] = {"price_eur": None, "target_margin": margin, "margin_percent": None}
            continue
        gross_required = (commercial_cost + fixed_fees) / divisor
        required_unit = max(0, (gross_required - paid_shipping) / (sold * (1 - discount)))
        price = rounded_price(required_unit, settings["rounding"])
        gross = price * sold * (1 - discount) + paid_shipping
        margin_actual = (gross * (1-variable_rate) - commercial_cost - fixed_fees) / gross * 100 if gross else None
        tiers[name] = {"price_eur": price, "target_margin": margin,
                       "margin_percent": round(margin_actual, 2) if margin_actual is not None else None}
    r = lambda x: round(x + 1e-9, 2)
    return {
        "calc_version": 2, "batch_units": units, "sales_units": sold, "orders_count": orders,
        "material_batch_eur": r(material), "electricity_batch_eur": r(electricity),
        "machine_batch_eur": r(machine), "failure_batch_eur": r(failure),
        "batch_total_eur": r(batch), "unit_cost_eur": r(per_unit),
        "other_unit_eur": r(other_unit), "shipping_cost_total_eur": r(shipping_expense),
        "production_order_eur": r(commercial_cost), "fees_order_eur": r(fee_total),
        "revenue_order_eur": r(revenue), "profit_order_eur": r(profit),
        "margin_percent": round(profit / revenue * 100, 2) if revenue > 0 else None,
        "recommendations": tiers, "machine_eur_hour": round(machine_hour, 4),
        "missing_prices": missing, "materials": details,
        "complete": bool(materials) and not missing and fields["minutes"] > 0,
        "minutes_per_unit": round(fields["minutes"] / units, 1),
        "etsy_enabled": etsy,
        "material_eur": r(material / units), "electricity_eur": r(electricity / units),
        "machine_eur": r(machine / units), "print_eur": r(batch / units),
        "labor_eur": r(labor), "fees_eur": r(fee_total / sold),
        "other_eur": r(other_unit + shipping_expense / sold),
        "total_eur": r((commercial_cost + fee_total) / sold),
        "revenue_eur": r(revenue / sold),
        "profit_eur": r(profit / sold) if revenue else None
    }
