"""Unit/integration tests use synthetic Etsy data; no real shop identifiers."""
import importlib.util
import io
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

APP_FILE = Path(__file__).resolve().parents[1] / 'print_pulse_druckplaner' / 'app.py'

class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        with patch.dict(os.environ, {'PP_DATA_DIR': self.tmp.name}):
            spec=importlib.util.spec_from_file_location('production_test_module', APP_FILE)
            self.app=importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.app)
        self.app.init_db()
        self.app.INGRESS_PEER = '127.0.0.1'  # test-only binding, never changed in shipped app
        with self.app.connect() as db:
            self.app.put_cfg(db, 'shop_id', '42')
            self.app.put_cfg(db, 'keystring', 'dummy-not-real')
            self.app.put_cfg(db, 'shared_secret', 'dummy-not-real')
            self.app.put_cfg(db, 'callback', 'https://example.invalid/callback')
            self.app.put_cfg(db, 'refresh_token', 'dummy-not-real')
        self.api_patcher = patch.object(self.app, 'api_request', side_effect=self.mock_api)
        self.api_patcher.start()
        self.addCleanup(self.api_patcher.stop)
        self.title_patcher = patch.object(self.app, 'get_german_title', return_value='Musterprodukt')
        self.title_patcher.start()
        self.addCleanup(self.title_patcher.stop)

    def mock_api(self, endpoint, params=None, **kwargs):
        if endpoint.endswith('/receipts'):
            self.assertEqual(params['was_canceled'], 'false')
            return {'count':4,'results':[
                {'receipt_id':101,'status':'paid','was_shipped':False,'expected_ship_date':'2026-10-14','transactions':[
                    {'transaction_id':201,'listing_id':301,'title':'Example item','quantity':2,'variations':[{'formatted_name':'Color','formatted_value':'Black'}]}]},
                {'receipt_id':102,'status':'paid','was_shipped':False,'expected_ship_date':'2026-10-13','transactions':[
                    {'transaction_id':202,'listing_id':301,'title':'Example item','quantity':1,'variations':[{'formatted_name':'Color','formatted_value':'Black'}]}]},
                {'receipt_id':103,'status':'canceled','was_canceled':True,'transactions':[
                    {'transaction_id':203,'listing_id':302,'title':'Cancelled','quantity':1}]},
                {'receipt_id':104,'status':'fully_refunded','is_fully_refunded':True,'transactions':[
                    {'transaction_id':204,'listing_id':303,'title':'Refunded','quantity':1}]}
            ]}
        raise AssertionError(f'Unexpected API endpoint {endpoint}')

    def populate(self):
        result=self.app.pull_orders()
        self.assertEqual(result,(2,2,2,[]))

    def test_only_production_relevant_orders_are_included(self):
        self.populate()
        result=self.app.dashboard()
        self.assertEqual(result['orders'],2)
        self.assertEqual(result['open_units'],3)
        self.assertEqual(len(result['groups']),1)
        self.assertEqual(result['groups'][0]['due'],'2026-10-13')
        self.assertEqual(len(result['groups'][0]['lines']),2)
        self.assertNotIn('103', [l['receipt_id'] for g in result['groups'] for l in g['lines']])

    def test_sync_preserves_printed_units_and_manual_names(self):
        self.populate()
        key=self.app.dashboard()['groups'][0]['key']
        with self.app.connect() as db:
            db.execute('UPDATE lines SET produced=1 WHERE transaction_id=?',('201',))
            db.execute('INSERT INTO products(variant_key,short_name,printer) VALUES (?,?,?)',(key,'Lokaler Eigenname','P1S'))
        self.populate()
        state=self.app.dashboard()
        self.assertEqual(state['open_units'],2)
        self.assertEqual(state['groups'][0]['title'],'Lokaler Eigenname')

    def test_status_and_backup_never_return_credentials(self):
        self.populate()
        srv=ThreadingHTTPServer(('127.0.0.1',0),self.app.Handler)
        thread=threading.Thread(target=srv.serve_forever,daemon=True)
        thread.start()
        self.addCleanup(lambda:(srv.shutdown(),srv.server_close(),thread.join(timeout=2)))
        base=f'http://127.0.0.1:{srv.server_port}'
        for path in ('/api/status','/api/export'):
            with urlopen(base+path,timeout=5) as response:
                payload=json.load(response)
            content=json.dumps(payload)
            self.assertNotIn('dummy-not-real',content)
            self.assertNotIn('access_token',content)
            self.assertNotIn('refresh_token',content)
            self.assertNotIn('shared_secret',content)
        self.app.INGRESS_PEER='not-a-local-peer'
        from urllib.error import HTTPError
        with self.assertRaises(HTTPError) as exc:
            urlopen(base+'/api/status',timeout=5)
        self.assertEqual(exc.exception.code,403)

    def test_import_round_trip_and_invalid_payload_rejected(self):
        self.populate()
        with self.app.connect() as db:
            self.app.put_cfg(db,'last_sync','123')
        srv=ThreadingHTTPServer(('127.0.0.1',0),self.app.Handler)
        thread=threading.Thread(target=srv.serve_forever,daemon=True)
        thread.start()
        self.addCleanup(lambda:(srv.shutdown(),srv.server_close(),thread.join(timeout=2)))
        url=f'http://127.0.0.1:{srv.server_port}/api/import'
        key=self.app.dashboard()['groups'][0]['key']
        doc={'version':1,'orders':[{'receipt_id':'102','due_override':'2026-10-12'}],
             'progress':[{'transaction_id':'201','produced':1}],
             'products':[{'variant_key':key,'short_name':'Musterartikel','printer':'H2D'}]}
        req=Request(url, data=json.dumps(doc).encode(),headers={'Content-Type':'application/json'},method='POST')
        with urlopen(req,timeout=5) as result:
            self.assertEqual(json.load(result)['applied'], {'orders':1,'progress':1,'products':1})
        state=self.app.dashboard()
        self.assertEqual(state['open_units'],2)
        self.assertEqual(state['groups'][0]['title'],'Musterartikel')
        with self.app.connect() as db:
            self.assertEqual(db.execute('SELECT due_override FROM orders WHERE receipt_id=?',('102',)).fetchone()[0],'2026-10-12')
        bad=dict(doc)
        bad['progress']=[{'transaction_id':'201','produced':-2}]
        from urllib.error import HTTPError
        with self.assertRaises(HTTPError) as e:
            urlopen(Request(url,data=json.dumps(bad).encode(),headers={'Content-Type':'application/json'},method='POST'), timeout=5)
        self.assertEqual(e.exception.code,400)
        self.assertEqual(self.app.dashboard()['open_units'],2)

if __name__=='__main__':unittest.main()
