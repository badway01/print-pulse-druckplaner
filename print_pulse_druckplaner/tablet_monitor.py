"""Device registry and sampled power history for the read-only tablet monitor.

All measurements come from the same HA states as the existing Shelly dashboard.
The separate registry supports adding/removing devices without editing source code.
"""
import json
import math
import re
import time
power_monitor = None  # Injected by app.py, also works when loaded by file-path tests.

REGISTRY_KEY = "tablet_monitor_devices"
MAX_DEVICES = 40
VALID_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,50}$")
SHELLY_ID = re.compile(r"shellyplugsg3_([a-f0-9]{12})")


def _energy_entity(name, states):
    suffix = power_monitor.KNOWN_SHELLYS.get(name)
    if not suffix:
        return ""
    endings = (("energie",) if name in ("X2D", "A1") else ("energieverbrauch", "energie"))
    for ending in endings:
        key = "sensor.shellyplugsg3_" + suffix + "_" + ending
        if key in states and energy_kwh(states.get(key)) is not None:
            return key
    return ""


def energy_kwh(item):
    if not isinstance(item, dict):
        return None
    attrs = item.get("attributes") or {}
    if attrs.get("device_class") != "energy":
        return None
    unit = attrs.get("unit_of_measurement")
    if unit not in ("kWh", "Wh"):
        return None
    try:
        val = float(item.get("state"))
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(val) or val < 0:
        return None
    return round(val / 1000 if unit == "Wh" else val, 3)


def default_devices(states, settings):
    bindings = power_monitor.effective_bindings(settings, states)
    result = []
    for index, name in enumerate(power_monitor.DEVICES):
        suffix = power_monitor.KNOWN_SHELLYS.get(name)
        switch = "switch.shellyplugsg3_" + suffix if suffix else ""
        result.append({
            "id": "device-" + str(index + 1),
            "name": name,
            "kind": "other" if name == "Kühlschrank" else "printer",
            "power_entity": bindings.get(name) or "",
            "energy_entity": _energy_entity(name, states),
            "switch_entity": switch if switch in states else "",
            "enabled": True,
        })
    return result


def devices(states, settings):
    registry = settings.get("registry")
    if registry is None:
        return default_devices(states, settings)
    return [dict(item) for item in registry if isinstance(item, dict)]


def choices(states, domain):
    items = []
    for key, item in states.items():
        if not key.startswith(domain + "."):
            continue
        attr = item.get("attributes") or {}
        if domain == "sensor":
            if attr.get("device_class") not in ("energy", "power"):
                continue
            unit = attr.get("unit_of_measurement")
            if unit not in ("W", "kW", "Wh", "kWh"):
                continue
        elif domain == "switch":
            if "shelly" not in key:
                continue
        label = str(attr.get("friendly_name") or key)[:90]
        items.append({"id": key, "name": label,
                      "kind": attr.get("device_class") or ""})
    return sorted(items, key=lambda x: (x["name"].casefold(), x["id"]))


def read_settings(states, settings):
    return {"devices": devices(states, settings),
            "sensors": choices(states, "sensor"),
            "switches": choices(states, "switch")}


def _check_entity(value, states, expected, old_values, required_class=None):
    if not isinstance(value, str) or len(value) > 170:
        raise ValueError("Ungültige HA-Entität.")
    if not value:
        return ""
    if not re.fullmatch(expected + r"\.[a-z0-9_]+", value):
        raise ValueError("Falscher HA-Entitätstyp.")
    if value not in states:
        if value in old_values:
            return value  # An existing temporarily unavailable mapping stays intact.
        raise ValueError("Entität nicht in Home Assistant vorhanden: " + value[:90])
    if required_class:
        attr = states[value].get("attributes") or {}
        if attr.get("device_class") != required_class:
            raise ValueError("Falscher Sensortyp: " + value[:90])
        unit = attr.get("unit_of_measurement")
        allowed = ("W", "kW") if required_class == "power" else ("Wh", "kWh")
        if unit not in allowed:
            raise ValueError("Unpassende Einheit bei " + value[:90])
    return value


