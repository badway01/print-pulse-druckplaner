"""Tests of real Druckfarm time buckets, HA gaps, manual runs and DST."""
import datetime as dt
import importlib.util
import sqlite3
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]/"print_pulse_druckplaner"
def load(name):
    spec=importlib.util.spec_from_file_location(name, ROOT/(name+".py"))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

history=load("farm_history")
farm=load("farm_stats")
BERLIN=ZoneInfo("Europe/Berlin")


def unix(year, month, day, hour=0, minute=0):
    return int(dt.datetime(year,month,day,hour,minute,tzinfo=BERLIN).timestamp())


class FarmHistoryTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        farm.schema(self.db)

    def tearDown(self):
        self.db.close()

    def interval(self, start, end, state="printing", printer="H2D"):
        self.db.execute("""INSERT INTO pp_farm_intervals
            (printer,started,ended,state) VALUES (?,?,?,?)""",
            (printer,start,end,state))

    def test_hourly_bucket_splits_at_hour(self):
        now=unix(2026,11,5,12,15)
        self.interval(unix(2026,11,5,10,50),unix(2026,11,5,11,10))
        result=history.history(self.db,"hourly","H2D",now)
        self.assertEqual(len(result["buckets"]),24)
        positive=[b for b in result["buckets"] if b["printing_seconds"]]
        self.assertEqual([b["printing_seconds"] for b in positive],[600,600])
        self.assertEqual(result["printing_seconds"],1200)
        self.assertEqual(result["observed_seconds"],1200)

    def test_daily_and_selected_printer(self):
        now=unix(2026,11,5,12)
        self.interval(unix(2026,11,4,23,30),unix(2026,11,5,0,30))
        self.interval(unix(2026,11,5,2),unix(2026,11,5,3),printer="P1S Old")
        single=history.history(self.db,"daily","H2D",now)
        positive=[b for b in single["buckets"] if b["printing_seconds"]]
        self.assertEqual([b["printing_seconds"] for b in positive],[1800,1800])
        self.assertEqual(single["printing_seconds"],3600)
        all_machines=history.history(self.db,"daily","all",now)
        self.assertEqual(all_machines["printing_seconds"],7200)
        self.assertEqual(all_machines["printer_count"],6)
        self.assertEqual(len(all_machines["buckets"][-1]["by_printer"]),6)

    def test_week_boundary_is_monday(self):
        now=unix(2026,11,5,12)
        self.interval(unix(2026,11,1,23,30),unix(2026,11,2,0,30))
        result=history.history(self.db,"weekly","H2D",now)
        positive=[b for b in result["buckets"] if b["printing_seconds"]]
        self.assertEqual([b["printing_seconds"] for b in positive],[1800,1800])
        self.assertTrue(all(b["label"].startswith("KW") for b in positive))

    def test_calendar_month_not_fixed_thirty_days(self):
        now=unix(2026,11,5,12)
        self.interval(unix(2026,10,31,23),unix(2026,11,1,1))
        result=history.history(self.db,"monthly","H2D",now)
        positive=[b for b in result["buckets"] if b["printing_seconds"]]
        self.assertEqual([b["printing_seconds"] for b in positive],[3600,3600])
        self.assertEqual(len(result["buckets"]),12)

    def test_manual_records_are_included_and_do_not_count_unknown_as_idle(self):
        now=unix(2026,11,5,12)
        self.db.execute("""INSERT INTO pp_farm_manual(printer,started,ended,outcome)
            VALUES (?,?,?,'success')""",
            ("A1 mini",unix(2026,11,5,10),unix(2026,11,5,11)))
        report=history.history(self.db,"daily","A1 mini",now)
        self.assertEqual(report["printing_seconds"],3600)
        self.assertEqual(report["observed_seconds"],3600)
        self.assertLess(report["buckets"][-1]["coverage_percent"],100)
        unknown=history.history(self.db,"daily","Prusa MK4",now)
        self.assertEqual(unknown["printing_seconds"],0)
        self.assertEqual(unknown["observed_seconds"],0)

    def test_daylight_savings_spring_and_autumn(self):
        now=unix(2026,3,30,12)
        march=history.history(self.db,"daily","H2D",now)
        spring=next(b for b in march["buckets"] if b["label"]=="29.03.")
        self.assertEqual(spring["capacity_seconds"],23*3600)
        now=unix(2026,10,26,12)
        autumn=history.history(self.db,"daily","H2D",now)
        fall=next(b for b in autumn["buckets"] if b["label"]=="25.10.")
        self.assertEqual(fall["capacity_seconds"],25*3600)

    def test_invalid_filters_are_rejected(self):
        with self.assertRaises(ValueError):
            history.history(self.db,"yearly")
        with self.assertRaises(ValueError):
            history.history(self.db,"daily","unknown-printer")


if __name__=="__main__":
    unittest.main()
