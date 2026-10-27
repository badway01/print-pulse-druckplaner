"""Economics regression checks: migration, approval isolation, costs and ROI."""
import importlib.util
import sqlite3
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner" / "economics.py"
spec = importlib.util.spec_from_file_location("pp_economics_test", MODULE)
economics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(economics)


def fields(**updates):
    return {**economics.DEFAULTS, "minutes": 240, "selling_eur": 25,
            "packaging_eur": 1.2, **updates}


class EconomicsTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE stock_listings(id TEXT PRIMARY KEY,title TEXT);
        CREATE TABLE stock_items(id TEXT PRIMARY KEY,listing_id TEXT);
        CREATE TABLE filament_spools(
          id INTEGER PRIMARY KEY,brand TEXT,color TEXT,material TEXT,
          color_hex TEXT,internal_code TEXT,price_cents INTEGER,stock_qty INTEGER,
          open_qty INTEGER);
        INSERT INTO stock_listings VALUES ('123','Geist');
        INSERT INTO stock_items VALUES ('456','123');
        INSERT INTO filament_spools VALUES (1,'Bambu','Weiß','PLA','#ffffff','1',1450,3,1);
        INSERT INTO filament_spools VALUES (2,'Bambu','Rot','PLA','#ff0000','2',NULL,1,0);
        """)
        economics.schema(self.db)
        economics.schema(self.db)

    def tearDown(self):
        self.db.close()

    def save(self, printer="H2D", status="approved", variant_id="456", materials=None, f=None):
        return economics.save_profile(self.db, {
            "listing_id": "123", "variant_id": variant_id, "printer": printer,
            "status": status, "notes": "Gute Oberfläche",
            "fields": f or fields(),
            "materials": materials if materials is not None else [
                {"filament_id": 1, "grams": 200, "spool_g": 1000}]
        })

    def test_real_filament_price_and_price_refresh(self):
        result = self.save(f=fields(batch_units=2, minutes=240, power_watts=100,
                                    energy_eur_kwh=.25))
        self.assertEqual(result["status"], "approved")
        self.assertEqual(result["result"]["material_eur"], 1.45)
        self.assertEqual(result["result"]["electricity_eur"], .05)
        self.assertTrue(result["result"]["complete"])
        self.db.execute("UPDATE filament_spools SET price_cents=2000 WHERE id=1")
        current = economics.read(self.db)["profiles"][0]["result"]
        self.assertEqual(current["material_eur"], 2.0)
        historic = self.db.execute("SELECT result_json FROM pp_cost_history").fetchone()[0]
        self.assertIn('"material_eur": 1.45', historic)

    def test_printer_and_variant_are_distinct(self):
        self.save("P1S Old", "issue", "456")
        self.save("P1S New", "approved", "456")
        self.save("H2D", "approved", "")
        rows = economics.read(self.db)["profiles"]
        self.assertEqual(len(rows), 3)
        self.assertEqual({r["printer"] for r in rows if r["status"] == "approved"}, {"P1S New", "H2D"})
        self.assertTrue(all(r["listing_id"] == "123" for r in rows))

    def test_unknown_filament_price_is_visible(self):
        r = self.save(materials=[{"filament_id": 2, "grams": 60, "spool_g": 1000}])
        self.assertIsNone(r["result"]["profit_eur"])
        self.assertTrue(r["result"]["missing_prices"])

    def test_invalid_references_and_negative_amounts_rejected(self):
        with self.assertRaises(ValueError):
            self.save(printer="Unknown")
        with self.assertRaises(ValueError):
            self.save(f=fields(minutes=-1))
        with self.assertRaises(ValueError):
            self.save(materials=[{"filament_id": 999, "grams": 1, "spool_g": 1000}])
        with self.assertRaises(ValueError):
            self.save(variant_id="invalid")

    def test_investment_payback_and_persistence(self):
        result = economics.save_investment(self.db, {
            "name": "Neuer Drucker", "printer": "H2D", "purchase_eur": 750,
            "setup_eur": 50, "monthly_units": 20, "contribution_eur": 10,
            "monthly_extra_eur": 40})
        inv = result["investments"][0]
        self.assertEqual(inv["result"]["payback_months"], 5)
        self.assertEqual(inv["result"]["monthly_net_eur"], 160)
        economics.mutate(self.db, {"action": "delete-investment", "id": inv["id"]})
        self.assertEqual(economics.read(self.db)["investments"], [])

    def test_economics_does_not_touch_inventory(self):
        self.save()
        counts = {name:self.db.execute("SELECT COUNT(*) FROM "+name).fetchone()[0]
                  for name in ("stock_listings","stock_items","filament_spools")}
        self.assertEqual(counts, {"stock_listings":1,"stock_items":1,"filament_spools":2})


if __name__ == "__main__":
    unittest.main()
