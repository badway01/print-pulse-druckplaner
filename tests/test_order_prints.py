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
        # The dashboard completion check requires finished == ordered and
        # no linked pieces still printing or waiting to be started.
        line=self.line()
        self.assertEqual((line['finished'],line['printing'],line['remaining'],line['quantity']),(2,0,0,2))
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


    def test_assign_existing_inventory_completes_order_without_reprinting(self):
        self.set_stock(2)
        self.action('allocate',2)
        line=self.line()
        self.assertEqual((line['allocated'],line['finished'],line['printing'],line['remaining']),(2,0,0,0))
        self.assertEqual((self.item()['on_hand'],self.item()['reserved']),(0,0))
        # Etsy shipping must not consume these same two pieces a second time.
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        self.assertEqual(self.item()['on_hand'],0)
        with self.assertRaises(ValueError):
            self.action('allocate',1)
        with self.assertRaises(ValueError):
            self.action('release',1)

    def test_partial_allocation_and_releasing_to_inventory(self):
        self.set_stock(3)
        self.action('allocate',1)
        self.assertEqual((self.item()['on_hand'],self.item()['reserved']),(2,1))
        self.assertEqual((self.line()['remaining'],self.line()['allocated']),(1,1))
        self.action('release',1)
        self.assertEqual((self.item()['on_hand'],self.item()['reserved']),(3,2))
        self.assertEqual((self.line()['remaining'],self.line()['allocated']),(2,0))
        self.action('allocate',2)
        self.action('release',1)
        self.assertEqual((self.item()['on_hand'],self.line()['allocated']),(2,1))
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        # One already withdrawn, one still in stock at shipment: only debit 1.
        self.assertEqual(self.item()['on_hand'],1)

    def test_stock_allocation_mixed_with_printing(self):
        self.set_stock(1)
        self.action('allocate',1)
        self.action('printing',1)
        self.assertEqual((self.line()['allocated'],self.line()['printing'],self.line()['remaining']),(1,1,0))
        self.action('finish',1)
        self.assertEqual((self.line()['allocated'],self.line()['finished'],self.line()['remaining']),(1,1,0))
        self.assertEqual(self.item()['on_hand'],1)
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        self.assertEqual(self.item()['on_hand'],0)

    def test_allocation_rejects_shortage_overbooking_stale_revision_and_bad_inputs(self):
        self.set_stock(1)
        stale=self.item()['revision']
        for qty in (0,-1,True,'1',3):
            with self.assertRaises(ValueError):
                self.action('allocate',qty)
        self.action('allocate',1)
        self.assertEqual(self.item()['on_hand'],0)
        with self.assertRaises(ValueError):
            self.action('allocate',1,revision=stale)
        with self.assertRaises(ValueError):
            self.action('allocate',1)
        self.action('release',1)
        self.set_stock(0)
        with self.assertRaises(ValueError):
            self.action('allocate',1)
        with app.connect() as db:
            db.execute('UPDATE stock_items SET on_hand=NULL,revision=revision+1 WHERE id=?',
                       (self.item()['id'],))
        with self.assertRaises(ValueError):
            self.action('allocate',1)

    def test_allocations_survive_etsy_sync_and_idempotent_db_migration(self):
        self.set_stock(2)
        self.action('allocate',1)
        app.init_db()
        app.init_db()
        app.apply_snapshot(None,self.tx(),{'401'},orders=self.orders)
        line=self.line()
        self.assertEqual((line['allocated'],line['remaining'],line['finished']),(1,1,0))
        self.assertEqual(self.item()['on_hand'],1)
        self.assertEqual(self.item()['reserved'],1)

    def test_first_order_finish_accepts_counted_initial_stock(self):
        self.action('printing',2)
        iid=self.item()['id']
        with app.connect() as db:
            db.execute('UPDATE stock_items SET on_hand=NULL,revision=revision+1 WHERE id=?',(iid,))
        request={'transaction_id':'301','receipt_id':'401','action':'finish',
                 'quantity':2,'revision':self.item()['revision']}
        with self.assertRaises(ValueError):
            app.mutate_order_print(request)
        for invalid in (-1,True,'0',1.5):
            with self.assertRaises(ValueError):
                app.mutate_order_print({**request,'initial_stock':invalid})
        app.mutate_order_print({**request,'initial_stock':0})
        self.assertEqual((self.item()['on_hand'],self.item()['in_print']),(2,0))
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        self.assertEqual(self.item()['on_hand'],0)

    def test_accidental_direct_completion_can_be_corrected_piece_by_piece(self):
        self.action('finish-direct',2)
        self.assertEqual((self.item()['on_hand'],self.line()['finished']), (2,2))
        self.action('reopen',1)
        self.assertEqual((self.item()['on_hand'],self.line()['finished'],self.line()['remaining']), (1,1,1))
        self.action('reopen',1)
        self.assertEqual((self.item()['on_hand'],self.line()['finished'],self.line()['remaining']), (0,0,2))
        with self.assertRaises(ValueError):
            self.action('reopen',1)

    def test_reopen_does_not_touch_allocated_inventory(self):
        self.set_stock(3)
        self.action('allocate',1)
        self.action('finish-direct',1)
        self.assertEqual((self.line()['allocated'],self.line()['finished'],self.item()['on_hand']), (1,1,3))
        self.action('reopen',1)
        self.assertEqual((self.line()['allocated'],self.line()['finished'],self.item()['on_hand']), (1,0,2))

    def test_reopen_is_rejected_after_shipping_and_when_stock_is_missing(self):
        self.action('finish-direct',2)
        with app.connect() as db:
            db.execute("UPDATE stock_items SET on_hand=0,revision=revision+1 WHERE id='101-white'")
        with self.assertRaisesRegex(ValueError,'Lagerbestand'):
            self.action('reopen',1)
        self.set_stock(2)
        app.apply_snapshot(None,self.tx('shipped'),{'401'},orders=[])
        with self.assertRaisesRegex(ValueError,'Versand'):
            self.action('reopen',1)

    def test_first_generic_finish_accepts_counted_initial_stock(self):
        iid=self.item()['id']
        app.mutate_stock({'id':iid,'action':'printing','quantity':1})
        with app.connect() as db:
            db.execute('UPDATE stock_items SET on_hand=NULL,revision=revision+1 WHERE id=?',(iid,))
        data={'id':iid,'action':'finish','quantity':1}
        with self.assertRaises(ValueError):
            app.mutate_stock(data)
        app.mutate_stock({**data,'initial_stock':3})
        self.assertEqual((self.item()['on_hand'],self.item()['in_print']),(4,0))


if __name__=='__main__':
    unittest.main()