def save(db, cfg, put_cfg, payload, states):
    if not isinstance(payload, dict) or not isinstance(payload.get("devices"), list):
        raise ValueError("Geräteliste fehlt.")
    source = payload["devices"]
    if len(source) > MAX_DEVICES:
        raise ValueError("Maximal 40 Geräte möglich.")
    settings = power_monitor.config(db, cfg)
    old = devices(states, settings)
    old_by_id = {item.get("id"): item for item in old}
    result = []
    names = set()
    ids = set()
    powers = set()
    for index, item in enumerate(source):
        if not isinstance(item, dict):
            raise ValueError("Ungültiger Geräteeintrag.")
        ident = str(item.get("id") or "device-new-" + str(index + 1))
        name = str(item.get("name") or "").strip()
        kind = str(item.get("kind") or "")
        if not VALID_ID.fullmatch(ident) or ident in ids:
            raise ValueError("Doppelte oder ungültige Geräte-ID.")
        if not (1 <= len(name) <= 70) or name.casefold() in names:
            raise ValueError("Gerätenamen müssen eindeutig sein (max. 70 Zeichen).")
        if kind not in ("printer", "other"):
            raise ValueError("Ungültiger Gerätetyp.")
        enabled = item.get("enabled", True)
        if type(enabled) is not bool:
            raise ValueError("Ungültiger Aktiv-Status.")
        previous = old_by_id.get(ident, {})
        get_old = lambda field: {str(previous.get(field) or "")}
        p = _check_entity(item.get("power_entity", ""), states, "sensor",
                          get_old("power_entity"), "power")
        e = _check_entity(item.get("energy_entity", ""), states, "sensor",
                          get_old("energy_entity"), "energy")
        sw = _check_entity(item.get("switch_entity", ""), states, "switch",
                           get_old("switch_entity"))
        if p:
            if p in powers:
                raise ValueError("Ein Leistungssensor kann nur einem Gerät gehören.")
            powers.add(p)
        result.append({"id": ident, "name": name, "kind": kind,
                       "power_entity": p, "energy_entity": e,
                       "switch_entity": sw, "enabled": enabled})
        ids.add(ident)
        names.add(name.casefold())
    put_cfg(db, REGISTRY_KEY, json.dumps({"items": result}, ensure_ascii=False))
    # Keep the original power dashboard and alert worker on the same mapping.
    bindings = {item["name"]: item["power_entity"]
                for item in result if item["power_entity"]}
    # Explicitly empty A1 prevents its auto-binding from undoing a user's removal.
    if "A1" in [item["name"] for item in result] and "A1" not in bindings:
        bindings["A1"] = ""
    original = power_monitor.config(db, cfg)
    persisted = {k: original[k] for k in ("warning_w", "critical_w", "ntfy_topic")}
    persisted["bindings"] = bindings
    put_cfg(db, power_monitor.CONF_KEY, json.dumps(persisted, ensure_ascii=False))
    put_cfg(db, power_monitor.ALERT_KEY, "{}")
    return {"ok": True, "devices": result}


def shelly_current(item):
    """Read a real Shelly current sensor (A or mA); not W divided by voltage."""
    if not isinstance(item, dict):
        return None
    attrs = item.get("attributes") or {}
    if attrs.get("device_class") != "current":
        return None
    unit = str(attrs.get("unit_of_measurement") or "").strip().lower()
    if unit not in ("a", "ma"):
        return None
    try:
        value = float(item.get("state"))
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(value) or not 0 <= value <= 100000:
        return None
    amperes = value / 1000 if unit == "ma" else value
    return round(amperes, 4) if amperes <= 100 else None


