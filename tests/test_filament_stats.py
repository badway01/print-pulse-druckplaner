"""Consumption statistics: real timestamps and immutable GLD snapshots."""
import datetime as dt
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

MODULE=Path(__file__).resolve().parents[1]/"print_pulse_druckplaner"/"filament_stats.py"
spec=importlib.util.spec_from_file_location("pp_filament_stats_test",MODULE)
stats=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stats)
TZ=ZoneInfo("Europe/Berlin")

class FilamentStatsTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.executescript("""
        CREATE TABLE filament_spools(
          id INTEGER PRIMARY KEY,brand TEXT,material TEXT,color TEXT,
          spool_g REAL,price_cents INTEGER);
        CREATE TABLE pp_filament_quick_receipts(
          quantity INTEGER,unit_price_cents INTEGER,created INTEGER);
        CREATE TABLE pp_filament_cost_history(
          quantity INTEGER,cost_cents INTEGER,created INTEGER);
        INSERT INTO filament_spools VALUES (1,'Bambu Lab','PLA Basic','Schwarz',1000,1450);
        INSERT INTO filament_spools VALUES (2,'Bambu Lab','PETG','Weiß',1000,1600);
        """)
        stats.schema(self.db)
        stats.schema(self.db)  # idempotent with existing DB contents
        self.now=dt.datetime(2026,11,7,10,30,tzinfo=TZ)
        self.ts=int(self.now.timestamp())
        self.last_month=int(dt.datetime(2026,10,10,10,tzinfo=TZ).timestamp())

    def tearDown(self):
        self.db.close()

    def test_print_grams_meter_roll_equivalence_and_gld_snapshot(self):
        file={"id":"a"*24}
        stats.record_print(self.db,file,{"filaments":[
            {"filament_id":1,"grams":100.0,"name":"PLA Basic Schwarz"}]},created=self.ts)
        # A newer booking changes today's GLD but never past material spend.
        self.db.execute("UPDATE filament_spools SET price_cents=1700 WHERE id=1")
        stats.record_print(self.db,file,{"filaments":[
            {"filament_id":1,"grams":100.0,"name":"PLA Basic Schwarz"}]},created=self.ts+60)
        out=stats.summary(self.db,"week",self.now)
        self.assertEqual(out["recorded_prints"],2)
        self.assertEqual(out["printed_grams"],200.0)
        self.assertEqual(out["roll_equivalents"],0.2)
        self.assertEqual(out["material_cost_eur"],3.15)  # 1.45 + 1.70
        self.assertGreater(out["meters_estimate"],60)
        self.assertLess(out["meters_estimate"],70)
        self.assertEqual(out["empty_rolls"],0)
        self.assertEqual(out["incomplete_prints"],0)
        self.assertEqual(len(out["chart"]),8)

    def test_empty_rolls_and_purchases_are_separate_from_print_consumption(self):
        stats.record_empty(self.db,1,created=self.ts)
        stats.record_empty(self.db,2,created=self.last_month)
        self.db.execute("INSERT INTO pp_filament_quick_receipts VALUES(?,?,?)",(3,1290,self.ts))
        self.db.execute("INSERT INTO pp_filament_cost_history VALUES(?,?,?)",(2,2780,self.ts))
        month=stats.summary(self.db,"month",self.now)
        self.assertEqual(month["empty_rolls"],1)
        self.assertEqual(month["recorded_prints"],0)
        self.assertEqual(month["printed_grams"],0)
        self.assertEqual(month["purchased_rolls"],5)
        self.assertEqual(month["purchase_spend_eur"],66.5)
        year=stats.summary(self.db,"year",self.now)
        self.assertEqual(year["empty_rolls"],2)
        self.assertEqual(len(year["chart"]),12)
        total=stats.summary(self.db,"all",self.now)
        self.assertEqual(total["empty_rolls"],2)
        self.assertEqual(len(total["chart"]),5)

    def test_incomplete_and_unknown_filaments_are_not_assigned_an_invented_price(self):
        stats.record_print(self.db,{"id":"b"*24},{"filaments":[
            {"filament_id":None,"name":"Unbekannt","grams":50},
            {"filament_id":2,"name":"PETG Weiß","grams":None}
        ]},created=self.ts)
        out=stats.summary(self.db,"month",self.now)
        self.assertEqual(out["recorded_prints"],1)
        self.assertEqual(out["incomplete_prints"],1)
        self.assertEqual(out["printed_grams"],50)
        self.assertEqual(out["unpriced_grams"],50)
        self.assertIsNone(out["material_cost_eur"])
        self.assertIsNone(out["meters_estimate"])
        self.assertEqual(out["missing_meter_grams"],50)

    def test_no_backfilled_fake_print_history_and_invalid_period(self):
        out=stats.summary(self.db,"month",self.now)
        self.assertEqual(out["recorded_prints"],0)
        self.assertEqual(out["printed_grams"],0)
        self.assertEqual(out["empty_rolls"],0)
        with self.assertRaises(ValueError):
            stats.summary(self.db,"yesterday",self.now)

if __name__=="__main__":
    unittest.main()
