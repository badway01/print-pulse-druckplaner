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
            allowed = {"energy": ("Wh", "kWh"), "power": ("W", "kW"),
                       "current": ("A", "mA", "a", "ma")}
            if attr.get("unit_of_measurement") not in allowed.get(attr.get("device_class"), ()):
                continue
        # Renamed HA switches are selectable for status only.
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
        allowed = {"power": ("W", "kW"), "energy": ("Wh", "kWh"),
                   "current": ("A", "mA", "a", "ma")}[required_class]
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
    currents = set()
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
        current = _check_entity(item.get("current_entity", previous.get("current_entity") or ""),
                                states, "sensor", get_old("current_entity"), "current")
        if current:
            if current in currents:
                raise ValueError("Ein Stromsensor kann nur einem Gerät gehören.")
            currents.add(current)
        if p:
            if p in powers:
                raise ValueError("Ein Leistungssensor kann nur einem Gerät gehören.")
            powers.add(p)
        result.append({"id": ident, "name": name, "kind": kind,
                       "power_entity": p, "energy_entity": e,
                       "switch_entity": sw, "current_entity": current, "enabled": enabled})
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


# These are local discovery templates, not hardcoded hardware identifiers.
CONSUMER_PROFILES = (
    ("PC", "pc", "tablet_pc_setup_v1"),
    ("Kühlschrank", "kuhlschrank", "tablet_fridge_setup_v1"),
    ("Werkstatt Zubehör", "werkstatt_zubehor", "tablet_workshop_setup_v1"),
)


def provision_consumer(db, cfg, put_cfg, states, name, slug, marker):
    """One-time local setup for a verified, uniquely matched consumer.
    Match exact friendly names, the renamed power/energy/switch prefix
    and a unique Shelly current sensor corroborated by its energy sensor.
    Never guess or register a second measurement of the same socket.
    """
    if cfg(db, marker, "") == "1":
        return False

    def matches(key, cls, friendly):
        item = states.get(key)
        attrs = (item or {}).get("attributes") or {}
        return attrs.get("device_class") == cls and attrs.get("friendly_name") == friendly

    profiles = []
    for key in states:
        if not re.fullmatch(r"sensor\.[a-z0-9_]+_" + re.escape(slug) + r"_leistung", key):
            continue
        if not matches(key, "power", name + " Leistung"):
            continue
        prefix = key[len("sensor."):-len("_leistung")]
        energy = "sensor." + prefix + "_energie"
        switch = "switch." + prefix
        if not matches(energy, "energy", name + " Energie"):
            continue
        if (states.get(switch, {}).get("attributes") or {}).get("friendly_name") != name:
            continue
        for current in states:
            mac = SHELLY_ID.search(current)
            if not mac or not matches(current, "current", name + " Stromstärke"):
                continue
            original_energy = "sensor.shellyplugsg3_" + mac.group(1) + "_energieverbrauch"
            if not matches(original_energy, "energy", name + " Energieverbrauch"):
                continue
            profiles.append({"power_entity": key, "energy_entity": energy,
                             "switch_entity": switch, "current_entity": current})
    if len(profiles) != 1:
        return False
    profile = profiles[0]
    for field, cls in (("power_entity", "power"), ("energy_entity", "energy"),
                       ("current_entity", "current")):
        try:
            _check_entity(profile[field], states, "sensor", set(), cls)
        except ValueError:
            return False

    settings = power_monitor.config(db, cfg)
    rows = devices(states, settings)
    # Match an existing entry by its name or exact power sensor.
    matching = [r for r in rows if r.get("name", "").casefold() == name.casefold()
                or r.get("power_entity") == profile["power_entity"]]
    if len(matching) > 1:
        return False
    existing = matching[0] if matching else None
    current_mac = SHELLY_ID.search(profile["current_entity"]).group(1)
    if existing is not None:
        # A same-name entry assigned to a different plug is not safe to replace.
        old_power = existing.get("power_entity") or settings["bindings"].get(existing["name"]) or ""
        if old_power and old_power != profile["power_entity"]:
            old_mac = SHELLY_ID.search(old_power)
            if not old_mac or old_mac.group(1) != current_mac:
                return False
            # Preserve the old history key if this is a valid alias of the same plug.
            if old_power in states:
                try:
                    _check_entity(old_power, states, "sensor", set(), "power")
                except ValueError:
                    return False
                profile["power_entity"] = old_power
        for field in ("current_entity", "energy_entity", "switch_entity"):
            old_value = existing.get(field) or ""
            old_mac = SHELLY_ID.search(old_value)
            if old_mac and old_mac.group(1) != current_mac:
                return False
    for row in rows:
        if row is existing:
            continue
        for field in ("power_entity", "current_entity", "energy_entity", "switch_entity"):
            value = row.get(field) or ""
            mac = SHELLY_ID.search(value)
            if value and (value in profile.values() or (mac and mac.group(1) == current_mac)):
                return False
        binding = settings["bindings"].get(row.get("name")) or ""
        mac = SHELLY_ID.search(binding)
        if binding == profile["power_entity"] or (mac and mac.group(1) == current_mac):
            return False
    if existing is None:
        if len(rows) >= MAX_DEVICES:
            return False
        ident = "auto-" + slug.replace("_", "-")
        if any(r.get("id") == ident for r in rows):
            return False
        existing = {"id": ident, "name": name, "enabled": True}
        rows.append(existing)
    existing.update(profile, kind="other", enabled=True)
    # Keep all other rows, IDs, thresholds, alert state and historical keys.
    # The explicitly requested consumer is enabled; never switch a socket.
    settings["bindings"][existing["name"]] = profile["power_entity"]
    put_cfg(db, REGISTRY_KEY, json.dumps({"items": rows}, ensure_ascii=False))
    persisted = {k: settings[k] for k in ("warning_w", "critical_w", "ntfy_topic", "bindings")}
    put_cfg(db, power_monitor.CONF_KEY, json.dumps(persisted, ensure_ascii=False))
    put_cfg(db, marker, "1")
    return True