def enrich_currents(snapshot, states):
    """Prefer actual current from the same Shelly, fallback to W/230 if absent.

    The aggregate is a sum of individual device current magnitudes, *not* a
    measurement of a wall outlet, circuit or phase.
    """
    total = 0.0
    real_count = 0
    estimated_count = 0
    for device in snapshot.get("devices", []):
        entity = device.get("entity") or ""
        # Match by the same physical Shelly, including custom-renamed power
        # entities. The fixed known map distinguishes A1 and X2D correctly.
        match = SHELLY_ID.search(entity)
        if not match:
            match = SHELLY_ID.search(device.get("switch_entity") or "")
        suffix = (match.group(1) if match else
                  power_monitor.KNOWN_SHELLYS.get(device.get("name")))
        sensor = ""
        actual = None
        if suffix:
            prefix = "sensor.shellyplugsg3_" + suffix + "_"
            # Prefer the real HA Stromstärke entity for this exact plug.
            known = prefix + "stromstarke"
            options = ([known] if known in states else []) + sorted(
                key for key in states
                if key.startswith(prefix) and key != known)
            for candidate in options:
                current = shelly_current(states.get(candidate))
                if current is not None:
                    actual = current
                    sensor = candidate
                    break
        watts = device.get("watts")
        if actual is not None:
            device["amps"] = actual
            device["amps_source"] = "shelly"
            device["current_entity"] = sensor
            total += actual
            real_count += 1
        elif isinstance(watts, (int, float)) and not isinstance(watts, bool) \
                and math.isfinite(watts) and watts >= 0:
            device["amps"] = round(watts / 230, 4)
            device["amps_source"] = "calculated"
            device["current_entity"] = ""
            total += device["amps"]
            estimated_count += 1
        else:
            device["amps"] = None
            device["amps_source"] = "unavailable"
            device["current_entity"] = ""
    snapshot["amps"] = round(total, 2) if real_count + estimated_count else None
    snapshot["amps_real_count"] = real_count
    snapshot["amps_estimated_count"] = estimated_count
    snapshot["amps_source"] = ("mixed" if real_count and estimated_count
        else "shelly" if real_count else "calculated" if estimated_count
        else "unavailable")
    return snapshot


def ensure_total_peak_table(db):
    """Keep highest observed aggregate across restarts, not a circuit peak."""
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_total_peak(
        id INTEGER PRIMARY KEY CHECK(id=1),
        max_watts REAL NOT NULL CHECK(max_watts>=0),
        at INTEGER NOT NULL,
        measured INTEGER NOT NULL,
        expected INTEGER NOT NULL)""")
    # Seed once from the retained 24h history of the prior monitor version.
    db.execute("""INSERT OR IGNORE INTO pp_power_total_peak
        (id,max_watts,at,measured,expected)
        SELECT 1,watts,at,measured,expected FROM pp_power_history
        WHERE watts IS NOT NULL AND watts>=0
        ORDER BY watts DESC,at ASC LIMIT 1""")


def total_peak(db):
    ensure_total_peak_table(db)
    row = db.execute("""SELECT max_watts,at,measured,expected
        FROM pp_power_total_peak WHERE id=1""").fetchone()
    return ({"watts":round(row["max_watts"],1),"at":row["at"],
             "measured":row["measured"],"expected":row["expected"]}
            if row else None)


def ensure_peak_table(db):
    """Maintain permanent peak power readings, keyed by the HA power sensor.

    Renaming a printer does not lose its peak. Assigning a different plug
    does not mistakenly inherit the previous plug's recorded peak.
    """
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_device_peaks(
        entity TEXT PRIMARY KEY,
        max_watts REAL NOT NULL CHECK(max_watts >= 0),
        at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_actual_current_peaks(
        entity TEXT PRIMARY KEY,
        max_amps REAL NOT NULL CHECK(max_amps>=0),
        current_entity TEXT NOT NULL,
        at INTEGER NOT NULL)""")


def device_peaks(db):
    """Retain earlier calculated peaks; prefer true Shelly-amp peaks when present."""
    ensure_peak_table(db)
    peaks = {row["entity"]: {
                "max_watts": round(row["max_watts"], 1),
                "max_amps": round(row["max_watts"] / 230, 3),
                "at": row["at"],
                "source": "calculated"}
            for row in db.execute(
                "SELECT entity,max_watts,at FROM pp_power_device_peaks")}
    for row in db.execute(
            "SELECT entity,max_amps,at FROM pp_power_actual_current_peaks"):
        peak = peaks.setdefault(row["entity"], {})
        peak.update(max_amps=round(row["max_amps"], 3),
                    at=row["at"], source="shelly")
    return peaks


