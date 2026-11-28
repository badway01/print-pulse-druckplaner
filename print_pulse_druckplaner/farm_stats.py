"""Conservative, persistent, 24/7 production-time analytics for the HA add-on.

Only observed HA sensor intervals are measured. Gaps and unconfigured printers
are never silently treated as idle; manual runs are clearly identified.
"""
import time
import json
import math
import datetime as dt
from zoneinfo import ZoneInfo

PRINTERS = ("H2D", "H2D No2", "P1S Old", "P1S New", "Snapmaker U1", "X2D", "A1", "A1 mini", "Prusa MK4")
# Only the production printers count toward fleet statistics.
# The two manual printers and their existing history remain intact. A1 is HA-monitored.
PRODUCTION_PRINTERS = ("H2D", "H2D No2", "P1S Old", "P1S New", "Snapmaker U1", "X2D", "A1")
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
    CREATE TABLE IF NOT EXISTS pp_farm_energy_config(
      printer TEXT PRIMARY KEY, entity TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_farm_energy_last(
      printer TEXT PRIMARY KEY, entity TEXT NOT NULL, at INTEGER NOT NULL, kwh REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS pp_farm_energy_daily(
      printer TEXT NOT NULL, day TEXT NOT NULL, kwh REAL NOT NULL, samples INTEGER NOT NULL,
      PRIMARY KEY(printer,day));
    """)


def energy_value(state):
    """Read only cumulative HA energy sensors, never instantaneous power."""
    if not isinstance(state,dict): return None
    attrs=state.get('attributes') or {}
    if attrs.get('device_class')!='energy' or attrs.get('state_class') not in ('total','total_increasing'):
        return None
    unit=attrs.get('unit_of_measurement')
    try: value=float(state.get('state'))
    except (TypeError,ValueError): return None
    if not math.isfinite(value) or value<0 or unit not in ('Wh','kWh'): return None
    return value/1000 if unit=='Wh' else value


def record_energy(db,states,now=None):
    now=int(time.time() if now is None else now)
    tz=ZoneInfo('Europe/Berlin')
    day=dt.datetime.fromtimestamp(now,tz).date().isoformat()
    for row in db.execute('SELECT printer,entity FROM pp_farm_energy_config').fetchall():
        printer,entity=row['printer'],row['entity']
        value=energy_value(states.get(entity))
        if value is None: continue
        old=db.execute('SELECT * FROM pp_farm_energy_last WHERE printer=?',(printer,)).fetchone()
        if old and old['entity']==entity and old['at']<now and value>=old['kwh']:
            # Never invent an allocation across a calendar-day boundary.
            if dt.datetime.fromtimestamp(old['at'],tz).date().isoformat()==day:
                db.execute("""INSERT INTO pp_farm_energy_daily VALUES(?,?,?,1)
                    ON CONFLICT(printer,day) DO UPDATE SET kwh=kwh+excluded.kwh,samples=samples+1""",
                    (printer,day,value-old['kwh']))
        db.execute("""INSERT INTO pp_farm_energy_last VALUES(?,?,?,?) ON CONFLICT(printer)
            DO UPDATE SET entity=excluded.entity,at=excluded.at,kwh=excluded.kwh""",(printer,entity,now,value))


def energy_summary(db,since):
    day=dt.datetime.fromtimestamp(max(0,since),ZoneInfo('Europe/Berlin')).date().isoformat()
    rows=db.execute('SELECT printer,SUM(kwh) AS kwh,SUM(samples) AS samples FROM pp_farm_energy_daily WHERE day>=? GROUP BY printer',(day,))
    return {r['printer']:{'kwh':round(r['kwh'],3),'samples':r['samples']} for r in rows}


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


def summary(db, days=7, now=None, since=None):
    """Rolling window; separate 24h capacity from actually observed coverage."""
    if since is None and days not in (1,7,30):
        raise ValueError("Ungültiger Zeitraum.")
    now=int(time.time() if now is None else now)
    start=now-days*86400 if since is None else max(int(since),now-RETENTION_DAYS*86400)
    capacity=max(1,now-start)
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


# Measured electricity per completed print. Independent of the existing
# minute-based utilization and daily energy counters.
JOB_TZ = ZoneInfo('Europe/Berlin')
JOB_ACTIVE = {'preparing','printing','paused'}
JOB_BASELINE = {'idle','finished'}
JOB_MAX_GAP = 90
TARIFF_KEY = 'print_energy_tariffs'
TARIFF_DATES = ('2026-01-01','2027-01-01')

def valid_rate(value):
    try:
        if isinstance(value,bool):return None
        n=float(value)
        return n if math.isfinite(n) and 0<=n<=10 else None
    except (ValueError,TypeError,OverflowError):
        return None

def job_tariffs(db,cfg):
    try:
        raw=json.loads(cfg(db,TARIFF_KEY,''))
        if isinstance(raw,list) and len(raw)==2 and all(
            isinstance(x,dict) and x.get('from')==day and valid_rate(x.get('rate')) is not None
            for x,day in zip(raw,TARIFF_DATES)):
            return [{'from':x['from'],'rate':valid_rate(x['rate'])} for x in raw]
    except (ValueError,TypeError):
        pass
    old=valid_rate(cfg(db,'farm_energy_tariff',''))
    return [{'from':TARIFF_DATES[0],'rate':old if old is not None else .39},
            {'from':TARIFF_DATES[1],'rate':.2879}]

def rate_at(tariffs,at):
    day=dt.datetime.fromtimestamp(at,JOB_TZ).date().isoformat()
    return next((x['rate'] for x in reversed(tariffs) if x['from']<=day),None)

def save_job_tariffs(db,cfg,put_cfg,values):
    if not isinstance(values,list) or len(values)!=2:
        raise ValueError('Zwei Stromtarife erforderlich.')
    result=[]
    for day,item in zip(TARIFF_DATES,values):
        if not isinstance(item,dict) or item.get('from')!=day or valid_rate(item.get('rate')) is None:
            raise ValueError('Strompreis muss zwischen 0 und 10 €/kWh liegen.')
        result.append({'from':day,'rate':round(valid_rate(item['rate']),6)})
    put_cfg(db,TARIFF_KEY,json.dumps(result,separators=(',',':')))
    return result

def tariff_segments(tariffs,start,end,kwh):
    """Split a counter delta across a tariff boundary by elapsed time."""
    if end<=start:return []
    boundaries=[start]+[int(dt.datetime.fromisoformat(x['from']).replace(tzinfo=JOB_TZ).timestamp())
        for x in tariffs if start<int(dt.datetime.fromisoformat(x['from']).replace(tzinfo=JOB_TZ).timestamp())<end]+[end]
    return [(rate_at(tariffs,a),kwh*(b-a)/(end-start)) for a,b in zip(boundaries,boundaries[1:])]

def ensure_jobs(db):
    db.execute("""CREATE TABLE IF NOT EXISTS pp_print_energy_tracker(
        device_key TEXT PRIMARY KEY, entity TEXT NOT NULL, printer TEXT NOT NULL,
        at INTEGER NOT NULL, state TEXT NOT NULL, counter REAL,
        started INTEGER, valid INTEGER NOT NULL, job TEXT NOT NULL,
        kwh REAL NOT NULL, cost REAL NOT NULL, rates TEXT NOT NULL, split INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS pp_print_energy_jobs(
        id INTEGER PRIMARY KEY AUTOINCREMENT, device_key TEXT NOT NULL, printer TEXT NOT NULL,
        started INTEGER NOT NULL, ended INTEGER NOT NULL, job TEXT NOT NULL,
        kwh REAL, cost REAL, rates TEXT NOT NULL, split INTEGER NOT NULL, complete INTEGER NOT NULL)""")
    db.execute("CREATE INDEX IF NOT EXISTS pp_print_energy_latest ON pp_print_energy_jobs(device_key,ended,id)")
    db.execute("CREATE INDEX IF NOT EXISTS pp_print_energy_end ON pp_print_energy_jobs(ended)")

def record_print_energy(db,devices,states,tariffs,now=None):
    """Track only observed transitions and cumulative energy from the same meter.
    Incomplete or ambiguous runs never acquire a fabricated electricity cost.
    """
    now=int(time.time() if now is None else now)
    ensure_jobs(db)
    selected=[d for d in devices if d.get('kind')=='printer' and d.get('history_key') and d.get('entity')]
    seen=set()
    counts={}
    for d in devices:
        meter=d.get('energy_entity') or ''
        counts[meter]=counts.get(meter,0)+1
    for d in selected:
        key=d['history_key'];seen.add(key)
        meter=d.get('energy_entity') or ''
        state=d.get('printer_state') or 'unknown'
        if d.get('switch_state')=='off':state='offline'
        counter=energy_value(states.get(meter)) if meter and counts[meter]==1 else None
        name=d['name'];filename=str(d.get('job_name') or '')[:180]
        old=db.execute('SELECT * FROM pp_print_energy_tracker WHERE device_key=?',(key,)).fetchone()
        if old and now<=old['at']:continue
        started=old['started'] if old else None
        valid=bool(old['valid']) if old else False
        kwh=float(old['kwh']) if old else 0.
        cost=float(old['cost']) if old else 0.
        rates=json.loads(old['rates']) if old else {}
        split=bool(old['split']) if old else False
        job=old['job'] if old else ''
        consecutive=bool(old and 0<now-old['at']<=JOB_MAX_GAP and meter==old['entity']
            and counter is not None and old['counter'] is not None and counter>=old['counter'])
        active=state in JOB_ACTIVE
        if active and started is None:
            # First active sample after a confirmed idle/finished baseline.
            valid=bool(consecutive and old['state'] in JOB_BASELINE)
            started=old['at'] if valid else now
            kwh=cost=0.;rates={};split=False;job=filename
        if started is not None:
            if active or state=='finished':
                if not consecutive:valid=False
                # Filenames may change during preparation; once actually printing,
                # a different nonempty filename indicates an ambiguous job boundary.
                if active and old and old['state'] in ('printing','paused') and job and filename and filename!=job:
                    valid=False
                if filename and (not job or (old and old['state']=='preparing')):job=filename
                if valid:
                    delta=counter-old['counter']
                    segments=tariff_segments(tariffs,old['at'],now,delta)
                    if not segments or any(rate is None for rate,_ in segments):
                        valid=False
                    else:
                        kwh+=delta
                        split=split or len(segments)>1
                        for rate,amount in segments:
                            cost+=rate*amount
                            label=str(rate)
                            rates[label]=rates.get(label,0.)+amount
                if state=='finished':
                    db.execute("""INSERT INTO pp_print_energy_jobs
                        (device_key,printer,started,ended,job,kwh,cost,rates,split,complete)
                        VALUES(?,?,?,?,?,?,?,?,?,?)""",
                        (key,name,started,now,job,kwh if valid else None,cost if valid else None,
                         json.dumps(rates if valid else {}),int(split),int(valid)))
                    started=None
            elif state in ('error','idle'):
                # Aborted or unconfirmed completion: no successful job record.
                started=None
            else:
                valid=False
        if started is None:
            valid=False;kwh=cost=0.;rates={};split=False;job=''
        db.execute("""INSERT INTO pp_print_energy_tracker VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(device_key) DO UPDATE SET entity=excluded.entity,printer=excluded.printer,
            at=excluded.at,state=excluded.state,counter=excluded.counter,started=excluded.started,
            valid=excluded.valid,job=excluded.job,kwh=excluded.kwh,cost=excluded.cost,
            rates=excluded.rates,split=excluded.split""",
            (key,meter,name,now,state,counter,started,int(valid),job,kwh,cost,json.dumps(rates),int(split)))
    # Removed devices cannot silently resume an in-flight measurement.
    for row in db.execute('SELECT device_key FROM pp_print_energy_tracker WHERE started IS NOT NULL').fetchall():
        if row['device_key'] not in seen:
            db.execute("UPDATE pp_print_energy_tracker SET valid=0,state='unknown' WHERE device_key=?",(row['device_key'],))

def last_print_energy(db,key):
    ensure_jobs(db)
    row=db.execute("""SELECT * FROM pp_print_energy_jobs WHERE device_key=?
        ORDER BY ended DESC,id DESC LIMIT 1""",(key,)).fetchone()
    if not row:return None
    item=dict(row);item['rates']=json.loads(item['rates']);item['complete']=bool(item['complete'])
    item['split']=bool(item['split']);return item

def print_energy_summary(db,now=None):
    ensure_jobs(db)
    now=int(time.time() if now is None else now)
    date=dt.datetime.fromtimestamp(now,JOB_TZ).date()
    result={}
    for label,day in [('today',date),('week',date-dt.timedelta(days=date.weekday())),('month',date.replace(day=1))]:
        start=int(dt.datetime.combine(day,dt.time.min,JOB_TZ).timestamp())
        row=db.execute("""SELECT SUM(cost) cost,COUNT(cost) measured,COUNT(*) total
            FROM pp_print_energy_jobs WHERE ended>=? AND ended<=?""",(start,now)).fetchone()
        result[label]={'cost':row['cost'],'measured':row['measured'],'total':row['total']}
    return result
