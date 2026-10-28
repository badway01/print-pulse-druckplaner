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

    def payload(self,lines=None,request_key='test-order-123',direct=False):
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
              'color':'Jadeweiß','personalization':'Für Alex','note':'Mit Holzständer'}
        oid=self.call(app.local_orders.create,self.payload([line]))['id']
        shown=app.overview()['orders'][0]['items'][0]
        self.assertTrue(shown['local_custom'])
        self.assertEqual(shown['color'],'Jadeweiß')
        self.assertEqual(shown['personalization'],'Für Alex')
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

    def test_custom_order_completion_can_be_reopened_without_stock_change(self):
        oid=self.call(app.local_orders.create,self.payload([
            {'listing_id':'101','item_id':'large','quantity':2,
             'color':'Silber','personalization':'Gravur','note':''}]))['id']
        tid=app.overview()['orders'][0]['items'][0]['transaction_id']
        self.call(app.local_orders.custom_action,{'transaction_id':tid,'action_type':'finish-direct','quantity':2})
        self.assertEqual(app.overview()['orders'][0]['items'][0]['finished'],2)
        self.call(app.local_orders.custom_action,{'transaction_id':tid,'action_type':'reopen','quantity':1})
        self.assertEqual(app.overview()['orders'][0]['items'][0]['finished'],1)
        with self.assertRaises(ValueError):
            self.call(app.local_orders.custom_action,{'transaction_id':tid,'action_type':'reopen','quantity':2})
        self.call(app.local_orders.custom_action,{'transaction_id':tid,'action_type':'reopen','quantity':1})
        self.assertEqual(app.overview()['orders'][0]['items'][0]['remaining'],2)
        self.assertEqual(self.stock('large'),5)

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
            ],request_key='sale-order-124',direct=True))
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

    def test_etsy_receipt_sync_never_requests_local_order_from_etsy(self):
        """LOK receipts live in stock tables, but cannot be fetched from Etsy."""
        oid=self.call(app.local_orders.create,self.payload())['id']
        self.assertTrue(oid.startswith('LOK-'))
        with mock.patch.object(app,'pages',return_value=[]) as pages_mock, \
             mock.patch.object(app,'api_request') as etsy_get:
            transactions,receipt_ids,orders=app.fetch_receipts('123',include_orders=True)
        self.assertEqual(transactions,[])
        self.assertEqual(receipt_ids,set())
        self.assertEqual(orders,[])
        self.assertEqual(pages_mock.call_count,2)
        etsy_get.assert_not_called()
        self.assertEqual(app.overview()['orders'][0]['id'],oid)

    def test_customer_a4_groups_only_open_local_orders_and_is_a_real_pdf(self):
        first=self.call(app.local_orders.create,self.payload(
            request_key='pdf-first-123'))['id']
        second_body=self.payload([
            {'listing_id':'101','item_id':'large','quantity':2,
             'color':'Jadeweiß','personalization':'Für Lotte',
             'note':'INTERNAL-LINE-NOTE-NOT-FOR-CUSTOMER'}
        ],request_key='pdf-second-123')
        second_body['customer']='FRAU   MUSTER'
        second_body['notes']='PRIVATE-ORDER-NOTE-NOT-FOR-CUSTOMER'
        second=self.call(app.local_orders.create,second_body)['id']
        third_body=self.payload(request_key='pdf-third-123')
        third_body['customer']='Frau Musterfrau'
        third=self.call(app.local_orders.create,third_body)['id']
        with app.connect() as db:
            snapshot=app.local_order_pdf.customer_snapshot(db,first)
        self.assertEqual({o['id'] for o in snapshot['orders']},{first,second})
        self.assertNotIn(third,str(snapshot))
        self.assertEqual(sum(line['quantity'] for order in snapshot['orders']
                             for line in order['items']),3)
        self.assertEqual(next(o for o in snapshot['orders'] if o['id']==second)['items'][0]['color'],'Jadeweiß')
        self.assertEqual(next(o for o in snapshot['orders'] if o['id']==second)['items'][0]['personalization'],'Für Lotte')
        self.assertNotIn('PRIVATE-ORDER-NOTE',str(snapshot))
        self.assertNotIn('INTERNAL-LINE-NOTE',str(snapshot))
        pdf=app.local_order_pdf.render_pdf(snapshot)
        self.assertTrue(pdf.startswith(b'%PDF-'))
        self.assertGreater(len(pdf),2500)
        self.assertIn('.pdf',app.local_order_pdf.safe_filename('Frau Müller'))
        with app.connect() as db:
            db.execute("UPDATE pp_local_orders SET status='completed' WHERE id=?",(second,))
        with app.connect() as db:
            fresh=app.local_order_pdf.customer_snapshot(db,first)
        self.assertEqual([o['id'] for o in fresh['orders']],[first])
        with app.connect() as db:
            archived=app.local_order_pdf.customer_snapshot(db,second)
        self.assertEqual([o['id'] for o in archived['orders']],[second])

    def test_customer_a4_handles_many_lines_and_long_personalization(self):
        lines=[{'listing_id':'101','item_id':'small','quantity':1,
                'color':'Bordeaux','personalization':'Ärger über Überraschung & <test> '+('A'*300),
                'note':''} for _ in range(25)]
        oid=self.call(app.local_orders.create,self.payload(
            lines,request_key='pdf-many-123'))['id']
        with app.connect() as db:
            snap=app.local_order_pdf.customer_snapshot(db,oid)
        pdf=app.local_order_pdf.render_pdf(snap)
        self.assertGreater(len(pdf),3500)
        self.assertTrue(pdf.startswith(b'%PDF-'))

    def test_existing_orders_ready_and_grouped_third_party_handover_and_undo(self):
        first=self.call(app.local_orders.create,self.payload(request_key='handover-abc-123'))['id']
        second=self.call(app.local_orders.create,self.payload(
            request_key='handover-def-123'))['id']
        self.assertTrue(all(o['status']=='open' for o in app.overview()['orders']))
        for oid in (first,second):
            line=next(o for o in app.overview()['orders'] if o['id']==oid)['items'][0]
            with app.connect() as db:
                rev=db.execute("SELECT revision FROM stock_items WHERE id='small'").fetchone()[0]
            app.mutate_order_print({'transaction_id':line['transaction_id'],
                'receipt_id':oid,'action':'allocate','quantity':1,'revision':rev})
        before=self.stock()
        self.assertEqual(before,3)
        self.assertTrue(all(o['status']=='ready' for o in app.overview()['orders']))
        with app.connect() as db:
            saved=app.local_orders.history(db)
        self.assertTrue(all(o['status']=='ready' for o in saved))
        result=self.call(lambda db,data:app.local_orders.handover(db,data,app.components),
            {'ids':[first,second],'method':'third_party','recipient':'Nachbarin'})
        self.assertEqual(result['status'],'completed')
        self.assertEqual(self.stock(),before)
        self.assertFalse(app.overview()['orders'])
        with app.connect() as db:
            handovers={r['id']:r for r in app.local_orders.history(db)}
        for oid in (first,second):
            self.assertEqual(handovers[oid]['handover_method'],'third_party')
            self.assertEqual(handovers[oid]['handover_to'],'Nachbarin')
            self.assertGreater(handovers[oid]['handover_at'],0)
        self.call(app.local_orders.undo_handover,{'id':first})
        self.assertEqual(self.stock(),before)
        restored=app.overview()['orders']
        self.assertEqual([o['id'] for o in restored],[first])
        self.assertEqual(restored[0]['status'],'ready')
        with app.connect() as db:
            self.assertEqual(next(r for r in app.local_orders.history(db) if r['id']==second)['status'],'completed')

    def test_finished_print_is_debited_once_and_restored_on_handover_undo(self):
        oid=self.call(app.local_orders.create,self.payload(request_key='undo-debits-123'))['id']
        line=app.overview()['orders'][0]['items'][0]
        with app.connect() as db:
            rev=db.execute("SELECT revision FROM stock_items WHERE id='small'").fetchone()[0]
        app.mutate_order_print({'transaction_id':line['transaction_id'],
            'receipt_id':oid,'action':'finish-direct','quantity':1,'revision':rev})
        self.assertEqual(self.stock(),6)
        self.assertEqual(app.overview()['orders'][0]['status'],'ready')
        self.call(lambda db,data:app.local_orders.handover(db,data,app.components),
            {'ids':[oid],'method':'delivered','recipient':''})
        self.assertEqual(self.stock(),5)
        self.call(app.local_orders.undo_handover,{'id':oid})
        self.assertEqual(self.stock(),6)
        self.assertEqual(app.overview()['orders'][0]['status'],'ready')
        with app.connect() as db:
            self.assertEqual(app.local_orders.history(db)[0]['handover_method'],'')

    def test_group_handover_rejects_unfinished_member_without_partial_changes(self):
        one=self.call(app.local_orders.create,self.payload(request_key='group-open-a-123'))['id']
        two=self.call(app.local_orders.create,self.payload(request_key='group-open-b-123'))['id']
        line=next(o for o in app.overview()['orders'] if o['id']==one)['items'][0]
        with app.connect() as db:
            rev=db.execute("SELECT revision FROM stock_items WHERE id='small'").fetchone()[0]
        app.mutate_order_print({'transaction_id':line['transaction_id'],
            'receipt_id':one,'action':'allocate','quantity':1,'revision':rev})
        with self.assertRaisesRegex(ValueError,'Noch nicht alle Artikel'): 
            self.call(lambda db,data:app.local_orders.handover(db,data,app.components),
                {'ids':[one,two],'method':'customer'})
        self.assertEqual({o['id'] for o in app.overview()['orders']},{one,two})
        self.assertEqual(self.stock(),4)

    def test_old_completed_orders_are_not_reopened_without_handover_ledger(self):
        oid=self.call(app.local_orders.create,self.payload(request_key='historical-123',direct=True))['id']
        with self.assertRaisesRegex(ValueError,'ältere'):
            self.call(app.local_orders.undo_handover,{'id':oid})
        self.assertEqual(self.stock(),4)

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