def record_sample(db, snapshot, now=None):
    """15-second samples; permanently store per-Shelly observed power peaks."""
    now = int(time.time() if now is None else now)
    ensure_peak_table(db)
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_history
        (at INTEGER PRIMARY KEY, watts REAL, measured INTEGER NOT NULL,
         expected INTEGER NOT NULL)""")
    ensure_total_peak_table(db)
    combined = snapshot.get("watts")
    if isinstance(combined, (int, float)) and not isinstance(combined, bool) \
            and math.isfinite(combined) and combined >= 0:
        db.execute("""INSERT INTO pp_power_total_peak
            (id,max_watts,at,measured,expected) VALUES (1,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                at=CASE WHEN excluded.max_watts>pp_power_total_peak.max_watts
                        THEN excluded.at ELSE pp_power_total_peak.at END,
                measured=CASE WHEN excluded.max_watts>pp_power_total_peak.max_watts
                        THEN excluded.measured ELSE pp_power_total_peak.measured END,
                expected=CASE WHEN excluded.max_watts>pp_power_total_peak.max_watts
                        THEN excluded.expected ELSE pp_power_total_peak.expected END,
                max_watts=MAX(pp_power_total_peak.max_watts,excluded.max_watts)""",
            (combined,now,snapshot.get("printers_measured",0),
             snapshot.get("printers_total",0)))
    for item in snapshot.get("devices", []):
        if not isinstance(item, dict):
            continue
        entity = item.get("entity")
        watts = item.get("watts")
        if not isinstance(entity, str) or not entity.startswith("sensor."):
            continue
        if isinstance(watts, bool) or not isinstance(watts, (int, float)):
            continue
        if not math.isfinite(watts) or watts < 0:
            continue
        db.execute("""INSERT INTO pp_power_device_peaks(entity,max_watts,at)
            VALUES(?,?,?)
            ON CONFLICT(entity) DO UPDATE SET
                at=CASE WHEN excluded.max_watts > pp_power_device_peaks.max_watts
                        THEN excluded.at ELSE pp_power_device_peaks.at END,
                max_watts=MAX(pp_power_device_peaks.max_watts,excluded.max_watts)""",
                   (entity, watts, now))
        amps = item.get("amps")
        if (item.get("amps_source") == "shelly"
                and isinstance(amps, (int, float)) and not isinstance(amps, bool)
                and math.isfinite(amps) and amps >= 0):
            db.execute("""INSERT INTO pp_power_actual_current_peaks(
                entity,max_amps,current_entity,at) VALUES(?,?,?,?)
                ON CONFLICT(entity) DO UPDATE SET
                  at=CASE WHEN excluded.max_amps > pp_power_actual_current_peaks.max_amps
                          THEN excluded.at ELSE pp_power_actual_current_peaks.at END,
                  current_entity=CASE WHEN excluded.max_amps > pp_power_actual_current_peaks.max_amps
                          THEN excluded.current_entity ELSE pp_power_actual_current_peaks.current_entity END,
                  max_amps=MAX(pp_power_actual_current_peaks.max_amps,excluded.max_amps)""",
                (entity,amps,item.get("current_entity") or "",now))
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_history
        (at INTEGER PRIMARY KEY, watts REAL, measured INTEGER NOT NULL,
         expected INTEGER NOT NULL)""")
    db.execute("""INSERT OR REPLACE INTO pp_power_history
        (at, watts, measured, expected) VALUES (?, ?, ?, ?)""",
        (now, snapshot.get("watts"), snapshot.get("printers_measured", 0),
         snapshot.get("printers_total", 0)))
    if now % 300 < 16:
        db.execute("DELETE FROM pp_power_history WHERE at<?", (now - 86400,))


def history(db, minutes=60):
    if minutes not in (15, 60, 180, 1440):
        raise ValueError("Ungültiger Zeitraum.")
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_history
        (at INTEGER PRIMARY KEY, watts REAL, measured INTEGER NOT NULL,
         expected INTEGER NOT NULL)""")
    start = int(time.time()) - minutes * 60
    rows = db.execute("""SELECT at,watts,measured,expected FROM pp_power_history
        WHERE at>=? ORDER BY at""", (start,)).fetchall()
    # Keep the response compact on mobile/tablets, particularly for 24h.
    step = max(1, len(rows) // 500)
    return [{"at": row["at"], "watts": row["watts"],
             "measured": row["measured"], "expected": row["expected"]}
            for row in rows[::step]]
