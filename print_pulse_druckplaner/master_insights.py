"""Per-file 3MF insight cards. Keeps printing statistics separate from product profiles.

Parsing uses small, bounded metadata entries inside the original ZIP; no G-code is
executed and incomplete slicer estimates are never presented as actual costs.
"""
import json
import logging
import math
import re
import time
import xml.etree.ElementTree as ET
import zipfile

log = logging.getLogger(__name__)
MAX_META_BYTES = 2 * 1024 * 1024
MAX_FILAMENTS = 16
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def schema(db):
    db.execute("""CREATE TABLE IF NOT EXISTS pp_master_file_insights(
        file_id TEXT PRIMARY KEY,
        details_json TEXT NOT NULL DEFAULT '{}',
        updated INTEGER NOT NULL
    )""")


def _number(value):
    try:
        n = float(str(value).replace(",", "."))
        return n if math.isfinite(n) and n >= 0 else None
    except (ValueError, TypeError):
        return None


def _seconds(value):
    n = _number(value)
    if n is not None:
        return round(n)
    text = str(value or "").lower()
    total = 0.
    for number, unit in re.findall(r"(\d+(?:[.,]\d+)?)\s*(h|hours?|stunden?|m|min(?:utes?)?|s|sec(?:onds?)?)", text):
        factor = 3600 if unit.startswith(("h", "st")) else 60 if unit.startswith("m") else 1
        total += float(number.replace(",", ".")) * factor
    return round(total) if total else None


def _zip_text(archive, name, limit=MAX_META_BYTES):
    try:
        info = archive.getinfo(name)
        if info.file_size > limit:
            return None
        with archive.open(info) as handle:
            return handle.read(limit + 1).decode("utf-8-sig", "replace")[:limit]
    except (KeyError, OSError, RuntimeError, ValueError, zipfile.BadZipFile):
        return None


def _color(value):
    raw = str(value or "").strip()
    return raw.upper() if HEX.fullmatch(raw) else ""


def extract(path):
    """Best-effort extraction of sliced Bambu/Orca projects, never a prerequisite for upload."""
    result = {"time_seconds": None, "filaments": [], "print_count": 0, "last_print": None}
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            # Sliced Bambu/Orca projects may expose per-plate time and filament mass.
            slice_name = next((n for n in ("Metadata/slice_info.config", "metadata/slice_info.config") if n in names), None)
            xml = _zip_text(archive, slice_name) if slice_name else None
            by_slot = {}
            if xml:
                try:
                    root = ET.fromstring(xml)
                    plates = [x for x in root.iter() if x.tag.rsplit("}", 1)[-1] == "plate"]
                    for plate in plates[:32]:
                        for node in plate.iter():
                            tag = node.tag.rsplit("}", 1)[-1]
                            if tag == "metadata":
                                key = str(node.attrib.get("key", "")).lower()
                                if key in ("prediction", "prediction_time", "print_time"):
                                    sec = _seconds(node.attrib.get("value"))
                                    if sec is not None:
                                        result["time_seconds"] = (result["time_seconds"] or 0) + sec
                            if tag != "filament":
                                continue
                            grams = _number(node.attrib.get("used_g", node.attrib.get("weight")))
                            if not grams:
                                continue
                            slot = str(node.attrib.get("id") or node.attrib.get("filament_id") or len(by_slot) + 1)
                            item = by_slot.setdefault(slot, {
                                "name": str(node.attrib.get("type") or "Filament")[:80],
                                "color_hex": _color(node.attrib.get("color") or node.attrib.get("colour")),
                                "filament_id": None, "grams": 0.
                            })
                            item["grams"] += grams
                except (ET.ParseError, ValueError):
                    log.debug("3MF slice_info cannot be parsed: %s", path)
            if by_slot:
                result["filaments"] = [
                    {**item, "grams": round(item["grams"], 3)}
                    for item in list(by_slot.values())[:MAX_FILAMENTS]
                ]
            # Project settings contain colors even when the project has not yet been sliced.
            settings_name = next((n for n in ("Metadata/project_settings.config", "metadata/project_settings.config") if n in names), None)
            settings_text = _zip_text(archive, settings_name) if settings_name else None
            if settings_text:
                try:
                    settings = json.loads(settings_text)
                    colors = settings.get("filament_colour") or settings.get("filament_color") or []
                    materials = settings.get("filament_type") or []
                    if isinstance(colors, list):
                        if result["filaments"]:
                            for i, item in enumerate(result["filaments"]):
                                if not item["color_hex"] and i < len(colors):
                                    item["color_hex"] = _color(colors[i])
                        else:
                            result["filaments"] = [
                                {"name": str(materials[i] if i < len(materials) else "Filament")[:80],
                                 "color_hex": _color(color), "filament_id": None, "grams": None}
                                for i, color in enumerate(colors[:MAX_FILAMENTS])
                                if _color(color)
                            ]
                except (ValueError, TypeError, AttributeError):
                    pass
            # Some export variants put the estimate in the G-code header only.
            if result["time_seconds"] is None:
                for name in sorted(names):
                    if not re.fullmatch(r"Metadata/plate_\d+\.gcode", name, re.I):
                        continue
                    try:
                        with archive.open(name) as stream:
                            header = stream.read(128 * 1024).decode("utf-8", "replace")
                        match = re.search(r";\s*(?:total estimated time|estimated printing time)\s*[:=]\s*(.+)", header, re.I)
                        if match:
                            seconds = _seconds(match.group(1))
                            if seconds is not None:
                                result["time_seconds"] = (result["time_seconds"] or 0) + seconds
                    except (OSError, RuntimeError, ValueError):
                        pass
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile):
        log.debug("No readable slicer estimates in 3MF %s", path)
    return result


