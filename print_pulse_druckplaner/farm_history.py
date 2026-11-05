"""Time-bucketed Druckfarm history for Home Assistant, Europe/Berlin timezone.

All values are based on stored HA observation intervals or explicitly logged
manual printing. Missing sensor time is never inferred as idle or printing.
"""
import datetime as dt
import time
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")
GROUPS = ("hourly", "daily", "weekly", "monthly")
PRINTERS = ("H2D", "P1S Old", "P1S New", "Snapmaker U1", "A1 mini", "Prusa MK4")
COUNTS = {"hourly": 24, "daily": 14, "weekly": 12, "monthly": 12}


def _month_start(year, month):
    return dt.datetime(year, month, 1, tzinfo=BERLIN)


def _time_boundaries(group, now):
    """Return consecutive boundaries in Unix seconds; include current bucket."""
    instant = dt.datetime.fromtimestamp(now, BERLIN)
    count = COUNTS[group]
    if group == "hourly":
        # 24 actual elapsed hours even on DST shift. Labels carry a date and zone.
        end = int(now // 3600 * 3600) + 3600
        return [end - (count-i)*3600 for i in range(count+1)]
    if group == "daily":
        today = instant.date()
        days = [today - dt.timedelta(days=count-1-i) for i in range(count+1)]
        return [int(dt.datetime.combine(day, dt.time.min, BERLIN).timestamp()) for day in days]
    if group == "weekly":
        monday = instant.date() - dt.timedelta(days=instant.weekday())
        dates = [monday - dt.timedelta(weeks=count-1-i) for i in range(count+1)]
        return [int(dt.datetime.combine(day, dt.time.min, BERLIN).timestamp()) for day in dates]
    # calendar-month windows, not fixed 30-day approximations
    month_base = instant.year * 12 + instant.month - 1
    dates = []
    for i in range(count+1):
        month_index = month_base - count + 1 + i
        dates.append(int(_month_start(month_index//12,month_index%12+1).timestamp()))
    return dates


def _label(group, timestamp):
    local = dt.datetime.fromtimestamp(timestamp, BERLIN)
    if group == "hourly":
        return local.strftime("%H Uhr")
    if group == "daily":
        return local.strftime("%d.%m.")
    if group == "weekly":
        return f"KW {local.isocalendar().week:02d}"
    return local.strftime("%b %Y")


def history(db, group="daily", printer="all", now=None):
    if group not in GROUPS:
        raise ValueError("Unbekannte Zeitauflösung.")
    if printer not in ("all", *PRINTERS):
        raise ValueError("Drucker unbekannt.")
    now = int(time.time() if now is None else now)
    limits = _time_boundaries(group, now)
    machines = [printer] if printer != "all" else list(PRINTERS)
    start = limits[0]
    count = len(machines)
    bins = []
    for i in range(len(limits)-1):
        a,b = limits[i:i+2]
        duration = max(0, min(now,b)-a)
        bins.append({
            "start":a,"end":b,
            "label":_label(group,a),"printing_seconds":0,
            "observed_seconds":0,
            "capacity_seconds":duration*count
        })

    # Fetch only necessary 24h/14d/12w/12m history.
    if printer=="all":
        rows=db.execute("""SELECT started,ended,state FROM pp_farm_intervals
            WHERE ended>? AND started<?""", (start,now))
        manual=db.execute("""SELECT started,ended FROM pp_farm_manual
            WHERE started<? AND (ended IS NULL OR ended>?)""", (now,start))
    else:
        rows=db.execute("""SELECT started,ended,state FROM pp_farm_intervals
            WHERE printer=? AND ended>? AND started<?""",(printer,start,now))
        manual=db.execute("""SELECT started,ended FROM pp_farm_manual
            WHERE printer=? AND started<? AND (ended IS NULL OR ended>?)""",(printer,now,start))

    def add_interval(started, ended, is_printing, observed=True):
        a = max(start,int(started))
        b = min(now,int(ended))
        if b<=a:return
        for i, bucket in enumerate(bins):
            if limits[i]>=b:break
            if limits[i+1]<=a:continue
            seconds=max(0,min(b,limits[i+1])-max(a,limits[i]))
            if observed:bucket["observed_seconds"]+=seconds
            if is_printing:bucket["printing_seconds"]+=seconds

    for r in rows:
        add_interval(r["started"],r["ended"],r["state"]=="printing")
    for r in manual:
        add_interval(r["started"],now if r["ended"] is None else r["ended"],True)
    for item in bins:
        item["printing_seconds"]=min(item["capacity_seconds"],item["printing_seconds"])
        item["observed_seconds"]=min(item["capacity_seconds"],item["observed_seconds"])
        cap=item["capacity_seconds"]
        item["utilization_percent"]=round(100*item["printing_seconds"]/cap,1) if cap else 0
        item["coverage_percent"]=round(100*item["observed_seconds"]/cap,1) if cap else 0
    return {
        "group":group,"printer":printer,"start":start,"end":now,
        "printer_count":count,"buckets":bins,
        "printing_seconds":sum(x["printing_seconds"] for x in bins),
        "capacity_seconds":sum(x["capacity_seconds"] for x in bins),
        "observed_seconds":sum(x["observed_seconds"] for x in bins)
    }
