"""Etsy-only percentage alerts, persistent historical reference, no physical stock."""
import importlib.util
import math
import os
from pathlib import Path
import tempfile
import unittest

BOOT=tempfile.TemporaryDirectory()
os.environ["PP_DATA_DIR"]=BOOT.name
spec=importlib.util.spec_from_file_location(
    "etsy_stock_alert_app",Path(__file__).resolve().parents[1]/"print_pulse_druckplaner/app.py")
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


def row(listing_id="101", state="active", total=10, baseline=None, variants=None, title="Testprodukt"):
    return {"id":listing_id,"title":title,"state":state,"etsy_qty":total,
            "etsy_reference_qty":baseline if baseline is not None else total,
            "items":variants or []}


def variant(i, qty, baseline=None, enabled=1):
    return {"id":"v-"+str(i),"label":"Farbe: "+str(i),"etsy_qty":qty,
            "etsy_reference_qty":baseline if baseline is not None else qty,
            "enabled":enabled,"sold30":0}


class EtsyAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.work=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.work.name)/"stock.sqlite3"
        app.init_db()

    def tearDown(self):
        self.work.cleanup()

    def test_ceil_25_percent_and_inclusive_threshold_for_different_listing_sizes(self):
        for baseline,limit in [(1,1),(2,1),(3,1),(4,1),(5,2),(8,2),(9,3),(10,3),(12,3),(25,7),(100,25)]:
            self.assertEqual(math.ceil(baseline*25/100),limit)
            with self.subTest(baseline=baseline):
                self.assertEqual(app.etsy_stock_alerts([row(total=limit,baseline=baseline)],25)[0]["warning_at"],limit)
                if limit<baseline:
                    self.assertEqual(app.etsy_stock_alerts([row(total=limit+1,baseline=baseline)],25),[])

    def test_variants_each_use_their_own_etsy_reference(self):
        listing=row(total=80,baseline=80,variants=[
            variant("5",2,5),variant("8",2,8),variant("above",3,8),
            variant("out",0,8),variant("disabled",0,8,enabled=0),
            variant("unknown",None)])
        alerts=app.etsy_stock_alerts([listing],25)
        self.assertEqual(len(alerts),1)
        self.assertEqual(alerts[0]["severity"],"empty")
        self.assertEqual(alerts[0]["affected_variants"],3)
        self.assertEqual([(v["etsy_qty"],v["warning_at"]) for v in alerts[0]["variants"]],[(0,2),(2,2),(2,2)])
        self.assertEqual(app.etsy_stock_alerts([row(total=80,baseline=80,variants=[variant("ok",3,8)])],25),[])

    def test_sold_out_but_not_inactive_draft_or_expired(self):
        groups=[row("1","inactive",0),row("2","draft",0),row("3","expired",0),
                row("4","sold_out",None),row("5","active",None,variants=[variant(0,0,8,0)])]
        result=app.etsy_stock_alerts(groups,25)
        self.assertEqual([x["listing_id"] for x in result],["4"])
        self.assertEqual(result[0]["severity"],"empty")

    def test_large_variant_catalog_is_bounded_and_grouped(self):
        alerts=app.etsy_stock_alerts([row(total=100,variants=[variant(i,0,8) for i in range(784)])],25)
        self.assertEqual(alerts[0]["affected_variants"],784)
        self.assertEqual(len(alerts[0]["variants"]),3)
        self.assertEqual(alerts[0]["more_variants"],781)

    def test_unknown_quantity_is_not_silently_zero(self):
        self.assertEqual(app.etsy_stock_alerts([row(total=None)],25),[])
        self.assertEqual(app.etsy_stock_alerts(
            [row(total=None,variants=[variant(1,0,5)])],25)[0]["etsy_qty"],None)

    def test_snapshot_historical_etsy_max_and_local_inventory_independence(self):
        def snap(qty):
            return [({"listing_id":"101","title":"Kartenhalter","quantity":qty,"state":"active"},
                "","",[("v-one","101","p-one","Weiß","sig1",qty,1)],True)]
        app.apply_snapshot(snap(8),[],set())
        app.mutate_stock({"id":"v-one","action":"set","quantity":999,"revision":0})
        result=app.overview()
        self.assertEqual(result["etsy_alert_percent"],25)
        self.assertEqual(result["etsy_stock_alerts"],[])
        # Shop drops from 8 to 2: alert must use historic 8, not new 2.
        app.apply_snapshot(snap(2),[],set())
        result=app.overview()
        self.assertEqual(len(result["etsy_stock_alerts"]),1)
        alert=result["etsy_stock_alerts"][0]
        self.assertEqual(alert["variants"][0]["etsy_reference_qty"],8)
        self.assertEqual(alert["variants"][0]["warning_at"],2)
        self.assertEqual(next(i for i in result["products"][0]["items"] if i["id"]=="v-one")["on_hand"],999)
        app.apply_snapshot(snap(1),[],set())
        self.assertEqual(app.overview()["etsy_stock_alerts"][0]["variants"][0]["etsy_reference_qty"],8)
        # Restock to 12 changes future reference automatically.
        app.apply_snapshot(snap(12),[],set())
        app.apply_snapshot(snap(3),[],set())
        self.assertEqual(app.overview()["etsy_stock_alerts"][0]["variants"][0]["warning_at"],3)
        app.init_db()  # restart must not overwrite the remembered 12 with current 3
        self.assertEqual(app.overview()["etsy_stock_alerts"][0]["variants"][0]["etsy_reference_qty"],12)

    def test_existing_catalog_is_bootstrapped_without_changing_stock_or_orders(self):
        with app.connect() as db:
            db.execute("""INSERT INTO stock_listings(id,title,image,etsy_qty,state,updated)
                          VALUES('101','Altartikel','',8,'active',42)""")
            db.execute("""INSERT INTO stock_items(id,listing_id,product_id,label,signature,etsy_qty,on_hand)
                          VALUES('v-one','101','p-one','Weiß','',8,99)""")
        app.init_db()
        app.apply_snapshot([({"listing_id":"101","title":"Altartikel","quantity":2,"state":"active"},
             "","",[("v-one","101","p-one","Weiß","sig1",2,1)],True)],[],set())
        alert=app.overview()["etsy_stock_alerts"][0]
        self.assertEqual(alert["variants"][0]["warning_at"],2)
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT on_hand FROM stock_items WHERE id='v-one'").fetchone()[0],99)
            self.assertEqual(db.execute("SELECT peak_qty FROM etsy_stock_reference WHERE listing_id='101' AND variant_id='v-one'").fetchone()[0],8)

    def test_custom_percent_recalculates_etsy_alert_without_writing_stock(self):
        with app.connect() as db:
            app.put_cfg(db,"etsy_alert_percent","50")
        cat=[({"listing_id":"101","title":"Schlüsselanhänger","quantity":4,
              "state":"active"},"","",[],True)]
        app.apply_snapshot(cat,[],set())
        app.apply_snapshot([({"listing_id":"101","title":"Schlüsselanhänger","quantity":2,
                            "state":"active"},"","",[],True)],[],set())
        result=app.overview()
        self.assertEqual(result["etsy_alert_percent"],50)
        self.assertEqual(result["etsy_stock_alerts"][0]["warning_at"],2)
        self.assertEqual(result["etsy_stock_alerts"][0]["etsy_qty"],2)


if __name__=="__main__":
    unittest.main()
