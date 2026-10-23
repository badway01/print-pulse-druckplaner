import tempfile
import unittest
from pathlib import Path

from print_pulse_druckplaner import app as planner


class OrderReservationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_db = planner.DB_PATH
        planner.DB_PATH = Path(self.tmp.name) / 'production.sqlite3'
        planner.init_db()
        with planner.connect() as db:
            db.execute("INSERT INTO stock_listings(id,title,image,etsy_qty,state,updated) VALUES('101','Karte','','2','active',1)")
            db.execute("""INSERT INTO stock_items(id,listing_id,product_id,label,signature,on_hand)
                          VALUES('sku','101','1','Gold','Gold',0)""")
            for tid in ('a','b'):
                db.execute("INSERT INTO stock_transactions VALUES(?,?,'101','sku',1,1,'open')", (tid,tid))

    def tearDown(self):
        planner.DB_PATH = self.original_db
        self.tmp.cleanup()

    def revision(self):
        with planner.connect() as db:
            return db.execute("SELECT revision FROM stock_items WHERE id='sku'").fetchone()[0]

    def book(self, tid, action, qty=1):
        planner.mutate_order_print(dict(transaction_id=tid,receipt_id=tid,
                                         action=action,quantity=qty,revision=self.revision()))

    def test_finished_print_is_not_reallocated_to_another_order(self):
        self.book('a','printing')
        # An uncounted opening balance must be explicitly recorded before finish.
        self.book('a','finish')
        with planner.connect() as db:
            row=db.execute("SELECT on_hand FROM stock_items WHERE id='sku'").fetchone()
            self.assertEqual(row['on_hand'],1)
        with self.assertRaisesRegex(ValueError,'reserviert'):
            self.book('b','allocate')
        self.book('b','printing')

    def test_allocation_is_atomic_and_reversible(self):
        with planner.connect() as db:
            db.execute("UPDATE stock_items SET on_hand=1 WHERE id='sku'")
        self.book('a','allocate')
        with self.assertRaises(ValueError):
            self.book('b','allocate')
        self.book('a','release')
        self.book('b','allocate')
        with planner.connect() as db:
            row=db.execute("SELECT on_hand FROM stock_items WHERE id='sku'").fetchone()
            self.assertEqual(row['on_hand'],0)

    def test_finished_reservation_leaves_only_unlocked_stock(self):
        with planner.connect() as db:
            db.execute("UPDATE stock_items SET on_hand=1 WHERE id='sku'")
        self.book('a','printing')
        self.book('a','finish')
        # The print belongs to a; the original unallocated piece may go to b.
        self.book('b','allocate')
        with planner.connect() as db:
            self.assertEqual(db.execute("SELECT on_hand FROM stock_items WHERE id='sku'").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT allocated FROM stock_order_prints WHERE transaction_id='b'").fetchone()[0],1)


if __name__ == '__main__':
    unittest.main()
