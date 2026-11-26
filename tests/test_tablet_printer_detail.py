"""Tests for the phase-correlated tablet printer detail history."""
import importlib.util
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/"print_pulse_druckplaner"
spec=importlib.util.spec_from_file_location("tablet_printer_detail",ROOT/"tablet_printer_detail.py")
detail=importlib.util.module_from_spec(spec)
spec.loader.exec_module(detail)


class PrinterDetailTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.now=1763986200
        self.h2d="sensor.shellyplugsg3_90706948a600_leistung"
        self.p1s="sensor.shellyplugsg3_9070694d3d74_leistung"

    def tearDown(self):
        self.db.close()

    def capture(self, at, stage, watts, amps, status="printing", real=True):
        return {"devices":[
            {"name":"H2D","kind":"printer","entity":self.h2d,
             "watts":watts,"amps":amps,
             "amps_source":"shelly" if real else "calculated",
             "print_stage":stage,"printer_state":status},
            {"name":"P1S New","kind":"printer","entity":self.p1s,
             "watts":999.0,"amps":9.5,"amps_source":"shelly",
             "print_stage":"printing","printer_state":"printing"}]}

    def test_ha_stages_and_peak_events_do_not_cross_printers(self):
        events=[
            ("heatbed_preheating",220.0,1.3,"heating"),
            ("auto_bed_leveling",115.0,.9,"leveling"),
            ("cleaning_nozzle_tip",175.0,1.6,"cleaning"),
            ("printing",85.0,.67,"printing"),
        ]
        for index,(stage,watts,amps,_phase) in enumerate(events):
            detail.record(self.db,self.capture(
                self.now+15*index,stage,watts,amps),now=self.now+15*index)
        data=detail.detail(self.db,self.h2d,"24h",now=self.now+65)
        self.assertEqual(data["samples"],4)
        self.assertEqual({p["phase"] for p in data["phases"]},
                         {e[3] for e in events})
        self.assertEqual(data["summary"]["watts_peak"],220.0)
        self.assertEqual(data["summary"]["amps_peak"],1.6)
        self.assertEqual(data["summary"]["amps_peak_at"],self.now+30)
        self.assertTrue(any(p["phase"]=="Düse reinigen" and
                            p["amps_peak"]==1.6 for p in data["phases"]))
        self.assertTrue(any(e["phase"]=="Nivelliert" for e in data["peaks"]))
        self.assertFalse(any(v["watts"]==999.0 for v in data["series"]))
        other=detail.detail(self.db,self.p1s,"24h",now=self.now+65)
        self.assertEqual(other["summary"]["watts_avg"],999.0)
        self.assertEqual(other["summary"]["amps_peak"],9.5)

    def test_missing_ampere_is_null_not_zero_and_is_approximate(self):
        detail.record(self.db,self.capture(self.now,"printing",140.0,None),
                      now=self.now)
        detail.record(self.db,self.capture(self.now+15,"printing",100.0,.5,
                                           real=False),now=self.now+15)
        data=detail.detail(self.db,self.h2d,"1h",now=self.now+40)
        print_phase=next(p for p in data["phases"] if p["phase"]=="printing")
        self.assertEqual(print_phase["watts_avg"],120.)
        self.assertEqual(print_phase["amps_avg"],.5)
        self.assertEqual(print_phase["amps_direct_pct"],0.)
        self.assertEqual(print_phase["samples"],2)

    def test_suppress_stale_stage_when_finished_or_offline(self):
        self.assertEqual(detail.classify("auto_bed_leveling","finished")[0],
                         "finished")
        self.assertEqual(detail.classify("cleaning_nozzle_tip","offline")[0],
                         "offline")
        self.assertEqual(detail.classify("unexpected_magic_step","printing")[0],
                         "other")
        self.assertEqual(detail.classify("printing",None)[0],"printing")
        self.assertEqual(detail.classify("cleaning_nozzle_tip","printing","off")[0],"off")

    def test_peak_action_matches_timestamp_even_after_raw_pruning(self):
        for i,(stage,w,a) in enumerate([
            ("heatbed_preheating",400.,1.1),
            ("heating_hotend",200.,2.2),
            ("printing",80.,.5),
        ]):
            detail.record(self.db,self.capture(self.now+15*i,stage,w,a),now=self.now+15*i)
        for period in ("1h","24h","7d"):
            d=detail.detail(self.db,self.h2d,period,now=self.now+60)
            self.assertEqual(d["card_peaks"]["watts"]["context"]["action"],"Heizbett heizt")
            self.assertEqual(d["card_peaks"]["amps"]["context"]["action"],"Düse heizt")
        self.db.execute("DELETE FROM "+detail.RAW_TABLE)
        d=detail.detail(self.db,self.h2d,"7d",now=self.now+3*86400)
        self.assertEqual(d["card_peaks"]["watts"]["context"]["action"],"Heizbett heizt")
        self.assertEqual(d["card_peaks"]["amps"]["context"]["action"],"Düse heizt")

    def test_old_general_phase_and_zero_peak(self):
        detail.record(self.db,self.capture(self.now,"heating",0.,0.),now=self.now)
        d=detail.detail(self.db,self.h2d,"24h",now=self.now+1)
        self.assertEqual(d["card_peaks"]["watts"]["context"]["label"],"Heizt auf")
        self.assertIsNone(d["card_peaks"]["watts"]["context"]["action"])
        self.assertEqual(d["card_peaks"]["watts"]["value"],0.)

    def test_empty_period_and_validation(self):
        data=detail.detail(self.db,self.h2d,"24h",now=self.now)
        self.assertFalse(data["started"])
        self.assertEqual(data["series"],[])
        self.assertEqual(data["phases"],[])
        with self.assertRaises(ValueError):
            detail.detail(self.db,"sensor.other; DROP TABLE x","1h",now=self.now)
        with self.assertRaises(ValueError):
            detail.detail(self.db,self.h2d,"100years",now=self.now)

    def test_rollup_retains_peaks_and_phase_averages(self):
        for i in range(20):
            detail.record(self.db,self.capture(self.now+15*i,"heating_hotend",
                          100.+i,.1+i*.05),now=self.now+15*i)
        result=detail.detail(self.db,self.h2d,"7d",now=self.now+600)
        phase=next(p for p in result["phases"] if p["phase"]=="heating")
        self.assertEqual(phase["samples"],20)
        self.assertEqual(phase["watts_peak"],119.0)
        self.assertAlmostEqual(phase["amps_peak"],1.05)
        self.assertEqual(phase["watts_peak_at"],self.now+285)
        self.assertGreater(len(result["series"]),0)


    def test_independent_resets_preserve_history_and_boundary(self):
        self.now=self.now//300*300+30
        detail.record(self.db,self.capture(self.now,"heating",990.,4.3),now=self.now)
        detail.reset_peak(self.db,self.h2d,"watts","24h",now=self.now+5)
        data=detail.detail(self.db,self.h2d,"24h",now=self.now+6)
        self.assertIsNone(data["card_peaks"]["watts"]["value"])
        self.assertEqual(data["card_peaks"]["amps"]["value"],4.3)
        self.assertEqual(data["summary"]["watts_peak"],990.)
        self.assertEqual(data["reset_history"][0]["previous_value"],990.)
        detail.record(self.db,self.capture(self.now+15,"heating",100.,.5),now=self.now+15)
        detail.reset_peak(self.db,self.h2d,"amps","1h",now=self.now+20)
        detail.record(self.db,self.capture(self.now+30,"printing",120.,.7),now=self.now+30)
        for period in ("1h","24h","7d","30d"):
            data=detail.detail(self.db,self.h2d,period,now=self.now+40)
            self.assertEqual(data["card_peaks"]["watts"]["value"],120.)
            self.assertEqual(data["card_peaks"]["amps"]["value"],.7)
            self.assertEqual(data["summary"]["watts_peak"],990.)
            self.assertEqual(len(data["reset_history"]),2)
            self.assertEqual(detail.detail(self.db,self.p1s,period,
                             now=self.now+40)["card_peaks"]["amps"]["value"],9.5)
        # Older raw rows may be pruned; reset boundary is still recoverable.
        self.db.execute("DELETE FROM "+detail.RAW_TABLE)
        data=detail.detail(self.db,self.h2d,"7d",now=self.now+3*86400)
        self.assertEqual(data["card_peaks"]["watts"]["value"],120.)
        self.assertEqual(data["card_peaks"]["amps"]["value"],.7)
        self.assertEqual(data["summary"]["watts_peak"],990.)
        detail.reset_peak(self.db,self.h2d,"watts","7d",now=self.now+3*86400)
        self.assertIsNone(detail.detail(self.db,self.h2d,"7d",
                          now=self.now+3*86400)["card_peaks"]["watts"]["value"])
        with self.assertRaises(ValueError):
            detail.reset_peak(self.db,self.h2d,"other")


if __name__=="__main__":
    unittest.main()