def provision_pc(db, cfg, put_cfg, states):
    """Compatibility entry point for the original PC migration."""
    return provision_consumer(db, cfg, put_cfg, states, *CONSUMER_PROFILES[0])


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


def resolve_switch_state(device, states):
    """Use explicit switch or exact physical Shelly ID; never infer from watts."""
    entity = device.get("switch_entity") or ""
    if not entity:
        match = SHELLY_ID.search(device.get("entity") or "")
        if match:
            entity = "switch.shellyplugsg3_" + match.group(1)
    item = states.get(entity)
    state = item.get("state") if isinstance(item, dict) else None
    return state if state in ("on", "off") else None


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
                  (power_monitor.KNOWN_SHELLYS.get(device.get("name")) if entity or device.get("switch_entity") else None))
        sensor = ""
        actual = None
        explicit = device.get("configured_current_entity") or ""
        if explicit:
            actual = shelly_current(states.get(explicit))
            if actual is not None:
                sensor = explicit
        elif suffix:
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
    # On a fresh installation the API may be opened before the first sample.
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_history
        (at INTEGER PRIMARY KEY, watts REAL, measured INTEGER NOT NULL,
         expected INTEGER NOT NULL)""")
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


def ensure_total_amps_peak_table(db):
    """Store the highest complete, directly observed Shelly current sum."""
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_total_amps_peak(
        id INTEGER PRIMARY KEY CHECK(id=1),
        max_amps REAL NOT NULL CHECK(max_amps>=0),
        at INTEGER NOT NULL,
        measured INTEGER NOT NULL,
        expected INTEGER NOT NULL)""")