def _record(db, file, root):
    row = db.execute("SELECT details_json FROM pp_master_file_insights WHERE file_id=?", (file["id"],)).fetchone()
    if row:
        try:
            return json.loads(row["details_json"])
        except (ValueError, TypeError):
            return {}
    # Existing stored masters are analysed lazily; data and files are never rewritten.
    details = extract(root / file["relative_path"])
    db.execute("INSERT OR IGNORE INTO pp_master_file_insights(file_id,details_json,updated) VALUES(?,?,?)",
               (file["id"], json.dumps(details, ensure_ascii=False), int(time.time())))
    return details


def summarize(db, file, root, spool_rows):
    details = _record(db, file, root)
    filaments = []
    total_grams = 0.
    material_cost = 0.
    complete = True
    for item in details.get("filaments", [])[:MAX_FILAMENTS]:
        if not isinstance(item, dict):
            continue
        fid = item.get("filament_id")
        try:
            spool = spool_rows.get(int(fid)) if fid is not None else None
        except (TypeError, ValueError):
            spool = None
        g = _number(item.get("grams"))
        if not g:
            complete = False
        else:
            total_grams += g
        price = spool.get("price_cents") if spool else None
        if spool and price is not None and g is not None:
            material_cost += g * price / (100 * float(spool.get("spool_g") or 1000))
        else:
            complete = False
        filaments.append({
            "filament_id": spool["id"] if spool else None,
            "name": (spool["material"] + " " + spool["color"]) if spool else str(item.get("name") or "Filament")[:80],
            "code": spool.get("internal_code", "") if spool else "",
            "color_hex": _color(spool.get("color_hex")) if spool else _color(item.get("color_hex")),
            "grams": round(g, 2) if g is not None else None,
        })
    for item in filaments:
        item["percent"] = round(item["grams"] * 100 / total_grams) if total_grams and item["grams"] is not None else None
    seconds = details.get("time_seconds")
    seconds = int(seconds) if type(seconds) is int and 0 <= seconds <= 8640000 else None
    material_eur = round(material_cost, 2) if complete and total_grams > 0 else None
    production_eur = None
    if material_eur is not None and seconds is not None:
        row = db.execute("SELECT data_json FROM pp_cost_settings WHERE id=1").fetchone()
        try:
            settings = json.loads(row[0]) if row else {}
        except (ValueError, TypeError):
            settings = {}
        machine = settings.get("printers", {}).get(file["printer"], {})
        hours = seconds / 3600
        watts = _number(machine.get("power_watts", 120)) or 0
        energy = _number(settings.get("energy_eur_kwh", .35)) or 0
        purchase = _number(machine.get("purchase_eur", 0)) or 0
        years = _number(machine.get("depreciation_years", 4)) or 4
        annual_hours = _number(machine.get("annual_hours", 1000)) or 1000
        maintenance = _number(machine.get("maintenance_eur_year", 0)) or 0
        failure = _number(settings.get("failure_percent", 5)) or 0
        base = material_cost + hours * watts / 1000 * energy
        base += hours * (purchase / (years * annual_hours) + maintenance / annual_hours)
        production_eur = round(base * (1 + failure / 100), 2)
    return {
        "time_seconds": seconds,
        "print_count": max(0, int(details.get("print_count") or 0)),
        "last_print": details.get("last_print"),
        "filaments": filaments,
        "total_grams": round(total_grams, 2) if total_grams else None,
        "material_eur": material_eur,
        "production_eur": production_eur,
        "cost_label": "Druckkosten je Charge" if production_eur is not None else "Materialkosten je Charge",
    }


