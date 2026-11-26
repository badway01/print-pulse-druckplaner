"""Phase-correlated 3D-printer electrical history for the tablet detail view.

Every poll records the HA print stage plus Shelly W/A in a short raw buffer and
5-minute phase-specific rollups. No extrapolation through HA outages. Stage
statistics cannot be reconstructed from pre-installation power-only history.
"""
import math
import re
import time

PERIODS = {"1h": (3600, 15), "24h": (86400, 300),
           "7d": (7*86400, 1800), "30d": (30*86400, 7200)}
RAW_TABLE = "pp_printer_phase_samples"
ROLL_TABLE = "pp_printer_phase_5m"
PHASES = {
    "heating": "Heizt auf",
    "leveling": "Nivelliert",
    "cleaning": "Düse reinigen",
    "calibrating": "Kalibriert / prüft",
    "filament": "Filamentwechsel",
    "printing": "Druckt",
    "cooling": "Kühlt ab",
    "paused": "Pausiert",
    "finished": "Fertig",
    "idle": "Bereit",
    "offline": "Offline",
    "off": "Aus",
    "error": "Fehler",
    "other": "Weitere Phase",
    "unknown": "Unbekannt",
}
ORDER = ("heating", "leveling", "cleaning", "calibrating", "filament",
         "printing", "cooling", "paused", "finished", "idle", "offline",
         "off", "error", "other", "unknown")


def classify(stage, state=None, switch_state=None):
    """Map observed HA stages; suppress stale stages for idle/offline jobs."""
    if switch_state == "off":
        return "off", PHASES["off"]
    status = str(state or "").strip().casefold()
    if status in ("offline", "error", "finished", "paused", "idle"):
        return status, PHASES[status]
    raw = str(stage or "").strip().casefold()
    if raw in ("", "none", "unknown", "unavailable", "idle", "standby"):
        raw = ""
    normalized = re.sub(r"[^a-z0-9äöüß]+", "_", raw)
    if raw:
        patterns = (
            ("cleaning", r"clean|wipe|reinig|purge|prime|flush"),
            ("leveling", r"level|nivell|tramm|z_offset"),
            ("heating", r"heat|preheat|temperatur|heiz|warm_up"),
            ("filament", r"filament|load_material|unload_material|material_wechsel|ams_change"),
            ("calibrating", r"calibr|kalibrier|homing|referenzfahrt|inspect|inspection|scan|mechanic|mech_mode|prüf"),
            ("cooling", r"cool|abkühl"),
            ("printing", r"print|druck"),
            ("paused", r"pause|paus"),
        )
        for key, pattern in patterns:
            if re.search(pattern, normalized):
                return key, PHASES[key]
    if status == "printing":
        return ("other", PHASES["other"]) if raw else ("printing", PHASES["printing"])
    if status == "preparing":
        return "other", PHASES["other"]
    return "unknown", PHASES["unknown"]


# Record precise actions only when the corresponding HA stage is known.
EXACT_ACTIONS = {
    "heatbed_preheating": ("heating", "Heizbett heizt"),
    "heating_bed": ("heating", "Heizbett heizt"),
    "waiting_for_heatbed_temperature": ("heating", "Heizbett heizt"),
    "heating_hotend": ("heating", "Düse heizt"),
    "waiting_for_nozzle_temperature": ("heating", "Düse heizt"),
    "heating_nozzle": ("heating", "Düse heizt"),
    "auto_bed_leveling": ("leveling", "Druckbett nivellieren"),
    "bed_leveling": ("leveling", "Druckbett nivellieren"),
    "cleaning_nozzle_tip": ("cleaning", "Düse reinigen"),
    "homing_toolhead": ("calibrating", "Referenzfahrt"),
    "calibrating_extrusion": ("calibrating", "Extrusion kalibrieren"),
    "calibrating_extrusion_flow": ("calibrating", "Fluss kalibrieren"),
    "calibrating_motor_noise": ("calibrating", "Motorkalibrierung"),
    "calibrating_micro_lidar": ("calibrating", "LiDAR kalibrieren"),
    "checking_extruder_temperature": ("heating", "Düsentemperatur prüfen"),
    "scanning_bed_surface": ("calibrating", "Druckbett prüfen"),
    "inspecting_first_layer": ("calibrating", "Erste Schicht prüfen"),
    "sweeping_xy_mech_mode": ("calibrating", "Mechanikprüfung"),
    "filament_loading": ("filament", "Filament laden"),
    "filament_unloading": ("filament", "Filament entladen"),
    "changing_filament": ("filament", "Filamentwechsel"),
    "cooling_chamber": ("cooling", "Bauraum kühlt ab"),
    "printing": ("printing", "Druckt"),
}