def total_amps_peak(db):
    ensure_total_amps_peak_table(db)
    row = db.execute("""SELECT max_amps,at,measured,expected
        FROM pp_power_total_amps_peak WHERE id=1""").fetchone()
    return ({"amps":round(row["max_amps"],3),"at":row["at"],
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
    # Separate fallback-current peaks from watt peaks. Seed once from the
    # legacy watt-derived maxima; after reset the two are independent.
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pp_power_estimated_current_peaks'").fetchone()
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_estimated_current_peaks(
        entity TEXT PRIMARY KEY, max_amps REAL NOT NULL, at INTEGER NOT NULL)""")
    if not exists:
        db.execute("""INSERT OR IGNORE INTO pp_power_estimated_current_peaks
            SELECT entity,max_watts/230,at FROM pp_power_device_peaks""")
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_metric_resets(
        entity TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL,
        PRIMARY KEY(entity,kind))""")
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_actual_current_peaks(
        entity TEXT PRIMARY KEY,
        max_amps REAL NOT NULL CHECK(max_amps>=0),
        current_entity TEXT NOT NULL,
        at INTEGER NOT NULL)""")


def device_peaks(db):
    """Retain earlier calculated peaks; prefer true Shelly-amp peaks when present."""
    ensure_peak_table(db)
    peaks = {row["entity"]: {"max_watts":round(row["max_watts"],1),
                            "watts_at":row["at"]}
             for row in db.execute("SELECT * FROM pp_power_device_peaks")}
    for table,source in (("pp_power_estimated_current_peaks","calculated"),
                         ("pp_power_actual_current_peaks","shelly")):
        for row in db.execute(f"SELECT entity,max_amps,at FROM {table}"):
            peak=peaks.setdefault(row["entity"],{})
            peak.update(max_amps=round(row["max_amps"],3),at=row["at"],source=source)
    return peaks


def shared_peak_cards(db, entity):
    """Same lifetime/since-reset values for the overview and detail cards."""
    peak=device_peaks(db).get(entity,{})
    resets={r["kind"]:r["at"] for r in db.execute(
        "SELECT kind,at FROM pp_power_metric_resets WHERE entity=?",(entity,))}
    return {"watts":{"value":peak.get("max_watts"),"at":peak.get("watts_at"),
                     "direct":True,"reset_at":resets.get("watts")},
            "amps":{"value":peak.get("max_amps"),"at":peak.get("at"),
                    "direct":peak.get("source")=="shelly","reset_at":resets.get("amps")}}


def reset_device_metric(db, device, kind, now=None):
    """Reset just one metric of one device; no deletion of measured history."""
    if kind not in ("watts","amps"):
        raise ValueError("Ungültige Messgröße.")
    entity=device.get("history_key") or device.get("entity")
    if not isinstance(entity,str) or not re.fullmatch(r"sensor\.[a-z0-9_]{3,170}",entity):
        raise ValueError("Ungültiger Messpunkt.")
    now=int(time.time() if now is None else now)
    before=shared_peak_cards(db,entity)[kind]
    if kind=="watts":
        db.execute("DELETE FROM pp_power_device_peaks WHERE entity=?",(entity,))
    else:
        ensure_peak_reset_log(db)
        batch=str(now)+"-"+db.execute("SELECT hex(randomblob(6))").fetchone()[0]
        db.execute("""INSERT INTO pp_power_peak_reset_log
            (batch_id,at,device_key,device_name,previous_amps,previous_source,previous_peak_at,scope)
            VALUES(?,?,?,?,?,?,?,'device')""",
            (batch,now,entity,str(device.get("name") or entity)[:70],before["value"],
             ("shelly" if before["direct"] else "calculated") if before["value"] is not None else None,before["at"]))
        db.execute("DELETE FROM pp_power_actual_current_peaks WHERE entity=?",(entity,))
        db.execute("DELETE FROM pp_power_estimated_current_peaks WHERE entity=?",(entity,))
    db.execute("""INSERT INTO pp_power_metric_resets(entity,kind,at) VALUES(?,?,?)
        ON CONFLICT(entity,kind) DO UPDATE SET at=excluded.at""",(entity,kind,now))
    return before


def ensure_peak_reset_log(db):
    """Permanent audit log: resets never erase the recorded former maxima."""
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_peak_reset_log(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        device_key TEXT NOT NULL,
        device_name TEXT NOT NULL,
        previous_amps REAL,
        previous_source TEXT,
        previous_peak_at INTEGER,
        scope TEXT NOT NULL CHECK(scope IN ('device','overall'))
    )""")
    db.execute("""CREATE INDEX IF NOT EXISTS idx_pp_peak_resets_at
        ON pp_power_peak_reset_log(at)""")


