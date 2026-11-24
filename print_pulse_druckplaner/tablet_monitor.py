"""Device registry and sampled power history for the read-only tablet monitor.

All measurements come from the same HA states as the existing Shelly dashboard.
The separate registry supports adding/removing devices without editing source code.
"""
import json
import math
import re
import time
import power_monitor

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


def record_sample(db, snapshot, now=None):
    """15-second samples, retained 24h; missing readings remain NULL, never zero."""
    now = int(time.time() if now is None else now)
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
