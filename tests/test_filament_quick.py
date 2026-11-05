"""One-tap purchased filament rolls: atomic GLD, no duplicate posting."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]/"print_pulse_druckplaner"
WORK=tempfile.TemporaryDirectory()
os.environ["PP_DATA_DIR"]=WORK.name
spec=importlib.util.spec_from_file_location("quick_filament_app",ROOT/"app.py")
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
buy=app.filament_purchases


class QuickFilament(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/"production.sqlite3"
        app.init_db()
        self.fid=self.spool(2,1000)

    def tearDown(self):
        self.temp.cleanup()

    def spool(self,stock,price,opened=0):
        with app.connect() as db:
            c=db.execute("""INSERT INTO filament_spools(
                brand,material,color,color_hex,price_cents,stock_qty,open_qty,created,updated)
                VALUES ('Bambu Lab','PLA Basic','GLD-Test','#eeeeee',?,?,?,1,1)""",
                (price,stock,opened))
            return c.lastrowid

    def receipt(self,qty,cents,key=None,id=None):
        with app.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            return buy.quick_book(db,{
                "filament_id":self.fid if id is None else id,
                "quantity":qty,"unit_price_cents":cents,
                "request_key":key or ("unit-test-transaction-"+str(qty)+"-"+str(cents))
            })

    def current(self):
        with app.connect() as db:
            return dict(db.execute("SELECT * FROM filament_spools WHERE id=?",(self.fid,)).fetchone())

    def test_weighted_gld_instead_of_latest_purchase_price(self):
        self.receipt(3,1400)
        spool=self.current()
        self.assertEqual(spool["stock_qty"],5)
        self.assertEqual(spool["price_cents"],1240) # (2×10 € + 3×14 €) / 5
        self.assertEqual(app.filament_overview()["filaments"][0]["gl_d_active"],1)
        self.receipt(1,1000)
        self.assertEqual(self.current()["stock_qty"],6)
        self.assertEqual(self.current()["price_cents"],1200)

    def test_receipt_is_idempotent_and_preserves_stock(self):
        first=self.receipt(3,1200,key="same-request-key-xyz")
        second=self.receipt(3,1200,key="same-request-key-xyz")
        self.assertEqual(first["stock_qty"],second["stock_qty"])
        self.assertTrue(second["replayed"])
        self.assertEqual(self.current()["stock_qty"],5)
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pp_filament_quick_receipts").fetchone()[0],1)
        with self.assertRaisesRegex(ValueError,"bereits"):
            self.receipt(4,1200,key="same-request-key-xyz")

    def test_unknown_previous_cost_does_not_invent_gld(self):
        with app.connect() as db:
            db.execute("UPDATE filament_spools SET price_cents=NULL WHERE id=?",(self.fid,))
        r=self.receipt(3,1290)
        self.assertTrue(r["missing_previous_price"])
        self.assertEqual(r["gld_cents"],1290)
        self.assertEqual(self.current()["stock_qty"],5)

    def test_zero_price_and_open_rolls_not_blended(self):
        with app.connect() as db:
            db.execute("UPDATE filament_spools SET open_qty=2 WHERE id=?",(self.fid,))
        self.receipt(1,0)
        self.assertEqual(self.current()["open_qty"],2)
        self.assertEqual(self.current()["stock_qty"],3)
        self.assertEqual(self.current()["price_cents"],667)

    def test_invalid_booking_keeps_original_inventory(self):
        state=self.current()
        with self.assertRaises(ValueError):
            self.receipt(0,500)
        with self.assertRaises(ValueError):
            self.receipt(5,-1)
        with self.assertRaises(ValueError):
            self.receipt(2,600,key="broken")
        self.assertEqual(self.current()["stock_qty"],state["stock_qty"])
        self.assertEqual(self.current()["price_cents"],state["price_cents"])

    def test_cart_quantity_reduced_only_after_receipt(self):
        with app.connect() as db:
            db.execute("UPDATE filament_spools SET cart_qty=4 WHERE id=?",(self.fid,))
        self.receipt(2,800)
        self.assertEqual(self.current()["cart_qty"],2)
        self.receipt(5,800)
        self.assertEqual(self.current()["cart_qty"],0)


if __name__=="__main__":
    unittest.main()
