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

    def test_24h_average_is_real_observed_current_and_survives_peak_reset(self):
        first = self.snapshot(100., 200., 1.25, 2.75)  # 4.0 A total
        monitor.record_sample(self.db, first, now=self.now)
        mean = monitor.average_amps_24h(self.db, now=self.now + 1)
        self.assertEqual(mean["amps"], 4.0)
        self.assertEqual(mean["samples"], 1)
        # Partially unavailable: no misleading zeros or W/230 fallbacks.
        unavailable = self.snapshot(80., 90., 0.4, 0.6)
        unavailable["devices"][1]["amps_source"] = "calculated"
        monitor.record_sample(self.db, unavailable, now=self.now + 15)
        mean = monitor.average_amps_24h(self.db, now=self.now + 16)
        self.assertEqual(mean["amps"], 4.0)
        self.assertEqual(mean["samples"], 1)
        second = self.snapshot(90., 120., 2.0, 4.0)  # 6.0 A
        monitor.record_sample(self.db, second, now=self.now + 30)
        mean = monitor.average_amps_24h(self.db, now=self.now + 31)
        self.assertEqual(mean["amps"], 5.0)
        self.assertEqual(mean["samples"], 2)
        monitor.reset_all_amperes(self.db, second["devices"], now=self.now + 33)
        self.assertEqual(monitor.average_amps_24h(self.db, now=self.now + 34), mean)
        # A new measurement after reset belongs to the average, regardless of peak reset.
        third = self.snapshot(50., 50., 0.5, 1.5)  # 2.0 A
        monitor.record_sample(self.db, third, now=self.now + 45)
        self.assertEqual(monitor.average_amps_24h(self.db, now=self.now + 46)["amps"], 4.0)

    def test_24h_average_migrates_existing_watt_history(self):
        # Simulates v0.13.89 before the first 0.13.90 average-current sample.
        self.db.execute("""CREATE TABLE pp_power_history
            (at INTEGER PRIMARY KEY, watts REAL, measured INTEGER NOT NULL,
             expected INTEGER NOT NULL)""")
        self.db.execute("INSERT INTO pp_power_history VALUES (?,?,?,?)",
                        (self.now-60, 420., 2, 2))
        self.assertIsNone(monitor.average_amps_24h(self.db, now=self.now))
        snapshot = self.snapshot(200., 100., 1.0, 1.0)
        monitor.record_sample(self.db, snapshot, now=self.now)
        mean = monitor.average_amps_24h(self.db, now=self.now)
        self.assertEqual(mean["samples"], 1)
        self.assertEqual(mean["amps"], 2.0)
        before = self.db.execute("SELECT watts FROM pp_power_history WHERE at=?",
                                 (self.now-60,)).fetchone()
        self.assertEqual(before["watts"], 420.)

    def test_history_includes_real_amps_and_keeps_missing_samples(self):
        first = self.snapshot(100., 200., 1.25, 2.75)
        monitor.record_sample(self.db, first, now=self.now)
        missing = self.snapshot(80., 90., 0.4, 0.6)
        missing["devices"][1]["amps_source"] = "calculated"
        monitor.record_sample(self.db, missing, now=self.now+15)
        monitor.record_sample(self.db, self.snapshot(0.,0.,0.,0.), now=self.now+30)
        for minutes in (15,60,180,1440):
            rows=monitor.history(self.db,minutes,now=self.now+31)
            self.assertEqual([r["watts"] for r in rows],[300.,170.,0.])
            self.assertEqual([r["amps"] for r in rows],[4.,None,0.])
            self.assertEqual([r["amps_observed"] for r in rows],[4.,.4,0.])
            self.assertEqual([r["amps_complete"] for r in rows],[True,False,True])
            self.assertEqual([r["amps_count"] for r in rows],[2,1,2])
        self.assertEqual(monitor.history(self.db,15,now=self.now-1),[])

    def test_partial_history_excludes_estimates_and_missing_devices(self):
        s=self.snapshot(100.,200.,.5,2.)
        s["devices"].append({"name":"Unzugeordnet","entity":"","amps":None,
                             "amps_source":"unavailable","watts":None})
        s["printers_total"]=3
        monitor.record_sample(self.db,s,now=self.now)
        row=monitor.history(self.db,15,now=self.now+1)[0]
        self.assertIsNone(row["amps"])
        self.assertEqual(row["amps_observed"],2.5)
        self.assertEqual((row["amps_count"],row["amps_expected"]),(2,3))
        self.assertFalse(row["amps_complete"])
        self.assertIsNone(monitor.average_amps_24h(self.db,now=self.now+1))

    def test_history_does_not_skip_short_peaks_in_24h(self):
        monitor.ensure_24h_current_column(self.db)
        self.db.executemany(
            "INSERT INTO pp_power_history(at,watts,measured,expected,amps) VALUES(?,?,?,?,?)",
            [(self.now+i*15, 900. if i==511 else 10.,2,2,4. if i==511 else .1)
             for i in range(1100)])
        rows=monitor.history(self.db,1440,now=self.now+1100*15)
        self.assertEqual(len(rows),1100)
        self.assertEqual(rows[511]["amps"],4.)
        self.assertEqual(rows[511]["watts"],900.)

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
