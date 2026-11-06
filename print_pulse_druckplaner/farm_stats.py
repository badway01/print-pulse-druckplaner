"""Conservative, persistent, 24/7 production-time analytics for the HA add-on.

Only observed HA sensor intervals are measured. Gaps and unconfigured printers
are never silently treated as idle; manual runs are clearly identified.
"""
import time

PRINTERS = ("H2D", "P1S Old", "P1S New", "Snapmaker U1", "A1 mini", "Prusa MK4")
# Only these four printers count toward the production fleet statistics.
# The two manual printers and their existing history remain intact.
PRODUCTION_PRINTERS = ("H2D", "P1S Old", "P1S New", "Snapmaker U1")
MANUAL_PRINTERS = ("A1 mini", "Prusa MK4")
KNOWN_STATES = {"printing", "paused", "idle", "finished", "error", "preparing"}
MAX_GAP_SECONDS = 100
RETENTION_DAYS = 95


def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_farm_last(
      printer TEXT PRIMARY KEY, at INTEGER NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_farm_intervals(
      id INTEGER PRIMARY KEY AUTOINCREMENT, printer TEXT NOT NULL,
      started INTEGER NOT NULL, ended INTEGER NOT NULL,
      state TEXT NOT NULL, CHECK(ended>started));
    CREATE INDEX IF NOT EXISTS pp_farm_period
      ON pp_farm_intervals(started, ended, printer);
    CREATE TABLE IF NOT EXISTS pp_farm_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT, printer TEXT NOT NULL,
      happened INTEGER NOT NULL, result TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS pp_farm_event_period
      ON pp_farm_events(happened, printer);
    CREATE TABLE IF NOT EXISTS pp_farm_manual(
      id INTEGER PRIMARY KEY AUTOINCREMENT, printer TEXT NOT NULL,
      started INTEGER NOT NULL, ended INTEGER, outcome TEXT,
      CHECK(ended IS NULL OR ended>started));
    CREATE UNIQUE INDEX IF NOT EXISTS pp_farm_manual_single
      ON pp_farm_manual(printer) WHERE ended IS NULL;
    CREATE INDEX IF NOT EXISTS pp_farm_manual_period
      ON pp_farm_manual(started, ended, printer);
    """)


def record_poll(db, rows, now=None):
    """Poll HA once per minute; merge consecutive same-state slices to stay small.

    A sensor outage, reboot or missed poll breaks the interval instead of
    inventing printer work/idle time during the gap.
    """
    now = int(time.time() if now is None else now)
    for row in rows:
        printer = row.get("id")
        if printer not in PRINTERS:
            continue
        state = str(row.get("state") or "unknown")
        if not row.get("configured") or state not in KNOWN_STATES:
            state = "unknown"
        old = db.execute("SELECT at,state FROM pp_farm_last WHERE printer=?",
                         (printer,)).fetchone()
        if old is not None:
            previous_at, previous_state = int(old["at"]), old["state"]
            gap = now - previous_at
            if 0 < gap <= MAX_GAP_SECONDS and previous_state in KNOWN_STATES:
                latest = db.execute("""SELECT id,ended,state FROM pp_farm_intervals
                    WHERE printer=? ORDER BY id DESC LIMIT 1""",
                    (printer,)).fetchone()
                if latest is not None and latest["state"] == previous_state \
                        and int(latest["ended"]) == previous_at:
                    db.execute("UPDATE pp_farm_intervals SET ended=? WHERE id=?",
                               (now,latest["id"]))
                else:
                    db.execute("""INSERT INTO pp_farm_intervals
                        (printer,started,ended,state) VALUES (?,?,?,?)""",
                        (printer,previous_at,now,previous_state))
                if previous_state in ("printing","paused") and state in ("finished","error"):
                    db.execute("""INSERT INTO pp_farm_events
                        (printer,happened,result) VALUES (?,?,?)""",
                        (printer,now,"success" if state=="finished" else "failed"))
        db.execute("""INSERT INTO pp_farm_last(printer,at,state) VALUES (?,?,?)
            ON CONFLICT(printer) DO UPDATE SET at=excluded.at,state=excluded.state""",
            (printer,now,state))
    # Prune once per hourly bucket. Keeps production DB bounded.
    if now % 3600 < 70:
        cutoff = now - RETENTION_DAYS*86400
        db.execute("DELETE FROM pp_farm_intervals WHERE ended<?",(cutoff,))
        db.execute("DELETE FROM pp_farm_events WHERE happened<?",(cutoff,))
        db.execute("DELETE FROM pp_farm_manual WHERE ended IS NOT NULL AND ended<?",
                   (cutoff,))


def manual_action(db, printer, action, now=None):
    """Explicit stopwatch for A1 mini / Prusa MK4; never controls a printer."""
    if printer not in MANUAL_PRINTERS:
        raise ValueError("Für diesen Drucker erfolgt die Messung über Home Assistant.")
    if action not in ("start","finish","failed","cancel"):
        raise ValueError("Unbekannte Druckaktion.")
    now = int(time.time() if now is None else now)
    current = db.execute("""SELECT id,started FROM pp_farm_manual
        WHERE printer=? AND ended IS NULL""",(printer,)).fetchone()
    if action == "start":
        if current is not None:
            raise ValueError("Eine manuelle Druckzeit läuft bereits.")
        db.execute("INSERT INTO pp_farm_manual(printer,started) VALUES (?,?)",
                   (printer,now))
    else:
        if current is None:
            raise ValueError("Kein laufender manueller Druck vorhanden.")
        if now <= current["started"]:
            raise ValueError("Endzeit liegt vor dem Start.")
        outcome={"finish":"success","failed":"failed","cancel":"cancelled"}[action]
        db.execute("""UPDATE pp_farm_manual SET ended=?,outcome=?
            WHERE id=?""",(now,outcome,current["id"]))
    return {"ok":True, "printer":printer, "action":action}


def summary(db, days=7, now=None):
    """Rolling window; separate 24h capacity from actually observed coverage."""
    if days not in (1,7,30):
        raise ValueError("Ungültiger Zeitraum.")
    now=int(time.time() if now is None else now)
    start=now-days*86400
    capacity=days*86400
    records={name:{
        "printer":name,"source":"manual" if name in MANUAL_PRINTERS else "ha",
        "printing_seconds":0,"idle_seconds":0,"paused_seconds":0,
        "preparing_seconds":0,"fault_seconds":0,"observed_seconds":0,
        "successes":0,"failures":0,"manual_active_since":None,
        "last_sample_at":None
    } for name in PRINTERS}
    for r in db.execute("""SELECT printer,started,ended,state FROM pp_farm_intervals
        WHERE ended>? AND started<?""",(start,now)):
        row=records.get(r["printer"])
        if row is None:
            continue
        secs=max(0,min(now,int(r["ended"]))-max(start,int(r["started"])))
        row["observed_seconds"]+=secs
        key={
          "printing":"printing_seconds","paused":"paused_seconds",
          "preparing":"preparing_seconds","error":"fault_seconds",
          "idle":"idle_seconds","finished":"idle_seconds"
        }.get(r["state"])
        if key:
            row[key]+=secs
    for r in db.execute("""SELECT printer,started,ended,outcome FROM pp_farm_manual
        WHERE started<? AND (ended IS NULL OR ended>?)""",(now,start)):
        row=records.get(r["printer"])
        if row is None:
            continue
        finish=int(r["ended"]) if r["ended"] is not None else now
        secs=max(0,min(now,finish)-max(start,int(r["started"])))
        row["observed_seconds"]+=secs
        row["printing_seconds"]+=secs
    for r in db.execute("""SELECT printer,started FROM pp_farm_manual
        WHERE ended IS NULL"""):
        if r["printer"] in records:
            records[r["printer"]]["manual_active_since"]=r["started"]
    for r in db.execute("""SELECT printer,at FROM pp_farm_last"""):
        if r["printer"] in records:
            records[r["printer"]]["last_sample_at"]=r["at"]
    for r in db.execute("""SELECT printer,result,COUNT(*) AS qty
        FROM pp_farm_events WHERE happened>=? AND happened<=?
        GROUP BY printer,result""",(start,now)):
        if r["printer"] in records:
            key="successes" if r["result"]=="success" else "failures"
            records[r["printer"]][key]+=r["qty"]
    for r in db.execute("""SELECT printer,outcome,COUNT(*) AS qty
        FROM pp_farm_manual WHERE ended>=? AND ended<=?
        GROUP BY printer,outcome""",(start,now)):
        if r["printer"] in records and r["outcome"] in ("success","failed"):
            key="successes" if r["outcome"]=="success" else "failures"
            records[r["printer"]][key]+=r["qty"]
    # Ignore manual/standby printers for both numerator and denominator.
    printers=[records[name] for name in PRODUCTION_PRINTERS]
    for row in printers:
        row["observed_seconds"]=min(capacity,row["observed_seconds"])
        row["printing_seconds"]=min(capacity,row["printing_seconds"])
        row["coverage_percent"]=round(100*row["observed_seconds"]/capacity,1)
        row["capacity_percent"]=round(100*row["printing_seconds"]/capacity,1)
        row["measured_utilization_percent"]=(
            round(100*row["printing_seconds"]/row["observed_seconds"],1)
            if row["observed_seconds"]>=3600 else None)
    total_printing=sum(x["printing_seconds"] for x in printers)
    total_observed=sum(x["observed_seconds"] for x in printers)
    return {
        "days":days, "start":start, "end":now,
        "printer_count":len(printers),
        "printing_seconds":total_printing,
        "observed_seconds":total_observed,
        "capacity_seconds":len(printers)*capacity,
        "coverage_percent":round(100*total_observed/(len(printers)*capacity),1),
        "capacity_percent":round(100*total_printing/(len(printers)*capacity),1),
        "printers":printers
    }
