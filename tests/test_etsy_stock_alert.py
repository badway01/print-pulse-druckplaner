"""Etsy availability warnings must use Etsy quantity, not counted physical stock."""
import importlib.util
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


def row(listing_id="101", state="active", total=10, variants=None, title="Testprodukt"):
    return {"id":listing_id,"title":title,"state":state,"etsy_qty":total,
            "items":variants or []}


def variant(i,qty,enabled=1):
    return {"id":"v-"+str(i),"label":"Farbe: "+str(i),"etsy_qty":qty,
            "enabled":enabled,"sold30":0}


class EtsyAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.work=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.work.name)/"stock.sqlite3"
        app.init_db()

    def tearDown(self):
        self.work.cleanup()

    def test_exclusive_threshold_and_disabled_variants(self):
        listing=row(total=4,variants=[variant(0,0),variant(1,1),
                                     variant(2,2),variant(3,3),
                                     variant(4,None),variant(5,0,0)])
        result=app.etsy_stock_alerts([listing],3)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]["severity"],"empty")
        self.assertEqual(result[0]["affected_variants"],3)
        self.assertEqual([v["etsy_qty"] for v in result[0]["variants"]],[0,1,2])
        self.assertFalse(app.etsy_stock_alerts([row(total=3)],3))
        self.assertEqual(app.etsy_stock_alerts([row(total=2)],3)[0]["severity"],"low")

    def test_sold_out_but_not_inactive_draft_or_expired(self):
        groups=[row("1","inactive",0),row("2","draft",0),
                row("3","expired",0),row("4","sold_out",None),
                row("5","active",None,variants=[variant(0,1,0)])]
        result=app.etsy_stock_alerts(groups,3)
        self.assertEqual([x["listing_id"] for x in result],["4"])
        self.assertEqual(result[0]["severity"],"empty")

    def test_large_variant_catalog_is_bounded_and_grouped(self):
        items=[variant(i,0) for i in range(784)]
        alerts=app.etsy_stock_alerts([row(total=100,variants=items)],3)
        self.assertEqual(len(alerts),1)
        self.assertEqual(alerts[0]["affected_variants"],784)
        self.assertEqual(len(alerts[0]["variants"]),3)
        self.assertEqual(alerts[0]["more_variants"],781)

    def test_unknown_quantity_is_not_silently_zero(self):
        self.assertEqual(app.etsy_stock_alerts([row(total=None)],3),[])
        self.assertEqual(app.etsy_stock_alerts(
            [row(total=None,variants=[variant(1,0)])],3)[0]["etsy_qty"],None)

    def test_snapshot_preserves_existing_stock_and_displays_etsy_alert(self):
        cat=[({"listing_id":"101","title":"Kartenhalter","quantity":12,
              "state":"active"},"","",
             [("v-one","101","p-one","Weiß","sig1",0,1),
              ("v-two","101","p-two","Gold","sig2",5,1)],True)]
        app.apply_snapshot(cat,[],set())
        app.mutate_stock({"id":"v-one","action":"set","quantity":6,"revision":0})
        response=app.overview()
        self.assertEqual(response["etsy_alert_threshold"],3)
        self.assertEqual(len(response["etsy_stock_alerts"]),1)
        self.assertEqual(response["etsy_stock_alerts"][0]["variants"][0]["etsy_qty"],0)
        self.assertEqual(next(i for i in response["products"][0]["items"] if i["id"]=="v-one")["on_hand"],6)

    def test_custom_threshold_changes_alerts_without_writing_to_etsy(self):
        with app.connect() as db:
            app.put_cfg(db,"etsy_alert_threshold","5")
        cat=[({"listing_id":"101","title":"Schlüsselanhänger","quantity":4,
              "state":"active"},"","",[],True)]
        app.apply_snapshot(cat,[],set())
        self.assertEqual(app.overview()["etsy_stock_alerts"][0]["etsy_qty"],4)
        self.assertEqual(app.overview()["etsy_alert_threshold"],5)


if __name__=="__main__":
    unittest.main()