def peak_reset_history(db, limit=80):
    ensure_peak_reset_log(db)
    limit = max(1, min(250, int(limit)))
    rows = db.execute("""SELECT batch_id,at,device_key,device_name,previous_amps,
        previous_source,previous_peak_at,scope
        FROM pp_power_peak_reset_log ORDER BY id DESC LIMIT ?""",
        (limit,)).fetchall()
    return [{"batch_id": r["batch_id"], "at": r["at"],
             "entity": r["device_key"], "name": r["device_name"],
             "previous_amps": round(r["previous_amps"],3)
                 if r["previous_amps"] is not None else None,
             "source": r["previous_source"],
             "previous_at": r["previous_peak_at"], "scope": r["scope"]}
            for r in rows]


def reset_all_amperes(db, active_devices, now=None):
    """Start a new Max-A measurement period, preserving an immutable reset log.

    Clears only tracked CURRENT device maxima and the aggregate Ampere peak.
    The long-term 5m/1h watt/current history and permanent Watt-total peak
    are not touched. This function is called inside one immediate transaction.
    """
    now = int(time.time() if now is None else now)
    ensure_peak_table(db)
    ensure_total_amps_peak_table(db)
    ensure_peak_reset_log(db)
    old_peaks = device_peaks(db)
    old_total = total_amps_peak(db)
    batch = str(now) + "-" + str(db.execute(
        "SELECT hex(randomblob(6))").fetchone()[0])
    used = set()
    reset_count = 0
    for dev in active_devices:
        if not isinstance(dev,dict):
            continue
        entity = dev.get("history_key") or dev.get("entity")
        if not isinstance(entity,str) or not entity.startswith("sensor."):
            continue
        if entity in used:
            continue
        used.add(entity)
        name = str(dev.get("name") or entity)[:70]
        prior = old_peaks.get(entity) or {}
        db.execute("""INSERT INTO pp_power_peak_reset_log(
            batch_id,at,device_key,device_name,previous_amps,
            previous_source,previous_peak_at,scope)
            VALUES (?,?,?,?,?,?,?,'device')""",
            (batch,now,entity,name,prior.get("max_amps"),
             prior.get("source"),prior.get("at")))
        # Independent current peaks: the watt maximum is not reset.
        db.execute("DELETE FROM pp_power_actual_current_peaks WHERE entity=?",(entity,))
        db.execute("DELETE FROM pp_power_estimated_current_peaks WHERE entity=?",(entity,))
        db.execute("""INSERT INTO pp_power_metric_resets(entity,kind,at) VALUES(?,'amps',?)
            ON CONFLICT(entity,kind) DO UPDATE SET at=excluded.at""",(entity,now))
        reset_count += 1
    if reset_count == 0:
        raise ValueError("Keine zugeordneten Leistungssensoren vorhanden.")
    db.execute("""INSERT INTO pp_power_peak_reset_log(
        batch_id,at,device_key,device_name,previous_amps,
        previous_source,previous_peak_at,scope)
        VALUES (?,?,?, ?,?,?,?,'overall')""",
        (batch,now,"__gesamt__","Strompeak gesamt",
         old_total["amps"] if old_total else None,
         "shelly" if old_total else None,
         old_total["at"] if old_total else None))
    db.execute("DELETE FROM pp_power_total_amps_peak WHERE id=1")
    return {"ok":True, "reset_at":now,"reset_count":reset_count,
            "previous_total_amps":old_total["amps"] if old_total else None,
            "history":peak_reset_history(db)}