def exact_action(stage, phase):
    normalized = re.sub(r"[^a-z0-9äöüß]+", "_", str(stage or "").strip().casefold())
    match = EXACT_ACTIONS.get(normalized)
    return match[1] if match and match[0] == phase else None


def _add_columns(db, table, columns):
    existing = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    for column in columns:
        if column not in existing:
            try:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
            except Exception:
                # A concurrent request may have completed the same migration.
                if column not in {row[1] for row in db.execute(f"PRAGMA table_info({table})")}:
                    raise


def ensure(db):
    db.execute(f"""CREATE TABLE IF NOT EXISTS {RAW_TABLE}(
        at INTEGER NOT NULL,
        device_key TEXT NOT NULL,
        device_name TEXT NOT NULL,
        phase_key TEXT NOT NULL,
        watts REAL,
        amps REAL,
        amp_direct INTEGER NOT NULL,
        PRIMARY KEY(at, device_key))""")
    db.execute(f"""CREATE INDEX IF NOT EXISTS idx_pp_phase_raw_device
        ON {RAW_TABLE}(device_key,at)""")
    db.execute(f"""CREATE TABLE IF NOT EXISTS {ROLL_TABLE}(
        bucket INTEGER NOT NULL,
        device_key TEXT NOT NULL,
        device_name TEXT NOT NULL,
        phase_key TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        watts_count INTEGER NOT NULL,
        watts_sum REAL NOT NULL,
        watts_max REAL NOT NULL,
        watts_peak_at INTEGER,
        amps_count INTEGER NOT NULL,
        amps_sum REAL NOT NULL,
        amps_max REAL NOT NULL,
        amps_peak_at INTEGER,
        amps_direct_count INTEGER NOT NULL,
        energy_est_kwh REAL NOT NULL,
        PRIMARY KEY(bucket,device_key,phase_key))""")
    db.execute(f"""CREATE INDEX IF NOT EXISTS idx_pp_phase_roll_device
        ON {ROLL_TABLE}(device_key,bucket)""")

    db.execute("""CREATE TABLE IF NOT EXISTS pp_printer_detail_resets(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('watts','amps')),
        at INTEGER NOT NULL,
        period TEXT NOT NULL,
        previous_value REAL,
        previous_at INTEGER,
        previous_direct INTEGER,
        boundary_value REAL,
        boundary_at INTEGER,
        boundary_direct INTEGER)""")
    db.execute("""CREATE INDEX IF NOT EXISTS idx_pp_detail_resets_device
        ON pp_printer_detail_resets(device_key,kind,id)""")
    _add_columns(db, RAW_TABLE, ("action_label",))
    _add_columns(db, ROLL_TABLE, ("watts_peak_action", "amps_peak_action"))
    _add_columns(db, "pp_printer_detail_resets", ("boundary_phase", "boundary_action"))


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int,float)):
        return None
    value = float(value)
    return value if math.isfinite(value) and value >= 0 else None


