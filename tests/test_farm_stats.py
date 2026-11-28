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
        production = farm.PRODUCTION_PRINTERS
        for name in production:
            self.poll(name, "printing", start)
            self.poll(name, "printing", end)
        for name in ("A1 mini", "Prusa MK4"):
            farm.manual_action(self.db, name, "start", start)
            farm.manual_action(self.db, name, "finish", end)

        result = farm.summary(self.db, days=7, now=end)
        self.assertEqual([p["printer"] for p in result["printers"]], list(production))
        self.assertEqual(result["printer_count"], len(farm.PRODUCTION_PRINTERS))
        self.assertEqual(result["capacity_seconds"], len(farm.PRODUCTION_PRINTERS) * 7 * 24 * 3600)
        self.assertEqual(result["printing_seconds"], len(farm.PRODUCTION_PRINTERS) * 60)
        self.assertEqual(result["observed_seconds"], len(farm.PRODUCTION_PRINTERS) * 60)
        self.assertAlmostEqual(
            result["capacity_percent"],
            round(100 * (len(farm.PRODUCTION_PRINTERS) * 60) / (len(farm.PRODUCTION_PRINTERS) * 7 * 24 * 3600), 1)
        )
        self.assertAlmostEqual(
            result["coverage_percent"],
            round(100 * (len(farm.PRODUCTION_PRINTERS) * 60) / (len(farm.PRODUCTION_PRINTERS) * 7 * 24 * 3600), 1)
        )

    def test_capacity_for_each_period_uses_five_printers(self):
        for days in (1, 7, 30):
            result = farm.summary(self.db, days=days, now=20000)
            self.assertEqual(result["printer_count"], len(farm.PRODUCTION_PRINTERS))
            self.assertEqual(result["capacity_seconds"], len(farm.PRODUCTION_PRINTERS) * days * 24 * 3600)
            self.assertEqual(result["printing_seconds"], 0)

    def test_energy_measures_delta_and_skips_reset(self):
        self.db.execute("INSERT INTO pp_farm_energy_config VALUES('H2D','sensor.energy')")
        def sample(value,at):
            farm.record_energy(self.db,{'sensor.energy':{'state':str(value),'attributes':{
                'device_class':'energy','state_class':'total_increasing','unit_of_measurement':'kWh'}}},now=at)
        sample(100,10000)
        sample(100.5,10060)
        sample(0,10120)
        sample(0.25,10180)
        result=farm.energy_summary(self.db,0)
        self.assertEqual(result['H2D']['kwh'],0.75)
        self.assertNotIn('X2D',result)

    def test_window_clips_old_intervals(self):
        t=10*86400
        self.poll("H2D", "printing", t-80)
        self.poll("H2D", "printing", t-20)
        self.poll("H2D", "idle", t+40)
        self.assertEqual(self.item(t+40)["printing_seconds"], 120)
        self.assertEqual(self.item(t+40,days=7)["printing_seconds"], 120)
        with self.assertRaises(ValueError):
            farm.summary(self.db, 365, now=t+40)




class PrintEnergyJobTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.row_factory=sqlite3.Row
        self.tariffs=[{'from':'2026-01-01','rate':.39},{'from':'2027-01-01','rate':.2879}]
        self.at=1795900000
    def sample(self,state,value,offset,entity='sensor.energy',name='job'):
        d={'name':'Printer','kind':'printer','entity':'sensor.power','history_key':'sensor.power',
           'printer_state':state,'energy_entity':entity,'job_name':name}
        s={entity:{'state':str(value),'attributes':{'device_class':'energy','state_class':'total_increasing','unit_of_measurement':'kWh'}}}
        farm.record_print_energy(self.db,[d],s,self.tariffs,self.at+offset)
    def test_complete_and_no_double_count(self):
        self.sample('idle',10,0)
        self.sample('preparing',10.1,15)
        self.sample('printing',10.2,30)
        self.sample('paused',10.3,45)
        self.sample('finished',10.4,60)
        self.sample('finished',10.5,75)
        r=farm.last_print_energy(self.db,'sensor.power')
        self.assertTrue(r['complete'])
        self.assertAlmostEqual(r['kwh'],.4)
        self.assertAlmostEqual(r['cost'],.156)
        self.assertEqual(self.db.execute('SELECT count(*) FROM pp_print_energy_jobs').fetchone()[0],1)
    def test_missing_start_and_gap(self):
        self.sample('printing',10,0)
        self.sample('finished',11,15)
        self.assertIsNone(farm.last_print_energy(self.db,'sensor.power')['cost'])
        self.sample('preparing',11.1,30)
        self.sample('finished',11.2,150)
        self.assertFalse(farm.last_print_energy(self.db,'sensor.power')['complete'])
    def test_counter_reset(self):
        self.sample('idle',10,0)
        self.sample('printing',10.1,15)
        self.sample('finished',.1,30)
        self.assertIsNone(farm.last_print_energy(self.db,'sensor.power')['cost'])
    def test_tariff_boundary(self):
        import datetime as dt
        from zoneinfo import ZoneInfo
        at=int(dt.datetime(2027,1,1,tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
        s=farm.tariff_segments(self.tariffs,at-10,at+10,.2)
        self.assertEqual(s,[(.39,.1),(.2879,.1)])

    def test_abort_does_not_replace_last_success(self):
        self.sample('idle',10,0)
        self.sample('printing',10.1,15)
        self.sample('finished',10.2,30)
        self.sample('preparing',10.3,45)
        self.sample('error',10.4,60)
        r=farm.last_print_energy(self.db,'sensor.power')
        self.assertEqual(r['ended'],self.at+30)
    def test_meter_change(self):
        self.sample('idle',10,0)
        self.sample('printing',10.1,15)
        self.sample('finished',20,30,entity='sensor.changed')
        self.assertIsNone(farm.last_print_energy(self.db,'sensor.power')['cost'])
    def test_summary_and_tariff_snapshot(self):
        self.sample('idle',10,0)
        self.sample('printing',10.1,15)
        self.sample('finished',10.2,30)
        self.tariffs[0]['rate']=.2
        r=farm.last_print_energy(self.db,'sensor.power')
        self.assertAlmostEqual(r['cost'],.078)
        s=farm.print_energy_summary(self.db,self.at+31)
        self.assertEqual(s['today']['measured'],1)
        self.assertAlmostEqual(s['today']['cost'],.078)

if __name__ == "__main__":
    unittest.main()
