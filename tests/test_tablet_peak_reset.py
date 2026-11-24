"""Regression: Max-A reset keeps permanent per-device history and CSV logs."""
import importlib.util
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner"


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + ".py"))
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


monitor = module("tablet_monitor")
history = module("tablet_history")


class PeakResetTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.now = 1763986000
        self.a = "sensor.shellyplugsg3_90706948a600_leistung"
        self.b = "sensor.shellyplugsg3_80b54e287eac_leistung"

    def tearDown(self):
        self.db.close()

    def snapshot(self, wa, wb, aa, ab):
        return {
            "watts": wa + wb, "amps": aa + ab,
            "printers_measured": 2, "printers_total": 2,
            "devices": [
                {"name": "H2D", "entity": self.a, "watts": wa,
                 "amps": aa, "amps_source": "shelly", "current_entity": "sensor.a"},
                {"name": "X2D", "entity": self.b, "watts": wb,
                 "amps": ab, "amps_source": "shelly", "current_entity": "sensor.b"},
            ]
        }

    def test_reset_preserves_history_and_watt_peak(self):
        first = self.snapshot(500., 250., 3.250, 1.600)
        monitor.record_sample(self.db, first, now=self.now)
        history.record_sample(self.db, first, now=self.now)
        old_watts = monitor.total_peak(self.db)
        self.assertEqual(old_watts["watts"], 750.)
        self.assertAlmostEqual(monitor.total_amps_peak(self.db)["amps"], 4.85)
        devices = first["devices"]
        result = monitor.reset_all_amperes(self.db, devices, now=self.now+2)
        self.assertTrue(result["ok"])
        self.assertEqual(result["reset_count"], 2)
        self.assertIsNone(monitor.total_amps_peak(self.db))
        self.assertNotIn(self.a, monitor.device_peaks(self.db))
        self.assertEqual(monitor.total_peak(self.db), old_watts)
        audit = monitor.peak_reset_history(self.db)
        self.assertEqual(len(audit), 3)
        self.assertEqual({x["name"] for x in audit},
                         {"H2D", "X2D", "Strompeak gesamt"})
        self.assertAlmostEqual(next(x["previous_amps"] for x in audit
                                    if x["name"] == "H2D"), 3.25)

        newer = self.snapshot(140., 90., 0.550, 0.410)
        monitor.record_sample(self.db, newer, now=self.now+15)
        history.record_sample(self.db, newer, now=self.now+15)
        self.assertAlmostEqual(monitor.device_peaks(self.db)[self.a]["max_amps"], 0.55)
        self.assertAlmostEqual(monitor.total_amps_peak(self.db)["amps"], 0.96)
        self.assertEqual(monitor.total_peak(self.db), old_watts)
        rows = history.collect(self.db, "day", now=self.now+30)
        h2d = next(x for x in rows if x["device_key"] == self.a)
        self.assertEqual(h2d["amps_max"], 3.25)  # original sample remains
        csv = history.export_csv(self.db, "day", now=self.now+30).decode("utf-8-sig")
        self.assertIn("Max-A-Reset", csv)
        self.assertIn("3,250", csv)
        self.assertIn("Strompeak gesamt", csv)
        self.assertIn("Messwerte", csv)

    def test_repeat_reset_keeps_first_audit(self):
        first = self.snapshot(200.,100.,0.8,0.6)
        monitor.record_sample(self.db,first,now=self.now)
        monitor.reset_all_amperes(self.db,first["devices"],now=self.now+2)
        second = self.snapshot(100.,100.,0.4,0.4)
        monitor.record_sample(self.db,second,now=self.now+20)
        monitor.reset_all_amperes(self.db,second["devices"],now=self.now+22)
        logs = monitor.peak_reset_history(self.db)
        self.assertEqual(len(logs),6)
        self.assertEqual(len({x["batch_id"] for x in logs}),2)
        self.assertEqual(sum(x["scope"]=="overall" for x in logs),2)


if __name__ == "__main__":
    unittest.main()
