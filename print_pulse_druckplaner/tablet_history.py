"""Persistent compact electrical history & CSV exports for the HA tablet monitor.

Unlike the 24h chart, this keeps real per-device W/A samples aggregated at
5 minutes for 10 days and at one hour for 400 days. The export groups them
further so even a year's data is compact enough to upload for analysis.
"""
import csv
import io
import math
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Berlin")
TOTAL = "__gesamt__"
PERIODS = {
    "day": (86400, 300, "1-Tag"),
    "week": (7 * 86400, 900, "7-Tage"),
    "month": (30 * 86400, 3600, "30-Tage"),
    "year": (365 * 86400, 86400, "365-Tage"),
}
SCHEMAS = {
    300: "pp_power_trend_5m",
    3600: "pp_power_trend_1h",
}
HEADERS = [
    "zeitraum", "intervall_start", "intervall_ende",
    "geraet", "sensor_entitaet",
    "watt_mittel", "watt_max", "ampere_mittel", "ampere_max",
    "energie_geschaetzt_kwh",
    "leistungswerte", "messintervalle", "abdeckung_prozent",
    "ampere_direkt_prozent", "drucker_erfasst_mittel",
    "drucker_erwartet_mittel",
    "datensatztyp", "max_a_vor_reset", "max_a_alter_messzeitpunkt",
    "max_a_reset_zeitpunkt", "max_a_peak_herkunft",
]


def ensure(db):
    for name in SCHEMAS.values():
        db.execute(f"""CREATE TABLE IF NOT EXISTS {name}(
            bucket INTEGER NOT NULL,
            device_key TEXT NOT NULL,
            device_name TEXT NOT NULL,
            samples INTEGER NOT NULL,
            watts_count INTEGER NOT NULL,
            watts_sum REAL NOT NULL,
            watts_max REAL NOT NULL,
            amps_count INTEGER NOT NULL,
            amps_sum REAL NOT NULL,
            amps_max REAL NOT NULL,
            amps_direct_count INTEGER NOT NULL,
            energy_est_kwh REAL NOT NULL,
            measured_sum INTEGER NOT NULL,
            expected_sum INTEGER NOT NULL,
            PRIMARY KEY(bucket,device_key)
        )""")


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) and value >= 0 else None


