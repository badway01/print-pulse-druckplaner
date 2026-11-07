"""Filament statistics from confirmed print usage, empty-spool actions and receipts.

Never infer historical filament consumption from current stock or Etsy sales.
Every printed material/cost is an immutable snapshot at the time of user count.
"""
from collections import defaultdict
import datetime as dt
import math
import secrets
import time
from zoneinfo import ZoneInfo

TZ=ZoneInfo("Europe/Berlin")
DENSITIES={"PLA":1.24,"PETG":1.27,"ABS":1.04,"ASA":1.07,"TPU":1.21}
SPOOL_DIAMETER_MM=1.75

def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_filament_print_events(
      id TEXT PRIMARY KEY, file_id TEXT NOT NULL, has_complete_grams INTEGER NOT NULL,
      created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS pp_fprint_created ON pp_filament_print_events(created);
    CREATE TABLE IF NOT EXISTS pp_filament_used(
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL,
      filament_id INTEGER, brand TEXT NOT NULL, material TEXT NOT NULL,
      color TEXT NOT NULL, grams REAL NOT NULL CHECK(grams>0),
      spool_g REAL, spool_price_cents INTEGER, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS pp_fused_created ON pp_filament_used(created);
    CREATE INDEX IF NOT EXISTS pp_fused_event ON pp_filament_used(event_id);
    CREATE TABLE IF NOT EXISTS pp_filament_empty_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT, filament_id INTEGER NOT NULL,
      label TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS pp_fempty_created ON pp_filament_empty_events(created);
    """)

def record_print(db, file, estimate, created=None):
    """Log exactly one user-confirmed print of this 3MF with contemporaneous GLD.

    Log even incomplete records to expose missing coverage instead of
    presenting partial data as the whole history.
    """
    now=int(time.time()) if created is None else int(created)
    filaments=estimate.get("filaments") or []
    valid=[]
    for f in filaments:
        try:
            grams=float(f.get("grams"))
        except (TypeError,ValueError):
            continue
        if not math.isfinite(grams) or not 0<grams<=100000:continue
        fid=f.get("filament_id")
        row=db.execute("SELECT id,brand,material,color,spool_g,price_cents FROM filament_spools WHERE id=?",
                       (fid,)).fetchone() if type(fid) is int else None
        valid.append((int(row["id"]) if row else None,
                      str(row["brand"]) if row else "",
                      str(row["material"]) if row else str(f.get("name") or "Unbekannt")[:80],
                      str(row["color"]) if row else "",
                      grams,float(row["spool_g"] or 1000) if row else None,
                      row["price_cents"] if row else None))
    complete=bool(filaments) and len(valid)==len(filaments)
    event_id=secrets.token_hex(12)
    db.execute("INSERT INTO pp_filament_print_events(id,file_id,has_complete_grams,created) VALUES(?,?,?,?)",
               (event_id,str(file["id"]),int(complete),now))
    for fid,brand,material,color,grams,spool_g,price in valid:
        db.execute("""INSERT INTO pp_filament_used(
             event_id,filament_id,brand,material,color,grams,spool_g,spool_price_cents,created)
             VALUES(?,?,?,?,?,?,?,?,?)""",
             (event_id,fid,brand,material,color,grams,spool_g,price,now))
    return event_id

def record_empty(db, filament_id, created=None):
    """Call only after a successful physical 'empty spool' action, same transaction."""
    row=db.execute("SELECT brand,material,color FROM filament_spools WHERE id=?",
                   (filament_id,)).fetchone()
    if row is None:raise ValueError("Filamentfarbe nicht gefunden.")
    label=" · ".join(str(row[k]) for k in ("brand","material","color"))
    db.execute("INSERT INTO pp_filament_empty_events(filament_id,label,created) VALUES(?,?,?)",
               (filament_id,label,int(time.time()) if created is None else int(created)))

def _density(material):
    name=str(material or "").upper().replace(" ","")
    for key,density in DENSITIES.items():
        if name.startswith(key):return density
    return None

def _date(timestamp):
    return dt.datetime.fromtimestamp(timestamp,TZ)

def _period_start(period, now):
    day=now.replace(hour=0,minute=0,second=0,microsecond=0)
    if period=="week":return day-dt.timedelta(days=day.weekday())
    if period=="month":return day.replace(day=1)
    if period=="year":return day.replace(month=1,day=1)
    if period=="all":return None
    raise ValueError("Ungültiger Statistikzeitraum.")

def _bucket(date, grouping):
    if grouping=="week":
        iso=date.isocalendar()
        return f"{iso.year}-W{iso.week:02d}",f"KW {iso.week:02d}"
    if grouping=="month":return date.strftime("%Y-%m"),date.strftime("%m/%y")
    return str(date.year),str(date.year)

def summary(db, period="month", now=None):
    """Local-period dashboard. No inferred print history or price retrofits."""
    if period not in ("week","month","year","all"):
        raise ValueError("Ungültiger Statistikzeitraum.")
    now=now or dt.datetime.now(TZ)
    if now.tzinfo is None:now=now.replace(tzinfo=TZ)
    start=_period_start(period,now)
    since=int(start.timestamp()) if start else 0
    grouping={"week":"week","month":"month","year":"month","all":"year"}[period]
    used=[dict(row) for row in db.execute(
        "SELECT * FROM pp_filament_used WHERE created>=? ORDER BY created",(since,))]
    events=[dict(row) for row in db.execute(
        "SELECT * FROM pp_filament_print_events WHERE created>=?",(since,))]
    empty=[dict(row) for row in db.execute(
        "SELECT * FROM pp_filament_empty_events WHERE created>=?",(since,))]
    receipt_quick=[dict(row) for row in db.execute(
        "SELECT quantity,unit_price_cents,created FROM pp_filament_quick_receipts WHERE created>=?",(since,))]
    receipt_legacy=[dict(row) for row in db.execute(
        "SELECT quantity,cost_cents,created FROM pp_filament_cost_history WHERE created>=?",(since,))]
    total_g=0.;roll_eq=0.;known_meter=0.;missing_meter_g=0.
    known_cost=0.;missing_price_g=0.
    by_material=defaultdict(lambda:{"grams":0.,"cost_eur":0.,"unpriced":False})
    by_color=defaultdict(float)
    chart=defaultdict(float)
    for row in used:
        grams=float(row["grams"])
        total_g+=grams
        spool_g=row["spool_g"]
        if spool_g and spool_g>0:roll_eq+=grams/spool_g
        density=_density(row["material"])
        if density:
            # A 1.75 mm strand has cross-section pi*(0.0875 cm)^2.
            grams_per_meter=math.pi*(SPOOL_DIAMETER_MM/20)**2*100*density
            known_meter+=grams/grams_per_meter
        else:missing_meter_g+=grams
        price=row["spool_price_cents"]
        material=row["material"] or "Unbekannt"
        by_material[material]["grams"]+=grams
        label=" · ".join(x for x in (row["brand"],material,row["color"]) if x)
        by_color[label or "Unbekannt"]+=grams
        if price is not None and spool_g and spool_g>0:
            cost=grams*price/(100*spool_g)
            known_cost+=cost
            by_material[material]["cost_eur"]+=cost
        else:
            missing_price_g+=grams
            by_material[material]["unpriced"]=True
        key,_=_bucket(_date(row["created"]),grouping)
        chart[key]+=grams
    purchases=receipt_quick+receipt_legacy
    purchase_rolls=sum(int(r["quantity"]) for r in purchases)
    purchase_spent=sum((r.get("unit_price_cents",0)*r["quantity"] if "unit_price_cents" in r
                        else r["cost_cents"] or 0) for r in purchases)
    unpriced_purchase=sum(int(r["quantity"]) for r in purchases
                          if "cost_cents" in r and r["cost_cents"] is None)
    # Full calendar buckets, even when an entire period has zero recorded prints.
    buckets=[]
    ref=now
    if grouping=="week":
        ref=now-dt.timedelta(days=now.weekday())
        starts=[ref-dt.timedelta(weeks=k) for k in range(7,-1,-1)]
    elif grouping=="month":
        starts=[]
        for back in range(11,-1,-1):
            year=now.year+(now.month-1-back)//12
            month=(now.month-1-back)%12+1
            starts.append(now.replace(year=year,month=month,day=1))
    else:
        starts=[now.replace(year=now.year-back,month=1,day=1) for back in range(4,-1,-1)]
    for d in starts:
        key,label=_bucket(d,grouping)
        buckets.append({"key":key,"label":label,"grams":round(chart[key],1)})
    known_grams=total_g-missing_meter_g
    return {
      "period":period,"since":since,"generated_at":int(now.timestamp()),
      "printed_grams":round(total_g,2),
      "roll_equivalents":round(roll_eq,2),
      "meters_estimate":round(known_meter,1) if known_grams>0 else None,
      "meters_coverage_grams":round(known_grams,2),
      "missing_meter_grams":round(missing_meter_g,2),
      "material_cost_eur":round(known_cost,2) if total_g and not missing_price_g else None,
      "known_material_cost_eur":round(known_cost,2),
      "unpriced_grams":round(missing_price_g,2),
      "empty_rolls":len(empty),"recorded_prints":len(events),
      "incomplete_prints":sum(not row["has_complete_grams"] for row in events),
      "purchased_rolls":purchase_rolls,
      "purchase_spend_eur":round(purchase_spent/100,2) if not unpriced_purchase else None,
      "known_purchase_spend_eur":round(purchase_spent/100,2),
      "unpriced_purchase_rolls":unpriced_purchase,
      "by_material":[{"name":name,"grams":round(s["grams"],1),
                       "cost_eur":round(s["cost_eur"],2) if not s["unpriced"] else None}
                     for name,s in sorted(by_material.items(),key=lambda kv:-kv[1]["grams"])[:8]],
      "top_colors":[{"name":k,"grams":round(v,1)}
                    for k,v in sorted(by_color.items(),key=lambda kv:-kv[1])[:5]],
      "chart":buckets,
      "note":"Dokumentierte Drucke und Leerbuchungen ab Aktivierung dieser Statistik; keine rückwirkend geschätzten Altbestände.",
    }