def record(db, snapshot, now=None):
    now = int(time.time() if now is None else now)
    ensure(db)
    for item in snapshot.get("devices") or ():
        if not isinstance(item, dict) or item.get("kind") not in ("printer","other"):
            continue
        entity = str(item.get("history_key") or item.get("entity") or "")
        if not re.fullmatch(r"sensor\.[a-z0-9_]{3,160}", entity):
            continue
        phase, label = classify(item.get("print_stage"),item.get("printer_state"),
                                item.get("switch_state"))
        action = exact_action(item.get("print_stage"),phase)
        if item.get("kind")=="other":
            phase = "off" if item.get("switch_state")=="off" else (
                "idle" if item.get("switch_state")=="on" else "unknown")
            action = "Ausgeschaltet" if phase=="off" else (
                "Eingeschaltet" if phase=="idle" else "Schaltzustand unbekannt")
        name = str(item.get("name") or entity)[:70]
        watts, amps = number(item.get("watts")), number(item.get("amps"))
        direct = int(amps is not None and item.get("amps_source") == "shelly")
        db.execute(f"""INSERT OR REPLACE INTO {RAW_TABLE}
            (at,device_key,device_name,phase_key,watts,amps,amp_direct,action_label)
            VALUES(?,?,?,?,?,?,?,?)""",
            (now,entity,name,phase,watts,amps,direct,action))
        # Track the post-reset portion of the first 5-minute bucket separately.
        # The original bucket remains intact for historical charts and phases.
        for kind, value in (("watts", watts), ("amps", amps)):
            if value is not None:
                db.execute("""UPDATE pp_printer_detail_resets
                    SET boundary_value=?,boundary_at=?,boundary_direct=?,
                        boundary_phase=?,boundary_action=?
                    WHERE id=(SELECT MAX(id) FROM pp_printer_detail_resets
                              WHERE device_key=? AND kind=?)
                      AND at<? AND at>=?
                      AND (boundary_value IS NULL OR boundary_value<?)""",
                    (value,now,direct if kind=="amps" else 1,phase,action,
                     entity,kind,now,now//300*300,value))
        bucket = now//300*300
        wc, ac = int(watts is not None), int(amps is not None)
        db.execute(f"""INSERT INTO {ROLL_TABLE}
            (bucket,device_key,device_name,phase_key,sample_count,
             watts_count,watts_sum,watts_max,watts_peak_at,
             amps_count,amps_sum,amps_max,amps_peak_at,amps_direct_count,
             energy_est_kwh,watts_peak_action,amps_peak_action)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(bucket,device_key,phase_key) DO UPDATE SET
             device_name=excluded.device_name,
             sample_count=sample_count+1,
             watts_count=watts_count+excluded.watts_count,
             watts_sum=watts_sum+excluded.watts_sum,
             watts_peak_action=CASE WHEN excluded.watts_count>0 AND
                 (watts_count=0 OR excluded.watts_max>watts_max)
                 THEN excluded.watts_peak_action ELSE watts_peak_action END,
             watts_peak_at=CASE WHEN excluded.watts_count>0 AND
                 (watts_count=0 OR excluded.watts_max>watts_max)
                 THEN excluded.watts_peak_at ELSE watts_peak_at END,
             watts_max=MAX(watts_max,excluded.watts_max),
             amps_count=amps_count+excluded.amps_count,
             amps_sum=amps_sum+excluded.amps_sum,
             amps_peak_action=CASE WHEN excluded.amps_count>0 AND
                 (amps_count=0 OR excluded.amps_max>amps_max)
                 THEN excluded.amps_peak_action ELSE amps_peak_action END,
             amps_peak_at=CASE WHEN excluded.amps_count>0 AND
                 (amps_count=0 OR excluded.amps_max>amps_max)
                 THEN excluded.amps_peak_at ELSE amps_peak_at END,
             amps_max=MAX(amps_max,excluded.amps_max),
             amps_direct_count=amps_direct_count+excluded.amps_direct_count,
             energy_est_kwh=energy_est_kwh+excluded.energy_est_kwh""",
            (bucket,entity,name,phase,1,wc,watts or 0,watts or 0,
             now if wc else None,ac,amps or 0,amps or 0,now if ac else None,
             direct,(watts or 0)*15/3600000,action if wc else None,action if ac else None))
    if now%300 < 16:
        db.execute(f"DELETE FROM {RAW_TABLE} WHERE at<?",(now-2*86400,))
        db.execute(f"DELETE FROM {ROLL_TABLE} WHERE bucket<?",(now-31*86400,))


def _blank(group, label):
    return {"phase":group,"label":label,"samples":0,"wc":0,"ws":0.0,
            "wm":None,"wt":None,"ac":0,"as":0.0,"am":None,
            "at":None,"direct":0,"kwh":0.0}


def _add(stat, wc, ws, wm, wt, ac, asum, amax, at, direct, kwh, samples):
    stat["samples"]+=samples
    stat["wc"]+=wc
    stat["ws"]+=ws
    stat["ac"]+=ac
    stat["as"]+=asum
    stat["direct"]+=direct
    stat["kwh"]+=kwh
    if wc and (stat["wm"] is None or wm>stat["wm"]):
        stat["wm"],stat["wt"]=wm,wt
    if ac and (stat["am"] is None or amax>stat["am"]):
        stat["am"],stat["at"]=amax,at


def _format_stat(item):
    return {"phase":item["phase"],"label":item["label"],
            "samples":item["samples"],
            "watts_avg":round(item["ws"]/item["wc"],1) if item["wc"] else None,
            "watts_peak":round(item["wm"],1) if item["wm"] is not None else None,
            "watts_peak_at":item["wt"],
            "amps_avg":round(item["as"]/item["ac"],3) if item["ac"] else None,
            "amps_peak":round(item["am"],3) if item["am"] is not None else None,
            "amps_peak_at":item["at"],
            "amps_direct_pct":round(item["direct"]/item["ac"]*100,1) if item["ac"] else None,
            "energy_est_kwh":round(item["kwh"],5)}


def _card_peak(db, entity, kind, period, now, summary):
    reset=db.execute("""SELECT * FROM pp_printer_detail_resets
        WHERE device_key=? AND kind=? ORDER BY id DESC LIMIT 1""",
        (entity,kind)).fetchone()
    result={"value":summary[kind+"_peak"],"at":summary[kind+"_peak_at"],
            "direct":kind=="watts" or summary["amps_direct_pct"]==100,
            "reset_at":reset["at"] if reset else None}
    if reset is None:
        return result
    duration,_=PERIODS[period]
    start=now-duration
    reset_at=reset["at"]
    # For long periods, keep the existing five-minute resolution, but never
    # allow a pre-reset peak in the boundary bucket to reappear.
    if period=="1h":
        if reset_at<start:
            return result
        rows=db.execute(f"""SELECT {kind} AS value,at,amp_direct AS direct
            FROM {RAW_TABLE} WHERE device_key=? AND at>=? AND at>? AND at<=?
            AND {kind} IS NOT NULL ORDER BY value DESC,at LIMIT 1""",
            (entity,start,reset_at,now)).fetchall()
        candidates=[(r["value"],r["at"],kind=="watts" or bool(r["direct"])) for r in rows]
    else:
        reset_bucket=reset_at//300*300
        if reset_bucket<start//300*300:
            return result
        rows=db.execute(f"""SELECT {kind}_max AS value,{kind}_peak_at AS at,
            amps_direct_count,amps_count FROM {ROLL_TABLE}
            WHERE device_key=? AND bucket>? AND bucket<=? AND {kind}_count>0
              AND {kind}_peak_at IS NOT NULL
            ORDER BY value DESC,at LIMIT 1""",(entity,reset_bucket,now)).fetchall()
        candidates=[(r["value"],r["at"],kind=="watts" or
                     r["amps_direct_count"]==r["amps_count"]) for r in rows]
        if reset["boundary_at"] is not None and reset["boundary_at"]<=now:
            candidates.append((reset["boundary_value"],reset["boundary_at"],
                               bool(reset["boundary_direct"])))
    if candidates:
        value,at,direct=max(candidates,key=lambda x:(x[0],-x[1]))
        result.update(value=round(value,1 if kind=="watts" else 3),at=at,direct=direct)
    else:
        result.update(value=None,at=None,direct=False)
    return result


def peak_context(db, entity, kind, at, fallback_phase=None):
    """Match the recorded peak time, never substitute a current printer stage."""
    if at is None:
        return None
    if kind not in ("watts","amps"):
        raise ValueError("Ungültige Messgröße.")
    row = db.execute(f"""SELECT phase_key,action_label
        FROM {RAW_TABLE} WHERE device_key=? AND at=? AND {kind} IS NOT NULL""",
        (entity,at)).fetchone()
    if row is None:
        row = db.execute(f"""SELECT phase_key,{kind}_peak_action AS action_label
            FROM {ROLL_TABLE} WHERE device_key=? AND bucket=? AND {kind}_peak_at=?
            AND {kind}_count>0 ORDER BY phase_key LIMIT 1""",
            (entity,at//300*300,at)).fetchone()
    if row is None:
        row = db.execute("""SELECT boundary_phase AS phase_key,boundary_action AS action_label
            FROM pp_printer_detail_resets WHERE device_key=? AND kind=? AND boundary_at=?
            AND boundary_phase IS NOT NULL ORDER BY id DESC LIMIT 1""",
            (entity,kind,at)).fetchone()
    phase = row["phase_key"] if row else fallback_phase
    action = row["action_label"] if row else None
    return {"phase":PHASES.get(phase,"Unbekannt"),"action":action,
            "label":action or PHASES.get(phase,"Unbekannt")}


def reset_peak(db, entity, kind, period="24h", now=None, previous=None):
    """Reset exactly one detail-card metric; preserve all original readings."""
    if kind not in ("watts","amps"):
        raise ValueError("Ungültige Messgröße.")
    now=int(time.time() if now is None else now)
    ensure(db)
    if period not in PERIODS:
        raise ValueError("Ungültiger Zeitraum.")
    before=previous if previous is not None else detail(db,entity,period,now)["card_peaks"][kind]
    db.execute("""INSERT INTO pp_printer_detail_resets
        (device_key,kind,at,period,previous_value,previous_at,previous_direct)
        VALUES(?,?,?,?,?,?,?)""",
        (entity,kind,now,period,before["value"],before["at"],int(before["direct"])))
    return {"ok":True,"kind":kind,"entity":entity,"reset_at":now}


def detail(db, entity, period="24h", now=None):
    if period not in PERIODS:
        raise ValueError("Ungültiger Zeitraum.")
    if not isinstance(entity,str) or not re.fullmatch(r"sensor\.[a-z0-9_]{3,160}",entity):
        raise ValueError("Ungültiger Leistungssensor.")
    now = int(time.time() if now is None else now)
    duration,step = PERIODS[period]
    from_time=now-duration
    ensure(db)
    phase_acc={}
    plot={}
    if period=="1h":
        rows=db.execute(f"""SELECT * FROM {RAW_TABLE}
            WHERE device_key=? AND at>=? AND at<=? ORDER BY at""",
            (entity,from_time,now)).fetchall()
        for row in rows:
            phase=row["phase_key"]
            stat=phase_acc.setdefault(phase,_blank(phase,PHASES.get(phase,"Weitere Phase")))
            w,a=row["watts"],row["amps"]
            _add(stat,int(w is not None),w or 0,w or 0,row["at"] if w is not None else None,
                 int(a is not None),a or 0,a or 0,row["at"] if a is not None else None,
                 row["amp_direct"],(w or 0)*15/3600000,1)
            key=row["at"]//step*step
            value=plot.setdefault(key,{"at":key,"wc":0,"ws":0,"ac":0,"as":0,
                                      "phases":{}})
            value["wc"]+=int(w is not None)
            value["ws"]+=w or 0
            value["ac"]+=int(a is not None)
            value["as"]+=a or 0
            value["phases"][phase]=value["phases"].get(phase,0)+1
    else:
        start_bucket=from_time//300*300
        rows=db.execute(f"""SELECT * FROM {ROLL_TABLE}
            WHERE device_key=? AND bucket>=? AND bucket<=?
            ORDER BY bucket,phase_key""",(entity,start_bucket,now)).fetchall()
        for row in rows:
            phase=row["phase_key"]
            stat=phase_acc.setdefault(phase,_blank(phase,PHASES.get(phase,"Weitere Phase")))
            _add(stat,row["watts_count"],row["watts_sum"],row["watts_max"],
                 row["watts_peak_at"],row["amps_count"],row["amps_sum"],
                 row["amps_max"],row["amps_peak_at"],row["amps_direct_count"],
                 row["energy_est_kwh"],row["sample_count"])
            key=row["bucket"]//step*step
            value=plot.setdefault(key,{"at":key,"wc":0,"ws":0,"ac":0,"as":0,
                                      "phases":{}})
            value["wc"]+=row["watts_count"]
            value["ws"]+=row["watts_sum"]
            value["ac"]+=row["amps_count"]
            value["as"]+=row["amps_sum"]
            value["phases"][phase]=value["phases"].get(phase,0)+row["sample_count"]
    phases=[_format_stat(phase_acc[key]) for key in ORDER if key in phase_acc]
    totals=_blank("total","Gesamt")
    for item in phase_acc.values():
        _add(totals,item["wc"],item["ws"],item["wm"] or 0,item["wt"],
             item["ac"],item["as"],item["am"] or 0,item["at"],
             item["direct"],item["kwh"],item["samples"])
    peaks=[]
    for phase in phases:
        if phase["watts_peak_at"] is not None:
            peaks.append({"kind":"watts","at":phase["watts_peak_at"],
                          "value":phase["watts_peak"],"phase":phase["label"]})
        if phase["amps_peak_at"] is not None:
            peaks.append({"kind":"amps","at":phase["amps_peak_at"],
                          "value":phase["amps_peak"],"phase":phase["label"]})
    peaks.sort(key=lambda item:item["at"],reverse=True)
    series=[]
    for item in sorted(plot.values(),key=lambda x:x["at"]):
        phase=max(item["phases"],key=item["phases"].get)
        series.append({"at":item["at"],
                       "watts":round(item["ws"]/item["wc"],1) if item["wc"] else None,
                       "amps":round(item["as"]/item["ac"],3) if item["ac"] else None,
                       "phase":PHASES.get(phase,"Weitere Phase")})
    summary=_format_stat(totals)
    card_peaks={kind:_card_peak(db,entity,kind,period,now,summary)
                for kind in ("watts","amps")}
    for kind, card in card_peaks.items():
        card["context"]=peak_context(db,entity,kind,card["at"])
    for phase in phases:
        for kind in ("watts","amps"):
            phase[kind+"_context"]=peak_context(db,entity,kind,
                phase[kind+"_peak_at"],phase["phase"])
    reset_history=[dict(r) for r in db.execute("""SELECT kind,at,period,
        previous_value,previous_at,previous_direct FROM pp_printer_detail_resets
        WHERE device_key=? AND at>=? AND at<=? ORDER BY id DESC LIMIT 20""",
        (entity,from_time,now)).fetchall()]
    return {"period":period,"retention":"2 Tage fein · 31 Tage verdichtet",
            "started":bool(rows),"samples":totals["samples"],
            "summary":summary,"card_peaks":card_peaks,"reset_history":reset_history,
            "phases":phases,"series":series,
            "peaks":peaks[:12],"updated":now,
            "note":"Phase aus Home Assistant, Watt/Ampere vom zugeordneten Shelly. "
                   "15-Sekunden-Abtastung; kürzere Spitzen können fehlen. "
                   "Unbekannte Phasen werden nicht geraten."}
