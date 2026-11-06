"""Regression tests for conservative HA-based Druckfarm uptime statistics."""
import importlib.util
import sqlite3
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner" / "farm_stats.py"
spec = importlib.util.spec_from_file_location("farm_stats", MODULE)
farm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(farm)


class FarmTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        farm.schema(self.db)

    def tearDown(self):
        self.db.close()

    def poll(self, name, state, t, configured=True):
        farm.record_poll(self.db, [{"id": name, "state": state,
                                    "configured": configured}], now=t)

    def item(self, now, days=1, name="H2D"):
        return next(x for x in farm.summary(self.db, days, now=now)["printers"]
                    if x["printer"] == name)

    def test_initial_reading_does_not_invent_history(self):
        self.poll("H2D", "printing", 10000)
        r = self.item(10000)
        self.assertEqual((r["printing_seconds"], r["observed_seconds"]), (0, 0))
        self.assertEqual(r["coverage_percent"], 0.0)

    def test_printing_and_idle_including_night_are_recorded(self):
        self.poll("H2D", "printing", 10000)
        self.poll("H2D", "printing", 10060)
        self.poll("H2D", "finished", 10120)
        self.poll("H2D", "idle", 10180)
        self.poll("H2D", "idle", 10240)
        r = self.item(10240)
        self.assertEqual(r["printing_seconds"], 120)
        self.assertEqual(r["idle_seconds"], 120)
        self.assertEqual(r["successes"], 1)
        # Consecutive same-state samples are merged, limiting database growth.
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM pp_farm_intervals").fetchone()[0], 3)

    def test_offline_gap_is_unknown_not_idle_or_printing(self):
        self.poll("H2D", "printing", 10000)
        self.poll("H2D", "printing", 10060)
        self.poll("H2D", "offline", 10120, configured=True)
        self.poll("H2D", "idle", 10200)
        self.poll("H2D", "idle", 10500)  # missed polls are not backfilled
        r = self.item(10500)
        self.assertEqual(r["printing_seconds"], 120)
        self.assertEqual(r["observed_seconds"], 120)

    def test_manual_timer_records_only_confirmed_print_duration(self):
        farm.manual_action(self.db, "A1 mini", "start", 10000)
        running = self.db.execute(
            "SELECT started,ended FROM pp_farm_manual WHERE printer='A1 mini'"
        ).fetchone()
        self.assertEqual((running["started"], running["ended"]), (10000, None))
        farm.manual_action(self.db, "A1 mini", "finish", 13600)
        saved = self.db.execute(
            "SELECT started,ended,outcome FROM pp_farm_manual WHERE printer='A1 mini'"
        ).fetchone()
        self.assertEqual((saved["ended"] - saved["started"], saved["outcome"]),
                         (3600, "success"))
        self.assertNotIn("A1 mini",
                         [x["printer"] for x in farm.summary(self.db, 1, now=14000)["printers"]])
        with self.assertRaises(ValueError):
            farm.manual_action(self.db, "A1 mini", "finish", 14100)

    def test_failed_manual_run_and_invalid_actions(self):
        farm.manual_action(self.db, "Prusa MK4", "start", 20000)
        farm.manual_action(self.db, "Prusa MK4", "failed", 20600)
        saved = self.db.execute(
            "SELECT outcome FROM pp_farm_manual WHERE printer='Prusa MK4'"
        ).fetchone()
        self.assertEqual(saved["outcome"], "failed")
        self.assertNotIn("Prusa MK4",
                         [x["printer"] for x in farm.summary(self.db, 1, now=20700)["printers"]])
        with self.assertRaises(ValueError):
            farm.manual_action(self.db, "H2D", "start", 20700)
        with self.assertRaises(ValueError):
            farm.manual_action(self.db, "Prusa MK4", "unknown", 20700)

    def test_production_kpis_exclude_manual_printers(self):
        start = 10000
        end = start + 60
        production = ("H2D", "P1S Old", "P1S New", "Snapmaker U1")
        for name in production:
            self.poll(name, "printing", start)
            self.poll(name, "printing", end)
        for name in ("A1 mini", "Prusa MK4"):
            farm.manual_action(self.db, name, "start", start)
            farm.manual_action(self.db, name, "finish", end)

        result = farm.summary(self.db, days=7, now=end)
        self.assertEqual([p["printer"] for p in result["printers"]], list(production))
        self.assertEqual(result["printer_count"], 4)
        self.assertEqual(result["capacity_seconds"], 4 * 7 * 24 * 3600)
        self.assertEqual(result["printing_seconds"], 4 * 60)
        self.assertEqual(result["observed_seconds"], 4 * 60)
        self.assertAlmostEqual(
            result["capacity_percent"],
            round(100 * (4 * 60) / (4 * 7 * 24 * 3600), 1)
        )
        self.assertAlmostEqual(
            result["coverage_percent"],
            round(100 * (4 * 60) / (4 * 7 * 24 * 3600), 1)
        )

    def test_capacity_for_each_period_uses_four_printers(self):
        for days in (1, 7, 30):
            result = farm.summary(self.db, days=days, now=20000)
            self.assertEqual(result["printer_count"], 4)
            self.assertEqual(result["capacity_seconds"], 4 * days * 24 * 3600)
            self.assertEqual(result["printing_seconds"], 0)

    def test_window_clips_old_intervals(self):
        t=10*86400
        self.poll("H2D", "printing", t-80)
        self.poll("H2D", "printing", t-20)
        self.poll("H2D", "idle", t+40)
        self.assertEqual(self.item(t+40)["printing_seconds"], 120)
        self.assertEqual(self.item(t+40,days=7)["printing_seconds"], 120)
        with self.assertRaises(ValueError):
            farm.summary(self.db, 365, now=t+40)


if __name__ == "__main__":
    unittest.main()
