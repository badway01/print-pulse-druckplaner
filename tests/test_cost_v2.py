"""Regression suite for charge costs, independent sale/order counts and fee-inclusive margins."""
import importlib.util
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner"
spec = importlib.util.spec_from_file_location("pp_v2_test", ROOT / "cost_v2.py")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
econ_spec = importlib.util.spec_from_file_location("pp_economics_v2_test", ROOT / "economics.py")
economics = importlib.util.module_from_spec(econ_spec)
econ_spec.loader.exec_module(economics)


def defaults(**overrides):
    return {**economics.DEFAULTS, **v2.V2_FIELDS, "minutes": 42,
            "batch_units": 12, "selling_eur": 9.90, "etsy_enabled": 1, **overrides}


class CostV2Test(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE stock_listings(id TEXT PRIMARY KEY, title TEXT);
        CREATE TABLE stock_items(id TEXT PRIMARY KEY, listing_id TEXT);
        CREATE TABLE filament_spools(
          id INTEGER PRIMARY KEY, brand TEXT, color TEXT, material TEXT,
          color_hex TEXT, internal_code TEXT, manufacturer_code TEXT,
          price_cents INTEGER, stock_qty INTEGER, open_qty INTEGER, spool_g REAL);
        INSERT INTO stock_listings VALUES('123','Testplatte');
        INSERT INTO stock_items VALUES('456','123');
        INSERT INTO filament_spools VALUES(1,'Bambu','Weiß','PLA','#ffffff','26','10100',1450,2,0,1000);
        INSERT INTO filament_spools VALUES(2,'Bambu','Rot','PLA','#ff0000','3','10101',1450,2,0,500);
        """)
        economics.schema(self.db)

    def tearDown(self):
        self.db.close()

    def save(self, fields=None, materials=None, printer="H2D", **extra):
        return economics.save_profile(self.db, {"listing_id":"123","variant_id":"456",
            "printer":printer,"fields":fields or defaults(),"materials":materials if materials is not None
            else [{"filament_id":1,"grams":5.59,"spool_g":1000}],**extra})

    def test_twelve_parts_5_59_grams_and_42_minutes(self):
        result = self.save()["result"]
        self.assertEqual(result["batch_units"], 12)
        self.assertAlmostEqual(result["material_batch_eur"], .08, 2)
        self.assertEqual(result["electricity_batch_eur"], .03)
        self.assertEqual(result["unit_cost_eur"], .01)
        self.assertEqual(result["minutes_per_unit"], 3.5)
        self.assertLess(result["batch_total_eur"], .12 + .01)

    def test_multiple_filaments_and_different_weights(self):
        result = self.save(materials=[
            {"filament_id":1,"grams":10,"spool_g":1000},
            {"filament_id":2,"grams":10,"spool_g":500}])["result"]
        self.assertAlmostEqual(result["material_batch_eur"], .44, places=2)
        self.assertEqual(len(result["materials"]), 2)

    def test_sales_orders_differ_from_print_batch(self):
        result = self.save(fields=defaults(batch_units=12,sales_units=3,orders_count=2,
            selling_eur=10,shipping_paid_eur=5,shipping_cost_eur=3,
            packaging_eur=1,discount_percent=10))["result"]
        self.assertEqual(result["batch_units"], 12)
        self.assertEqual(result["sales_units"], 3)
        self.assertEqual(result["orders_count"], 2)
        self.assertAlmostEqual(result["revenue_order_eur"], 37, places=2)
        self.assertAlmostEqual(result["shipping_cost_total_eur"], 6, places=2)

    def test_direct_sales_have_no_etsy_fees(self):
        result = self.save(fields=defaults(etsy_enabled=0,offsite_percent=15))["result"]
        self.assertEqual(result["fees_order_eur"], 0)
        self.assertFalse(result["etsy_enabled"])

    def test_discounts_free_shipping_and_offsite(self):
        normal = self.save(fields=defaults(sales_units=2,orders_count=1,
            shipping_paid_eur=5,discount_percent=10,offsite_percent=15))["result"]
        free = self.save(fields=defaults(sales_units=2,orders_count=1,
            shipping_paid_eur=5,shipping_free=1,discount_percent=10,offsite_percent=15))["result"]
        self.assertAlmostEqual(normal["revenue_order_eur"]-free["revenue_order_eur"], 5)
        self.assertGreater(normal["fees_order_eur"], free["fees_order_eur"])

    def test_price_tiers_really_reach_margin_after_fee_and_rounding(self):
        economics.cost_v2.save_settings(self.db, {"rounding":"99","fee_vat_percent":19}, economics.PRINTERS)
        result = self.save(fields=defaults(sales_units=2,orders_count=1,offsite_percent=15))["result"]
        for key, target in (("break_even",0),("minimum",20),("standard",40),("luxury",60)):
            recommendation = result["recommendations"][key]
            self.assertGreaterEqual(recommendation["margin_percent"] + 0.0001, target)
            self.assertEqual(round(recommendation["price_eur"] % 1,2), .99)

    def test_config_changes_affect_live_calculation_not_saved_history(self):
        first = self.save()
        snapshot = self.db.execute("SELECT result_json FROM pp_cost_history").fetchone()[0]
        self.db.execute("UPDATE filament_spools SET price_cents=2000 WHERE id=1")
        latest = economics.read(self.db)["profiles"][0]["result"]
        self.assertNotEqual(first["result"]["material_batch_eur"],latest["material_batch_eur"])
        self.assertEqual(snapshot,self.db.execute("SELECT result_json FROM pp_cost_history").fetchone()[0])

    def test_cost_saving_never_approves_printer(self):
        saved = self.save()
        self.assertEqual(saved["status"],"untested")
        approved = self.save(approval_change=True,status="approved")
        self.assertEqual(approved["status"],"approved")
        still = self.save()
        self.assertEqual(still["status"],"approved")

    def test_catalog_recommendation_does_not_touch_etsy_price(self):
        self.save()
        economics.mutate(self.db, {"action":"save-catalog-recommendation","listing_id":"123",
                                 "variant_id":"456","printer":"H2D"})
        self.assertEqual(self.db.execute("SELECT title FROM stock_listings WHERE id='123'").fetchone()[0],"Testplatte")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM pp_catalog_cost_recommendations").fetchone()[0],1)

    def test_v2_image_contains_engine(self):
        self.assertIn("COPY cost_v2.py ./cost_v2.py",(ROOT / "Dockerfile").read_text())


if __name__ == "__main__":
    unittest.main()