def change(db, root, file_id, payload):
    if not re.fullmatch(r"[a-f0-9]{24}", str(file_id or "")):
        raise ValueError("Ungültige 3MF-ID.")
    file = db.execute("SELECT * FROM master_files WHERE id=?", (file_id,)).fetchone()
    if not file:
        raise ValueError("3MF-Datei nicht gefunden.")
    details = _record(db, file, root)
    if payload.get("action") == "count":
        details["print_count"] = min(1000000, max(0, int(details.get("print_count") or 0)) + 1)
        details["last_print"] = int(time.time())
    elif payload.get("action") == "save":
        hours = payload.get("hours")
        minutes = payload.get("minutes")
        if type(hours) is not int or not 0 <= hours <= 2400 or type(minutes) is not int or not 0 <= minutes <= 59:
            raise ValueError("Bitte gültige Druckstunden und Minuten angeben.")
        details["time_seconds"] = hours * 3600 + minutes * 60 if hours or minutes else None
        incoming = payload.get("filaments")
        if not isinstance(incoming, list) or len(incoming) > MAX_FILAMENTS:
            raise ValueError("Maximal 16 Filamente pro Druckdatei.")
        clean = []
        for item in incoming:
            if not isinstance(item, dict):
                raise ValueError("Ungültige Filamentangabe.")
            fid = item.get("filament_id")
            grams = item.get("grams")
            if fid in ("", None) and grams in ("", None):
                continue
            if type(fid) is not int or fid < 1 or fid > 999999999:
                raise ValueError("Bitte für jede Menge ein Filament auswählen.")
            if not db.execute("SELECT 1 FROM filament_spools WHERE id=?", (fid,)).fetchone():
                raise ValueError("Das gewählte Filament ist nicht mehr vorhanden.")
            if type(grams) not in (int, float) or not math.isfinite(grams) or not 0 < grams <= 100000:
                raise ValueError("Bitte Gramm je Filament größer 0 eingeben.")
            clean.append({"filament_id": fid, "grams": round(float(grams), 3)})
        details["filaments"] = clean
    else:
        raise ValueError("Unbekannte 3MF-Aktion.")
    db.execute("""INSERT INTO pp_master_file_insights(file_id,details_json,updated) VALUES(?,?,?)
        ON CONFLICT(file_id) DO UPDATE SET details_json=excluded.details_json,updated=excluded.updated""",
        (file_id, json.dumps(details, ensure_ascii=False), int(time.time())))
    return {"ok": True, "id": file_id}