def record_sample(db, snapshot, now=None):
    """Append the current monitored snapshot to the compact 5m and 1h series.

    Values come from exactly the same HA snapshot as the safety monitor. Missing
    measurements never become a zero average. No extrapolation over downtime.
    """
    now = int(time.time() if now is None else now)
    ensure(db)
    rows = [{
        "name": "GESAMT",
        "entity": TOTAL,
        "watts": snapshot.get("watts"),
        "amps": snapshot.get("amps"),
        "amps_source": snapshot.get("amps_source"),
        "measured": snapshot.get("printers_measured", 0),
        "expected": snapshot.get("printers_total", 0),
    }]
    rows.extend(snapshot.get("devices") or [])
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "Unbenannt")[:70]
        entity = str(row.get("entity") or "")[:170]
        key = entity if entity else "nicht-zugeordnet:" + name
        watts = _number(row.get("watts"))
        amps = _number(row.get("amps"))
        watts_count = int(watts is not None)
        amps_count = int(amps is not None)
        measured = (max(0, int(row.get("measured") or 0))
                    if entity == TOTAL else watts_count)
        expected = (max(0, int(row.get("expected") or 0))
                    if entity == TOTAL else 1)
        direct = int(amps_count and row.get("amps_source") == "shelly")
        # Approximation: one 15-second reading represents 15 seconds, never
        # the entire gap if HA or the add-on was unavailable.
        energy = (watts or 0.0) * 15 / 3600000
        for interval, table in SCHEMAS.items():
            start = (now // interval) * interval
            db.execute(f"""INSERT INTO {table}(
                bucket,device_key,device_name,samples,watts_count,watts_sum,
                watts_max,amps_count,amps_sum,amps_max,amps_direct_count,
                energy_est_kwh,measured_sum,expected_sum)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(bucket,device_key) DO UPDATE SET
                    device_name=excluded.device_name,
                    samples=samples+excluded.samples,
                    watts_count=watts_count+excluded.watts_count,
                    watts_sum=watts_sum+excluded.watts_sum,
                    watts_max=MAX(watts_max,excluded.watts_max),
                    amps_count=amps_count+excluded.amps_count,
                    amps_sum=amps_sum+excluded.amps_sum,
                    amps_max=MAX(amps_max,excluded.amps_max),
                    amps_direct_count=amps_direct_count+excluded.amps_direct_count,
                    energy_est_kwh=energy_est_kwh+excluded.energy_est_kwh,
                    measured_sum=measured_sum+excluded.measured_sum,
                    expected_sum=expected_sum+excluded.expected_sum""",
                (start,key,name,1,watts_count,watts or 0.0,watts or 0.0,
                 amps_count,amps or 0.0,amps or 0.0,direct,energy,
                 measured,expected))
    # Retain fine data for ten days and hourly history for > one year.
    # Cleanup at most every five minutes.
    if now % 300 < 16:
        db.execute("DELETE FROM pp_power_trend_5m WHERE bucket<?",
                   (now - 10 * 86400,))
        db.execute("DELETE FROM pp_power_trend_1h WHERE bucket<?",
                   (now - 400 * 86400,))


def _local_midnight(timestamp):
    date = datetime.fromtimestamp(timestamp, TZ).date()
    return int(datetime(date.year, date.month, date.day,
                        tzinfo=TZ).timestamp())


def collect(db, period, now=None):
    if period not in PERIODS:
        raise ValueError("Ungültiger Exportzeitraum.")
    now = int(time.time() if now is None else now)
    duration, spacing, _ = PERIODS[period]
    source_interval = 300 if period in ("day","week") else 3600
    table = SCHEMAS[source_interval]
    ensure(db)
    start = now - duration
    start_bucket = start // source_interval * source_interval
    data = db.execute(f"""SELECT * FROM {table}
        WHERE bucket>=? AND bucket<=?
        ORDER BY bucket,device_name""",
        (start_bucket, now)).fetchall()
    grouped = {}
    for row in data:
        timestamp = row["bucket"]
        bucket = (_local_midnight(timestamp) if period == "year"
                  else timestamp // spacing * spacing)
        key = (bucket, row["device_key"])
        obj = grouped.get(key)
        if obj is None:
            obj = {
                "bucket": bucket,
                "device_key": row["device_key"],
                "device_name": row["device_name"],
                "samples": 0,
                "watts_count": 0, "watts_sum": 0.0, "watts_max": 0.0,
                "amps_count": 0, "amps_sum": 0.0, "amps_max": 0.0,
                "amps_direct_count": 0, "energy_est_kwh": 0.0,
                "measured_sum": 0, "expected_sum": 0,
            }
            grouped[key] = obj
        obj["device_name"] = row["device_name"]
        for field in ("samples","watts_count","amps_count","amps_direct_count",
                      "measured_sum","expected_sum"):
            obj[field] += row[field]
        for field in ("watts_sum","amps_sum","energy_est_kwh"):
            obj[field] += row[field]
        for field in ("watts_max","amps_max"):
            obj[field] = max(obj[field], row[field])
    return sorted(grouped.values(), key=lambda r:
                  (r["bucket"],0 if r["device_key"] == TOTAL else 1,
                   r["device_name"].casefold()))


def _safe_cell(value):
    """Prevent spreadsheet-formula execution from user-editable device names."""
    text = str(value).replace("\r"," ").replace("\n"," ")
    return "'" + text if text.lstrip().startswith(("=","+","-","@")) else text


def reset_events(db, period, now=None):
    """Include permanent Max-A reset events alongside the measured trend."""
    if period not in PERIODS:
        raise ValueError("Ungültiger Exportzeitraum.")
    exists = db.execute("""SELECT 1 FROM sqlite_master
        WHERE type='table' AND name='pp_power_peak_reset_log'""").fetchone()
    if not exists:
        return []
    now = int(time.time() if now is None else now)
    return db.execute("""SELECT at,device_key,device_name,previous_amps,
        previous_source,previous_peak_at,scope
        FROM pp_power_peak_reset_log WHERE at>=? AND at<=?
        ORDER BY at,id""",(now-PERIODS[period][0],now)).fetchall()


def export_csv(db, period, now=None):
    """German Excel-compatible UTF-8 CSV, machine-readable by ChatGPT."""
    if period not in PERIODS:
        raise ValueError("Ungültiger Exportzeitraum.")
    rows = collect(db, period, now=now)
    events = reset_events(db, period, now=now)
    if not rows and not events:
        raise LookupError("Für diesen Zeitraum liegen noch keine Messdaten vor.")
    _duration, spacing, label = PERIODS[period]
    out = io.StringIO(newline="")
    writer = csv.writer(out, delimiter=";", lineterminator="\r\n")
    writer.writerow(HEADERS)
    def val(n, precision=3):
        return ("" if n is None else
                f"{n:.{precision}f}".replace(".",","))
    for row in rows:
        start = datetime.fromtimestamp(row["bucket"], TZ)
        if period == "year":
            finish = start + timedelta(days=1)
        else:
            finish = datetime.fromtimestamp(row["bucket"]+spacing, TZ)
        wc = row["watts_count"]
        ac = row["amps_count"]
        samples = row["samples"]
        coverage = (row["measured_sum"] / row["expected_sum"]*100
                    if row["expected_sum"] else None)
        if row["device_key"] != TOTAL:
            coverage = wc/samples*100 if samples else None
        direct = row["amps_direct_count"]/ac*100 if ac else None
        measured_mean = (row["measured_sum"] / samples
                         if row["device_key"] == TOTAL and samples else None)
        expected_mean = (row["expected_sum"] / samples
                         if row["device_key"] == TOTAL and samples else None)
        writer.writerow([
            label,
            start.isoformat(timespec="seconds"),
            finish.isoformat(timespec="seconds"),
            _safe_cell(row["device_name"]),
            _safe_cell(row["device_key"]),
            val(row["watts_sum"]/wc if wc else None,2),
            val(row["watts_max"] if wc else None,1),
            val(row["amps_sum"]/ac if ac else None,3),
            val(row["amps_max"] if ac else None,3),
            val(row["energy_est_kwh"],5),
            wc,samples,val(coverage,1),val(direct,1),
            val(measured_mean,2),val(expected_mean,2),
            "Messwerte","","","","",
        ])
    # Same CSV structure throughout. Peak reset events are ordinary rows with
    # an explicit dataset type so ChatGPT/Excel can filter them reliably.
    for event in events:
        stamp = datetime.fromtimestamp(event["at"], TZ).isoformat(timespec="seconds")
        previous_at = (datetime.fromtimestamp(event["previous_peak_at"], TZ)
                       .isoformat(timespec="seconds")
                       if event["previous_peak_at"] is not None else "")
        cells = [""] * len(HEADERS)
        cells[0] = label
        cells[1] = stamp
        cells[2] = stamp
        cells[3] = _safe_cell(event["device_name"])
        cells[4] = _safe_cell(event["device_key"])
        cells[16] = "Max-A-Reset"
        cells[17] = val(event["previous_amps"],3)
        cells[18] = previous_at
        cells[19] = stamp
        cells[20] = event["previous_source"] or ""
        writer.writerow(cells)
    return ("\ufeff"+out.getvalue()).encode("utf-8")
