"""Regression tests: optional shared parts must never double-debit shop inventory."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('component_test_app',ROOT/'print_pulse_druckplaner'/'app.py')
app=importlib.util.module_from_spec(spec)
# Home Assistant provides /data; CI runs unprivileged and needs an isolated path.
BOOT_DATA=tempfile.TemporaryDirectory()
_previous_data=os.environ.get('PP_DATA_DIR')
os.environ['PP_DATA_DIR']=BOOT_DATA.name
try:
    spec.loader.exec_module(app)
finally:
    if _previous_data is None:
        os.environ.pop('PP_DATA_DIR',None)
    else:
        os.environ['PP_DATA_DIR']=_previous_data


class ComponentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.previous=app.DB_PATH
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()
        self.catalog=[(
            {'listing_id':101,'title':'Lesender Geist','quantity':50,'state':'active'},
            '', '', [('101-blue','101','201','Buchfarbe: Blau · Setgröße: 3er-Set','[]',50,1)], True
        )]
        self.tx=('tx1','receipt1','101','201','[]',1,int(time.time()),'open')
        self.lines=[{'transaction_id':'tx1','listing_id':'101','quantity':1,
                     'variant':'Buchfarbe: Blau · Setgröße: 3er-Set'}]
        self.receipts=[('receipt1',int(time.time()),int(time.time())+86400,
                        'Testkundin',json.dumps(self.lines))]
        app.apply_snapshot(self.catalog,[self.tx],{'receipt1'},orders=self.receipts)

    def tearDown(self):
        app.DB_PATH=self.previous
        self.temp.cleanup()

    def change(self,**data):
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            app.components.mutate(db,data,app.integer)

    def configure(self):
        self.change(action='toggle',listing_id='101',enabled=True)
        self.change(action='save',listing_id='101',name='Geist Weiß',kind='stock',
                    units=1,property_name='',quantity_property='Setgröße')
        self.change(action='save',listing_id='101',name='Buch',kind='demand',
                    units=1,property_name='Buchfarbe',quantity_property='Setgröße')
        parts=app.overview()['products'][0]['components']
        return {p['name']:p['id'] for p in parts}

    def state(self):
        return app.overview()

    def test_quick_stock_and_atomic_bulk_save_share_one_source(self):
        ids=self.configure()
        first=ids['Geist Weiß']
        self.change(action='stock-adjust',listing_id='101',id=first,delta=1)
        self.change(action='stock-adjust',listing_id='101',id=first,delta=1)
        parts={p['name']:p for p in self.state()['products'][0]['components']}
        self.assertEqual(parts['Geist Weiß']['stock'],2)
        with self.assertRaisesRegex(ValueError,'negativ'):
            self.change(action='stock-adjust',listing_id='101',id=first,delta=-1)
            self.change(action='stock-adjust',listing_id='101',id=first,delta=-1)
            self.change(action='stock-adjust',listing_id='101',id=first,delta=-1)
        # The failed transaction must not change the already committed zero.
        self.assertEqual(next(p for p in self.state()['products'][0]['components'] if p['id']==first)['stock'],0)
        self.change(action='save',listing_id='101',name='Grundplatte',kind='stock',
                    units=1,property_name='',quantity_property='')
        parts={p['name']:p for p in self.state()['products'][0]['components']}
        second=parts['Grundplatte']['id']
        self.change(action='stock-bulk',listing_id='101',entries=[
            {'id':first,'stock':5,'expected_stock':0},
            {'id':second,'stock':3,'expected_stock':0},
        ])
        parts={p['name']:p for p in self.state()['products'][0]['components']}
        self.assertEqual((parts['Geist Weiß']['stock'],parts['Grundplatte']['stock']),(5,3))
        with self.assertRaisesRegex(ValueError,'inzwischen geändert'):
            self.change(action='stock-bulk',listing_id='101',entries=[
                {'id':first,'stock':9,'expected_stock':5},
                {'id':second,'stock':9,'expected_stock':0},
            ])
        parts={p['name']:p for p in self.state()['products'][0]['components']}
        self.assertEqual((parts['Geist Weiß']['stock'],parts['Grundplatte']['stock']),(5,3))
        with self.assertRaisesRegex(ValueError,'Vorratsbauteil'):
            self.change(action='stock-adjust',listing_id='101',id=ids['Buch'],delta=1)
        self.change(action='stock-adjust',listing_id='101',id=second,delta=-1)
        parts={p['name']:p for p in self.state()['products'][0]['components']}
        self.assertEqual(parts['Grundplatte']['stock'],2)

    def test_refill_goal_and_running_batches_are_safe(self):
        ids=self.configure()
        gid=ids['Geist Weiß']
        self.change(action='save',listing_id='101',id=gid,name='Geist Weiß',
                    kind='stock',units=1,property_name='',quantity_property='Setgröße',
                    target_stock=8)
        self.change(action='stock',listing_id='101',id=gid,stock=4)
        self.change(action='stock-print',listing_id='101',id=gid,quantity=3)
        ghost=next(x for x in self.state()['products'][0]['components'] if x['id']==gid)
        self.assertEqual((ghost['stock'],ghost['target_stock'],ghost['printing_stock']),(4,8,3))
        app.init_db()  # idempotent schema migration and update-safe persistence
        ghost=next(x for x in self.state()['products'][0]['components'] if x['id']==gid)
        self.assertEqual((ghost['stock'],ghost['target_stock'],ghost['printing_stock']),(4,8,3))
        with self.assertRaisesRegex(ValueError,'nicht im Druck'):
            self.change(action='stock-finish',listing_id='101',id=gid,quantity=4)
        self.change(action='stock-finish',listing_id='101',id=gid,quantity=2)
        self.change(action='stock-cancel',listing_id='101',id=gid,quantity=1)
        ghost=next(x for x in self.state()['products'][0]['components'] if x['id']==gid)
        self.assertEqual((ghost['stock'],ghost['printing_stock']),(6,0))
        self.assertEqual(ghost['target_stock'],8)
        with self.assertRaisesRegex(ValueError,'nicht im Druck'):
            self.change(action='stock-cancel',listing_id='101',id=gid,quantity=1)

    def test_toggle_is_off_by_default_and_persists_migration(self):
        self.assertFalse(self.state()['products'][0]['components_enabled'])
        ids=self.configure()
        self.assertEqual(len(ids),2)
        app.init_db()
        self.assertTrue(self.state()['products'][0]['components_enabled'])
        self.assertEqual(len(self.state()['products'][0]['components']),2)

    def test_components_are_shared_without_complete_variant_stock(self):
        ids=self.configure()
        self.change(action='stock',listing_id='101',id=ids['Geist Weiß'],stock=6)
        line=self.state()['orders'][0]['items'][0]
        self.assertEqual([p['required'] for p in line['components']],[3,3])
        self.change(action='book',transaction_id='tx1',component_id=ids['Geist Weiß'],quantity=3)
        self.change(action='start',transaction_id='tx1',component_id=ids['Buch'],quantity=3)
        self.change(action='finish',transaction_id='tx1',component_id=ids['Buch'],quantity=3)
        line=self.state()['orders'][0]['items'][0]
        self.assertTrue(all(p['available']==3 for p in line['components']))
        self.change(action='assemble',transaction_id='tx1',quantity=1)
        line=self.state()['orders'][0]['items'][0]
        self.assertEqual(line['remaining'],0)
        self.assertEqual(line['assembled'],1)
        # Completed orders no longer block turning the component switch off.
        self.change(action='toggle',listing_id='101',enabled=False)
        self.assertFalse(self.state()['products'][0]['components_enabled'])
        self.change(action='toggle',listing_id='101',enabled=True)
        item=self.state()['products'][0]['items'][0]
        self.assertIsNone(item['on_hand'],'Assembly must not invent a complete variant stock count.')
        ghost=next(p for p in self.state()['products'][0]['components'] if p['name']=='Geist Weiß')
        self.assertEqual(ghost['stock'],3)
        self.assertEqual(app.components.requirement({'units':1,'property_name':'Buchfarbe',
                         'quantity_property':'Setgröße'},self.lines[0]),(3,'Blau',''))
        with self.assertRaises(ValueError):
            self.change(action='assemble',transaction_id='tx1',quantity=1)
        shipped=list(self.tx);shipped[-1]='shipped'
        app.apply_snapshot(self.catalog,[tuple(shipped)],{'receipt1'},orders=[])
        app.apply_snapshot(self.catalog,[tuple(shipped)],{'receipt1'},orders=[])
        self.assertIsNone(self.state()['products'][0]['items'][0]['on_hand'])
        ghost=next(p for p in self.state()['products'][0]['components'] if p['name']=='Geist Weiß')
        self.assertEqual(ghost['stock'],3)

    def test_missing_etsy_property_prevents_guessing(self):
        ids=self.configure()
        with app.connect() as db:
            db.execute('UPDATE stock_receipts SET lines_json=? WHERE id=?',(
              json.dumps([{'transaction_id':'tx1','listing_id':'101','quantity':1,'variant':'Buchfarbe: Blau'}]),'receipt1'))
        with self.assertRaisesRegex(ValueError,'Setgröße'):
            self.change(action='start',transaction_id='tx1',component_id=ids['Buch'],quantity=1)

    def test_cancel_returns_only_unused_reserved_parts(self):
        ids=self.configure()
        self.change(action='stock',listing_id='101',id=ids['Geist Weiß'],stock=4)
        self.change(action='book',transaction_id='tx1',component_id=ids['Geist Weiß'],quantity=3)
        cancelled=list(self.tx);cancelled[-1]='review'
        app.apply_snapshot(self.catalog,[tuple(cancelled)],{'receipt1'},orders=[])
        part=next(p for p in self.state()['products'][0]['components'] if p['id']==ids['Geist Weiß'])
        self.assertEqual(part['stock'],4)

    def test_cannot_reuse_consumed_reserved_stock(self):
        ids=self.configure()
        self.change(action='stock',listing_id='101',id=ids['Geist Weiß'],stock=3)
        self.change(action='book',transaction_id='tx1',component_id=ids['Geist Weiß'],quantity=3)
        with self.assertRaises(ValueError):
            self.change(action='book',transaction_id='tx1',component_id=ids['Geist Weiß'],quantity=1)
        self.change(action='release',transaction_id='tx1',component_id=ids['Geist Weiß'],quantity=1)
        self.change(action='book',transaction_id='tx1',component_id=ids['Geist Weiß'],quantity=1)
        part=next(p for p in self.state()['products'][0]['components'] if p['id']==ids['Geist Weiß'])
        self.assertEqual(part['stock'],0)


if __name__=='__main__':
    unittest.main()
