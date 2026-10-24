"""Etsy import proposals: approved only, idempotent and stock-preserving."""
import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('import_lager',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

def record(lid,title,qty=9):
    return {'listing_id':int(lid),'title':title,'state':'active','quantity':qty}

def inventory(lid,qty=9):
    return {'products':[{'product_id':str(int(lid)+1000),'property_values':[],
                         'offerings':[{'quantity':qty,'is_enabled':True}]}]}

class EtsyImportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()
        app.STATUS.update(running=False,error=None,message='')
        app.apply_snapshot([(record('101','Bestand'),'', '',
                             [('101-default','101','1101','Standard','[]',9,1)],True)],[],set())
        with app.connect() as db:
            db.execute('UPDATE stock_items SET on_hand=4 WHERE listing_id=?',('101',))
            app.put_cfg(db,'shop_id','501')

    def tearDown(self):
        self.temp.cleanup()

    def stage(self):
        with app.connect() as db:
            app.save_import_candidates(db,[{'id':'101','title':'Bekannt'},
                                           {'id':'202','title':'Weihnachtsmann mit Mittelfinger'}],int(time.time()))

    def test_proposals_exclude_existing_and_preserve_stock(self):
        self.stage()
        self.assertEqual([x['id'] for x in app.import_overview()['items']],['202'])
        app.apply_snapshot(None,[],set())
        self.assertEqual([x['id'] for x in app.overview()['products']],['101'])
        self.assertEqual(app.overview()['products'][0]['items'][0]['on_hand'],4)

    def test_known_products_only_in_regular_catalog(self):
        def pages(endpoint,params=None):
            if params and params.get('state')=='active':
                return [record('101','Bestand'),record('202','Weihnachtsmann mit Mittelfinger')]
            return []
        def request(endpoint,params=None):
            if endpoint.endswith('/images'):return {'results':[]}
            if endpoint.endswith('/inventory'):return inventory('101')
            raise AssertionError('unexpected request '+endpoint)
        with patch.object(app,'pages',side_effect=pages),patch.object(app,'api_request',side_effect=request),patch.object(app.time,'sleep'):
            catalog,warning,candidates=app.fetch_catalog('501')
        self.assertFalse(warning)
        self.assertEqual([str(x[0]['listing_id']) for x in catalog],['101'])
        self.assertEqual([x['id'] for x in candidates],['202'])
        app.apply_snapshot(catalog,[],set(),candidates=candidates)
        self.assertEqual([x['id'] for x in app.import_overview()['items']],['202'])
        self.assertEqual(len(app.overview()['products']),1)

    def test_user_approves_then_import_is_duplicate_safe(self):
        self.stage()
        def request(endpoint,params=None):
            if endpoint=='/application/listings/202':return record('202','Weihnachtsmann mit Mittelfinger')
            if endpoint.endswith('/images'):return {'results':[]}
            if endpoint.endswith('/inventory'):return inventory('202',7)
            raise AssertionError(endpoint)
        with patch.object(app,'api_request',side_effect=request),patch.object(app.time,'sleep'):
            result=app.import_new_listings(['202'])
        self.assertEqual(result['imported'],1)
        self.assertEqual(result['count'],0)
        products=app.overview()['products']
        self.assertEqual({p['id'] for p in products},{'101','202'})
        original=next(p for p in products if p['id']=='101')
        new=next(p for p in products if p['id']=='202')
        self.assertEqual(original['items'][0]['on_hand'],4)
        self.assertIsNone(new['items'][0]['on_hand'])
        self.assertEqual(new['items'][0]['etsy_qty'],7)
        with self.assertRaisesRegex(ValueError,'nicht mehr aktuell'):
            app.import_new_listings(['202'])
        self.assertEqual(len(app.overview()['products']),2)

    def test_fails_without_valid_variants_and_keeps_proposal(self):
        self.stage()
        def request(endpoint,params=None):
            if endpoint=='/application/listings/202':return record('202','Weihnachtsmann mit Mittelfinger')
            if endpoint.endswith('/images'):return {'results':[]}
            if endpoint.endswith('/inventory'):return {'products':[]}
            raise AssertionError(endpoint)
        with patch.object(app,'api_request',side_effect=request),patch.object(app.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'nicht möglich'):
                app.import_new_listings(['202'])
        self.assertEqual(app.import_overview()['count'],1)
        self.assertEqual(len(app.overview()['products']),1)

    def test_manual_scan_finds_missing_and_clears_stale_proposals(self):
        self.stage()
        with patch.object(app,'pages',return_value=[record('101','Bekannt')]):
            result=app.scan_new_listings()
        self.assertEqual(result['count'],0)
        self.assertGreater(result['last_scan'],0)

if __name__=='__main__':
    unittest.main()
