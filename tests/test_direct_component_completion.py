"""Regression tests: confirming already printed customer goods must not
manufacture free stock or require counted component inventory."""
import json
import sqlite3
import unittest

from print_pulse_druckplaner import components


def whole(value, low=0, high=100000):
    if type(value) is not int or not low <= value <= high:
        raise ValueError("Ungültige Stückzahl.")
    return value


class DirectComponentCompletionTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.executescript("""
            CREATE TABLE stock_listings(
                id TEXT PRIMARY KEY, components_enabled INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE stock_items(id TEXT PRIMARY KEY, on_hand INTEGER DEFAULT 0);
            CREATE TABLE stock_transactions(
                id TEXT PRIMARY KEY, receipt_id TEXT, listing_id TEXT,
                item_id TEXT,qty INTEGER,status TEXT);
            CREATE TABLE stock_receipts(id TEXT PRIMARY KEY,lines_json TEXT);
            CREATE TABLE stock_order_prints(
                transaction_id TEXT PRIMARY KEY,receipt_id TEXT,item_id TEXT,
                printing INTEGER NOT NULL DEFAULT 0,
                finished INTEGER NOT NULL DEFAULT 0,
                allocated INTEGER NOT NULL DEFAULT 0,
                assembled INTEGER NOT NULL DEFAULT 0,
                updated INTEGER NOT NULL DEFAULT 0);
        """)
        components.schema(self.db)
        self.db.execute("INSERT INTO stock_listings(id,components_enabled) VALUES('p',1)")
        self.db.execute("INSERT INTO stock_items(id,on_hand) VALUES('v',0)")
        self.db.execute(
            "INSERT INTO stock_transactions(id,receipt_id,listing_id,item_id,qty,status)"
            " VALUES('t','receipt','p','v',2,'open')")
        line={"transaction_id":"t","quantity":2,"variant":"Farbe Grundplatte: 16. Gelb"}
        self.db.execute("INSERT INTO stock_receipts(id,lines_json) VALUES('receipt',?)",
                        (json.dumps([line]),))
        for cid,name,kind in (('plate','Grundplatte','stock'),('wave','Welle','stock')):
            self.db.execute(
                "INSERT INTO pp_components(id,listing_id,name,kind,units,stock,updated)"
                " VALUES(?,'p',?,?,1,0,0)",(cid,name,kind))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def confirm(self, count):
        with self.db:
            components.mutate(self.db, {
                "action":"quick-complete","transaction_id":"t","quantity":count},whole)

    def assembled(self):
        row=self.db.execute(
            "SELECT assembled FROM stock_order_prints WHERE transaction_id='t'").fetchone()
        return row["assembled"] if row else 0

    def test_two_already_printed_without_component_stock(self):
        self.confirm(2)
        self.assertEqual(self.assembled(),2)
        self.assertEqual(self.db.execute(
            "SELECT on_hand FROM stock_items WHERE id='v'").fetchone()[0],0)
        self.assertEqual(self.db.execute(
            "SELECT SUM(stock) FROM pp_components").fetchone()[0],0)
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM pp_component_orders").fetchone()[0],0)
        with self.assertRaises(ValueError):
            self.confirm(1)
        self.assertEqual(self.assembled(),2)

    def test_one_of_two_can_be_confirmed_twice_not_three_times(self):
        self.confirm(1)
        self.assertEqual(self.assembled(),1)
        self.confirm(1)
        self.assertEqual(self.assembled(),2)
        with self.assertRaises(ValueError):
            self.confirm(1)

    def test_already_booked_parts_are_consumed_without_new_stock(self):
        self.db.execute("INSERT INTO pp_component_orders"
            "(transaction_id,component_id,booked,printing,finished,consumed)"
            " VALUES('t','plate',1,0,0,0)")
        self.db.commit()
        self.confirm(2)
        result=self.db.execute(
            "SELECT booked,consumed FROM pp_component_orders"
            " WHERE transaction_id='t' AND component_id='plate'").fetchone()
        self.assertEqual((result["booked"],result["consumed"]),(1,1))
        self.assertEqual(self.db.execute(
            "SELECT stock FROM pp_components WHERE id='plate'").fetchone()[0],0)
        self.assertEqual(self.assembled(),2)

    def test_active_demand_print_is_cleared_not_invented_as_stock(self):
        self.db.execute("UPDATE pp_components SET kind='demand' WHERE id='wave'")
        self.db.execute("INSERT INTO pp_component_orders"
            "(transaction_id,component_id,booked,printing,finished,consumed)"
            " VALUES('t','wave',0,2,0,0)")
        self.db.commit()
        self.confirm(2)
        result=self.db.execute(
            "SELECT printing,finished,consumed FROM pp_component_orders"
            " WHERE transaction_id='t' AND component_id='wave'").fetchone()
        self.assertEqual(tuple(result),(0,0,0))
        self.assertEqual(self.assembled(),2)

    def test_reopen_component_completion_without_adding_any_inventory(self):
        self.confirm(2)
        with self.db:
            components.mutate(self.db,{
                "action":"quick-reopen","transaction_id":"t","quantity":1},whole)
        self.assertEqual(self.assembled(),1)
        self.assertEqual(self.db.execute(
            "SELECT on_hand FROM stock_items WHERE id='v'").fetchone()[0],0)
        self.assertEqual(self.db.execute(
            "SELECT SUM(stock) FROM pp_components").fetchone()[0],0)
        self.confirm(1)
        self.assertEqual(self.assembled(),2)
        with self.assertRaises(ValueError):
            with self.db:
                components.mutate(self.db,{
                    "action":"quick-reopen","transaction_id":"t","quantity":3},whole)

    def test_reopen_releases_previously_consumed_order_components_only(self):
        self.db.execute("INSERT INTO pp_component_orders"
            "(transaction_id,component_id,booked,printing,finished,consumed)"
            " VALUES('t','plate',2,0,0,0)")
        self.db.commit()
        self.confirm(2)
        self.assertEqual(self.db.execute("SELECT consumed FROM pp_component_orders WHERE component_id='plate'").fetchone()[0],2)
        with self.db:
            components.mutate(self.db,{
                "action":"quick-reopen","transaction_id":"t","quantity":1},whole)
        self.assertEqual(self.db.execute("SELECT booked,consumed FROM pp_component_orders WHERE component_id='plate'").fetchone()[:],(2,1))
        self.assertEqual(self.db.execute("SELECT stock FROM pp_components WHERE id='plate'").fetchone()[0],0)

    def test_missing_optional_component_configuration_does_not_block(self):
        self.db.execute("DELETE FROM pp_components")
        self.db.commit()
        self.confirm(2)
        self.assertEqual(self.assembled(),2)
        self.assertEqual(self.db.execute(
            "SELECT on_hand FROM stock_items WHERE id='v'").fetchone()[0],0)


if __name__=="__main__":
    unittest.main()
