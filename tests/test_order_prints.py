"""Order-linked production ledger: synthetic, no Etsy access or real customer data."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('order_lager',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class OrderPrintTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()
        self.now=int(time.time())
        self.cat=[({'listing_id':101,'title':'Geschenkhalter','quantity':50,'state':'active'},'', '',
                  [('101-white','101','201','Farbe: Weiß','[]',50,1)],True)]
        self.orders=[('401',self.now,self.now+86400,'Testkunde',json.dumps([
            {'transaction_id':'301','listing_id':'101','quantity':2,'title':'Geschenkhalter','variant':'Farbe: Weiß'}]))]
        self.tx=lambda status='open': [('301','401','101','201','[]',2,self.now,status)]
        app.apply_snapshot(self.cat,self.tx(),{'401'},orders=self.orders)
        self.set_stock(0)

    def tearDown(self):
        self.temp.cleanup()

    def item(self):
        return app.overview()['products'][0]['items'][0]

    def line(self):
        return app.overview()['orders'][0]['items'][0]

    def set_stock(self,n):
        item=self.item()
        app.mutate_stock({'id':item['id'],'action':'set','quantity':n,'revision':item['revision']})

    def action(self,kind,n=1,revision=None):
        return app.mutate_order_print({
            'transaction_id':'301','receipt_id':'401','action':kind,
            'quantity':n,'revision':self.item()['revision'] if revision is None else revision})

    def test_order_line_is_linked_to_exact_etsy_transaction(self):
        line=self.line()
        self.assertEqual(line['transaction_id'],'301')
        self.assertEqual(line['item_id'],'101-white')
        self.assertEqual(line['remaining'],2)

    def test_start_reduces_recommendation_not_physical_inventory(self):
        before=self.item()
        self.action('printing',1)
        after=self.item()
        self.assertEqual((after['in_print'],after['order_printing'],after['on_hand']),(1,1,0))
        self.assertEqual(after['need'],before['need']-1)
        self.assertEqual((self.line()['remaining'],self.line()['printing']),(1,1))

    def test_finish_then_etsy_shipping_debits_exactly_once(self):
        self.action('printing',2)
        self.action('finish',1)
        self.assertEqual((self.item()['in_print'],self.item()['on_hand']),(1,1))
        self.action('finish',1)
        self.assertEqual((self.item()['in_print'],self.item()['on_hand']),(0,2))
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        self.assertEqual((self.item()['on_hand'],self.item()['order_printing']),(0,0))

    def test_ship_before_finish_does_not_make_phantom_stock(self):
        self.set_stock(5)
        self.action('printing',1)
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        self.assertEqual((self.item()['on_hand'],self.item()['in_print']),(4,1))
        # The print remains accessible in the product card after the Etsy order disappears.
        self.assertEqual(self.item()['order_jobs'][0]['status'],'shipped')
        self.action('finish',1)
        self.assertEqual((self.item()['on_hand'],self.item()['in_print']),(4,0))
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        self.assertEqual(self.item()['on_hand'],4)

    def test_cancel_restores_remaining_without_stock_change(self):
        self.action('printing',2)
        self.action('cancel',1)
        self.assertEqual((self.line()['printing'],self.line()['remaining']),(1,1))
        self.action('printing',1)
        self.assertEqual((self.line()['printing'],self.line()['remaining']),(2,0))
        with self.assertRaises(ValueError):
            self.action('printing',1)

    def test_generic_finish_cannot_consume_linked_prints(self):
        self.action('printing',1)
        for action in ('finish','cancel'):
            with self.assertRaises(ValueError):
                app.mutate_stock({'id':'101-white','action':action,'quantity':1})
        app.mutate_stock({'id':'101-white','action':'printing','quantity':1})
        app.mutate_stock({'id':'101-white','action':'finish','quantity':1})
        self.assertEqual((self.item()['order_printing'],self.item()['in_print']),(1,1))
        self.action('finish',1)
        self.assertEqual(self.item()['on_hand'],2)

    def test_stale_revisions_and_invalid_quantities(self):
        old=self.item()['revision']
        self.action('printing',1)
        with self.assertRaises(ValueError):
            self.action('printing',1,revision=old)
        for q in (0,-1,True,'1',3):
            with self.assertRaises(ValueError):
                self.action('printing',q)

    def test_canceled_order_rejects_new_start_but_running_can_finish(self):
        self.action('printing',1)
        app.apply_snapshot(None,self.tx('excluded'),{'401'},orders=[])
        with self.assertRaises(ValueError):
            self.action('printing',1)
        self.action('finish',1)
        self.assertEqual(self.item()['on_hand'],1)

    def test_migration_idempotent_keeps_order_ledger_and_stock(self):
        self.action('printing',1)
        app.init_db()
        app.init_db()
        self.assertEqual(self.item()['in_print'],1)
        self.assertEqual(self.item()['order_jobs'][0]['receipt_id'],'401')


if __name__=='__main__':
    unittest.main()