def ensure_24h_current_column(db):
    """Migrate the existing 24h power-history table without deleting values."""
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_history
        (at INTEGER PRIMARY KEY, watts REAL, measured INTEGER NOT NULL,
         expected INTEGER NOT NULL)""")
    existing={r[1] for r in db.execute("PRAGMA table_info(pp_power_history)")}
    if "amps" not in existing:
        db.execute("ALTER TABLE pp_power_history ADD COLUMN amps REAL")
    # Separate the observed subset from the existing complete-sum statistic.
    for column, sqltype in (("amps_observed","REAL"),("amps_count","INTEGER"),
                            ("amps_expected","INTEGER")):
        if column not in existing:
            db.execute(f"ALTER TABLE pp_power_history ADD COLUMN {column} {sqltype}")


def average_amps_24h(db, now=None):
    """Observed 24-hour mean of complete, real Shelly-current sums.

    Missing 15s samples stay NULL; they never count as zero. Resetting Max A
    does not reset this average or any previously recorded measurement.
    """
    now=int(time.time() if now is None else now)
    ensure_24h_current_column(db)
    row=db.execute("""SELECT AVG(amps) AS average_amps,
        COUNT(amps) AS samples, MIN(CASE WHEN amps IS NOT NULL THEN at END) AS first_at,
        MAX(CASE WHEN amps IS NOT NULL THEN at END) AS last_at
        FROM pp_power_history WHERE at>=? AND at<=?""",
        (now-86400,now)).fetchone()
    if not row or not row["samples"]:
        return None
    return {"amps":round(row["average_amps"],3),
            "samples":row["samples"],
            "first_at":row["first_at"],
            "last_at":row["last_at"]}


def record_sample(db, snapshot, now=None):
    """15-second samples; permanently store per-Shelly observed power peaks."""
    now = int(time.time() if now is None else now)
    ensure_peak_table(db)
    db.execute("""CREATE TABLE IF NOT EXISTS pp_power_history
        (at INTEGER PRIMARY KEY, watts REAL, measured INTEGER NOT NULL,
         expected INTEGER NOT NULL)""")
    ensure_total_peak_table(db)
    ensure_total_amps_peak_table(db)
    # Record only a COMPLETE all-real-Shelly sum. A partial reading or
    # W/230 substitute must never be presented as a verified current peak.
    devices = snapshot.get("devices") or []
    amps_total = snapshot.get("amps")
    fully_measured = (bool(devices)
        and all(isinstance(x,dict) and x.get("amps_source") == "shelly"
                and isinstance(x.get("amps"),(int,float))
                and not isinstance(x.get("amps"),bool)
                and math.isfinite(x["amps"]) and x["amps"] >= 0
                for x in devices))
    if (fully_measured and isinstance(amps_total,(int,float))
            and not isinstance(amps_total,bool)
            and math.isfinite(amps_total) and amps_total >= 0):
        db.execute("""INSERT INTO pp_power_total_amps_peak
            (id,max_amps,at,measured,expected) VALUES (1,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                at=CASE WHEN excluded.max_amps > pp_power_total_amps_peak.max_amps
                        THEN excluded.at ELSE pp_power_total_amps_peak.at END,
                measured=CASE WHEN excluded.max_amps > pp_power_total_amps_peak.max_amps
                        THEN excluded.measured ELSE pp_power_total_amps_peak.measured END,
                expected=CASE WHEN excluded.max_amps > pp_power_total_amps_peak.max_amps
                        THEN excluded.expected ELSE pp_power_total_amps_peak.expected END,
                max_amps=MAX(pp_power_total_amps_peak.max_amps,excluded.max_amps)""",
            (amps_total,now,len(devices),len(devices)))
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
        entity = item.get("history_key") or item.get("entity")
        watts = item.get("watts")
        if not isinstance(entity, str) or not entity.startswith("sensor."):
            continue
        if (isinstance(watts,(int,float)) and not isinstance(watts,bool)
                and math.isfinite(watts) and watts>=0):
            db.execute("""INSERT INTO pp_power_device_peaks(entity,max_watts,at)
                VALUES(?,?,?) ON CONFLICT(entity) DO UPDATE SET
                at=CASE WHEN excluded.max_watts>max_watts THEN excluded.at ELSE at END,
                max_watts=MAX(max_watts,excluded.max_watts)""",(entity,watts,now))
            # Retain a separate fallback even if the current sensor is temporarily missing.
            db.execute("""INSERT INTO pp_power_estimated_current_peaks(entity,max_amps,at)
                VALUES(?,?,?) ON CONFLICT(entity) DO UPDATE SET
                at=CASE WHEN excluded.max_amps>max_amps THEN excluded.at ELSE at END,
                max_amps=MAX(max_amps,excluded.max_amps)""",(entity,watts/230,now))
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
    ensure_24h_current_column(db)
    # Only total sums based on ALL real Shelly current entities qualify.
    # An incomplete measurement or W/230 fallback must not distort Ø A.
    recorded_amps = amps_total if (fully_measured
        and snapshot.get("printers_measured")==snapshot.get("printers_total")
        and isinstance(amps_total,(int,float))
        and not isinstance(amps_total,bool) and math.isfinite(amps_total)
        and amps_total>=0) else None
    # Record all genuine current readings even if another active device is
    # unassigned, offline or has only a calculated substitute. Never count
    # an estimate or a missing sensor as measured zero.
    real_values=[x["amps"] for x in devices
                 if isinstance(x,dict) and x.get("amps_source")=="shelly"
                 and isinstance(x.get("amps"),(int,float))
                 and not isinstance(x["amps"],bool)
                 and math.isfinite(x["amps"]) and x["amps"]>=0]
    observed=round(sum(real_values),3) if real_values else None
    db.execute("""INSERT OR REPLACE INTO pp_power_history
        (at, watts, measured, expected, amps, amps_observed, amps_count, amps_expected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (now, snapshot.get("watts"), snapshot.get("printers_measured", 0),
         snapshot.get("printers_total", 0), recorded_amps, observed,
         len(real_values),len(devices)))
    if now % 300 < 16:
        db.execute("DELETE FROM pp_power_history WHERE at<?", (now - 86400,))


def history(db, minutes=60, now=None):
    """Return observed W and complete, directly measured A; preserve gaps/peaks."""
    if minutes not in (15, 60, 180, 1440):
        raise ValueError("Ungültiger Zeitraum.")
    ensure_24h_current_column(db)
    end = int(time.time() if now is None else now)
    start = end - minutes * 60
    rows = db.execute("""SELECT at,watts,amps,amps_observed,amps_count,amps_expected,measured,expected FROM pp_power_history
        WHERE at>=? AND at<=? ORDER BY at""", (start,end)).fetchall()
    # At 15-second cadence the 24h view has at most about 5,761 points.
    # Striding through samples loses short peaks and introduces false gaps.
    return [{"at": row["at"], "watts": row["watts"], "amps": row["amps"],
             "amps_observed": row["amps_observed"] if row["amps_observed"] is not None else row["amps"],
             "amps_count": row["amps_count"], "amps_expected": row["amps_expected"],
             "amps_complete": (row["amps"] is not None if row["amps_count"] is None
                               else row["amps_count"] > 0 and row["amps_count"] == row["amps_expected"]),
             "measured": row["measured"], "expected": row["expected"]}
            for row in rows]
