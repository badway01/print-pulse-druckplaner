"""Local orders, shared stock, special work, direct sales and Etsy sync regression."""
import datetime as dt
import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
BOOT=tempfile.TemporaryDirectory()
previous_data=os.environ.get('PP_DATA_DIR')
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('local_test_app',ROOT/'print_pulse_druckplaner'/'app.py')
app=importlib.util.module_from_spec(spec)
try:spec.loader.exec_module(app)
finally:
    if previous_data is None:os.environ.pop('PP_DATA_DIR',None)
    else:os.environ['PP_DATA_DIR']=previous_data


class LocalOrderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.old=app.DB_PATH
        app.DB_PATH=Path(self.temp.name)/'stock.sqlite3'
        app.init_db()
        self.catalog=[(
            {'listing_id':101,'title':'Vase mit Herz','quantity':20,'state':'active'},
            '','',[
              ('small','101','201','Größe: Klein · Farbe: Schwarz','[]',20,1),
              ('large','101','202','Größe: Groß · Farbe: Schwarz','[]',20,1)
            ],True
        )]
        app.apply_snapshot(self.catalog,[],set(),orders=[])
        with app.connect() as db:
            db.execute("UPDATE stock_items SET on_hand=5 WHERE id IN ('small','large')")

    def tearDown(self):
        app.DB_PATH=self.old
        self.temp.cleanup()

    def payload(self,lines=None,request_key='local-test-key-123456',direct=False):
        if lines is None: lines=[{'listing_id':'101','item_id':'small','quantity':1,
                                 'color':'','personalization':'','note':''}]
        day=(dt.datetime.now(app.ZoneInfo('Europe/Berlin')).date()+dt.timedelta(days=5)).isoformat()
        return dict(customer='Frau Muster',fulfillment='pickup',
                    due_date=day,notes='Kundin holt ab',
                    lines=lines,direct_sale=direct,request_key=request_key)

    def call(self,method,data):
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            return method(db,data)

    def stock(self,id='small'):
        with app.connect() as db:
            return db.execute('SELECT on_hand FROM stock_items WHERE id=?',(id,)).fetchone()[0]

    def jobs(self,oid):
        with app.connect() as db:
            return [dict(x) for x in db.execute(
                'SELECT * FROM stock_transactions WHERE receipt_id=? ORDER BY id',(oid,))]

    def test_two_size_variants_in_one_order_keep_due_date_after_sync(self):
        payload=self.payload([
          {'listing_id':'101','item_id':'small','quantity':1,'color':'',
           'personalization':'','note':'1 klein'},
          {'listing_id':'101','item_id':'large','quantity':1,'color':'',
           'personalization':'','note':'1 groß'}
        ])
        result=self.call(app.local_orders.create,payload)
        oid=result['id']
        first=app.overview()['orders']
        self.assertEqual(len(first),1)
        self.assertEqual(first[0]['source'],'local')
        self.assertEqual(first[0]['quantity'],2)
        self.assertEqual([l['variant'] for l in first[0]['items']],
                         ['Größe: Klein · Farbe: Schwarz','Größe: Groß · Farbe: Schwarz'])
        self.assertTrue(first[0]['ship_by'])
        self.assertEqual(len(self.jobs(oid)),2)
        app.apply_snapshot(None,[],set(),orders=[])
        self.assertEqual(app.overview()['orders'][0]['id'],oid)
        app.apply_snapshot(self.catalog,[],set(),orders=[])
        self.assertEqual(app.overview()['orders'][0]['id'],oid)
        self.assertEqual(self.stock(),5)

    def test_custom_color_and_engraving_are_separate_from_inventory(self):
        line={'listing_id':'101','item_id':'large','quantity':2,
              'color':'Jadeweiß','personalization':'Für Niclas','note':'Mit Holzständer'}
        oid=self.call(app.local_orders.create,self.payload([line]))['id']
        shown=app.overview()['orders'][0]['items'][0]
        self.assertTrue(shown['local_custom'])
        self.assertEqual(shown['color'],'Jadeweiß')
        self.assertEqual(shown['personalization'],'Für Niclas')
        self.assertIsNone(shown['item_id'])
        tid=shown['transaction_id']
        self.call(app.local_orders.custom_action,{'transaction_id':tid,'action_type':'start','quantity':2})
        self.assertEqual(app.overview()['orders'][0]['items'][0]['printing'],2)
        with self.assertRaisesRegex(ValueError,'noch im Druck'):
            with app.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                app.local_orders.close(db,{'id':oid,'action':'complete'},app.components)
        self.call(app.local_orders.custom_action,{'transaction_id':tid,'action_type':'finish','quantity':2})
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            app.local_orders.close(db,{'id':oid,'action':'complete'},app.components)
        self.assertFalse(app.overview()['orders'])
        self.assertEqual(self.stock('large'),5)
        with app.connect() as db:
            self.assertEqual(app.local_orders.history(db)[0]['status'],'completed')

    def test_direct_sale_is_idempotent_and_debits_exactly_once(self):
        body=self.payload([{'listing_id':'101','item_id':'small','quantity':2,
                            'color':'','personalization':'','note':''}],direct=True)
        first=self.call(app.local_orders.create,body)
        self.assertEqual(first['status'],'completed')
        self.assertEqual(self.stock(),3)
        repeated=self.call(app.local_orders.create,body)
        self.assertEqual(first,repeated)
        self.assertEqual(self.stock(),3)
        self.assertFalse(app.overview()['orders'])
        with app.connect() as db:
            self.assertEqual(app.local_orders.history(db)[0]['status'],'completed')
        with self.assertRaisesRegex(ValueError,'Zu wenig freier Bestand'):
            self.call(app.local_orders.create,self.payload([
              {'listing_id':'101','item_id':'small','quantity':4,
               'color':'','personalization':'','note':''}
            ],request_key='new-direct-sale-key-123',direct=True))
        self.assertEqual(self.stock(),3)

    def test_normal_pickup_allocations_and_printed_stock_never_double_debit(self):
        body=self.payload([
          {'listing_id':'101','item_id':'small','quantity':1,'color':'','personalization':'','note':''},
          {'listing_id':'101','item_id':'large','quantity':1,'color':'','personalization':'','note':''}
        ])
        oid=self.call(app.local_orders.create,body)['id']
        items=app.overview()['orders'][0]['items']
        for line in items:
            with app.connect() as db:
                item=db.execute('SELECT revision FROM stock_items WHERE id=?',(line['item_id'],)).fetchone()
            app.mutate_order_print({'transaction_id':line['transaction_id'],'receipt_id':oid,
                'action':'allocate','quantity':1,'revision':item['revision']})
        self.assertEqual((self.stock('small'),self.stock('large')),(4,4))
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            app.local_orders.close(db,{'id':oid,'action':'complete'},app.components)
        self.assertEqual((self.stock('small'),self.stock('large')),(4,4))
        self.assertFalse(app.overview()['orders'])

    def test_cancel_restores_allocation_and_preserves_persisted_order(self):
        oid=self.call(app.local_orders.create,self.payload())['id']
        line=app.overview()['orders'][0]['items'][0]
        with app.connect() as db:
            rev=db.execute("SELECT revision FROM stock_items WHERE id='small'").fetchone()[0]
        app.mutate_order_print({'transaction_id':line['transaction_id'],
           'receipt_id':oid,'action':'allocate','quantity':1,'revision':rev})
        self.assertEqual(self.stock(),4)
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            app.local_orders.close(db,{'id':oid,'action':'cancel'},app.components)
        self.assertEqual(self.stock(),5)
        self.assertFalse(app.overview()['orders'])
        with app.connect() as db:
            self.assertEqual(app.local_orders.history(db)[0]['status'],'cancelled')

    def test_update_deadline_without_rewriting_order_lines(self):
        oid=self.call(app.local_orders.create,self.payload())['id']
        updated=self.payload()
        updated['id']=oid
        updated['notes']='Bitte um 16 Uhr abholen'
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            app.local_orders.update(db,updated)
        order=app.overview()['orders'][0]
        self.assertEqual(order['notes'],'Bitte um 16 Uhr abholen')
        self.assertEqual(len(order['items']),1)
        self.assertEqual(self.stock(),5)

    def test_invalid_variant_and_missing_deadline_do_not_create_any_order(self):
        bad=self.payload()
        bad['lines'][0]['item_id']='not-real'
        with self.assertRaisesRegex(ValueError,'Produktvariante'):
            self.call(app.local_orders.create,bad)
        bad=self.payload()
        bad['due_date']=''
        with self.assertRaisesRegex(ValueError,'Fertigstellungstermin'):
            self.call(app.local_orders.create,bad)
        with app.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM pp_local_orders').fetchone()[0],0)


if __name__=='__main__':unittest.main()
