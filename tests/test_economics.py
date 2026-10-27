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

    def test_print_only_needs_no_selling_price(self):
        r = self.save(f=fields(selling_eur=0, etsy_enabled=0, minutes=130))
        self.assertTrue(r["result"]["complete"])
        self.assertEqual(r["result"]["print_eur"], 2.99)  # 2.90 material + 0.09 electricity
        self.assertEqual(r["result"]["fees_eur"], 0)
        self.assertIsNone(r["result"]["profit_eur"])

    def test_etsy_fees_per_order_with_offsite_and_listing(self):
        r = self.save(f=fields(
            minutes=120, batch_units=2, selling_eur=20, etsy_enabled=1,
            units_per_order=2, shipping_paid_eur=4, shipping_cost_eur=4,
            etsy_percent=10.5, etsy_fixed_eur=.30,
            offsite_percent=15, listing_fee_eur=.18,
            packaging_eur=.50))
        result = r["result"]
        # Selling 20 + 2 shipment share, platform 10.5%, ad 15%,
        # fixed EUR .30 spread across 2 units, listing EUR .18 per unit.
        self.assertEqual(result["fees_eur"], 5.94)
        self.assertEqual(result["revenue_eur"], 22)
        self.assertEqual(result["other_eur"], 2.50)
        self.assertTrue(result["complete"])
        self.assertIsNotNone(result["profit_eur"])

    def test_legacy_profiles_keep_etsy_sales_active(self):
        self.db.execute("""INSERT INTO pp_cost_profiles
          (listing_id,variant_id,printer,status,notes,fields_json,materials_json,updated)
          VALUES ('123','','H2D','approved','','{"minutes":60,"selling_eur":20}',
          '[{"filament_id":1,"grams":100,"spool_g":1000}]',1)""")
        profile = economics.read(self.db)["profiles"][0]
        self.assertEqual(profile["fields"]["etsy_enabled"], 1)

    def test_parse_official_fees_and_no_guessing_eur_listing_price(self):
        rates = economics.parse_official_rates(
            "Artikel - 0,20 USD Transaktion - 6,5 % des Gesamtbetrags",
            "Deutschland 4 % + 0,30 EUR",
            "eine Gebühr von 15 % reduzierte Gebühr von 12 %",
            b'<root><Cube currency="USD" rate="1.1"/></root>')
        self.assertEqual(rates["payments_fixed_eur"], .30)
        self.assertEqual(rates["usd_per_eur"], 1.1)
        economics.store_fee_rates(self.db, rates)
        self.assertAlmostEqual(economics.fee_rates(self.db)["listing_eur"], .1818, places=3)
        with self.assertRaises(ValueError):
            economics.parse_official_rates("unbekannt", "unbekannt", "unbekannt", b"<root/>")
        self.assertEqual(economics.fee_rates(self.db)["listing_eur"], .1818)

    def test_home_assistant_image_contains_cost_engine(self):
        dockerfile = (MODULE.parent / "Dockerfile").read_text()
        self.assertIn("COPY economics.py ./economics.py", dockerfile)

    def test_economics_does_not_touch_inventory(self):
        self.save()
        counts = {name:self.db.execute("SELECT COUNT(*) FROM "+name).fetchone()[0]
                  for name in ("stock_listings","stock_items","filament_spools")}
        self.assertEqual(counts, {"stock_listings":1,"stock_items":1,"filament_spools":2})


if __name__ == "__main__":
    unittest.main()
