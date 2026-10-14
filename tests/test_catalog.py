"""HTTP regressions for catalog, per-printer 3MF storage and additive upgrades."""
import hashlib
import io
import json
import threading
import unittest
import zipfile
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import test_production as production


class CatalogTests(production.ProductionTests):
    # Only inherit the fixture and its synthetic API, not the older test cases.
    def setUp(self):
        super().setUp()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), self.app.Handler)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (self.server.shutdown(), self.server.server_close(), thread.join(2)))
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def request(self, path, data=None, headers=None):
        if isinstance(data, dict):
            data = json.dumps(data).encode()
            headers = {'Content-Type': 'application/json', **(headers or {})}
        return urlopen(Request(self.base + path, data=data, headers=headers or {}), timeout=5)

    def create_product(self):
        with self.request('/api/catalog/save', {'title': 'Testprodukt', 'notes': 'PLA Basic'}) as r:
            return json.load(r)['id']

    def project(self, label='first'):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as z:
            z.writestr('[Content_Types].xml', '<Types/>')
            z.writestr('3D/3dmodel.model', '<model>' + label + '</model>')
        return data.getvalue()

    def upload(self, pid, printer='H2D', payload=None, **headers):
        return self.request('/api/file?' + urlencode({'product_id': pid, 'printer': printer, 'filename': 'projekt.3mf'}),
                            self.project() if payload is None else payload,
                            {'Content-Type': 'application/octet-stream', **headers})

    def test_upload_download_replace_per_printer_and_delete(self):
        pid = self.create_product()
        original = self.project()
        with self.upload(pid): pass
        with self.upload(pid, 'P1S Old'): pass
        changed = self.project('second')
        with self.upload(pid, payload=changed): pass
        for printer, expected in [('H2D', changed), ('P1S Old', original)]:
            with self.request('/api/file?' + urlencode({'product_id': pid, 'printer': printer})) as r:
                self.assertEqual(r.read(), expected)
                self.assertIn('attachment', r.headers['Content-Disposition'])
        self.app.init_db()  # normal app update/restart retains the binary files
        result = self.app.catalog_view()['products'][0]
        self.assertEqual(len(result['files']), 2)
        self.assertNotIn('content', json.dumps(result))
        self.assertEqual(next(f['sha256'] for f in result['files'] if f['printer']=='H2D'), hashlib.sha256(changed).hexdigest())
        with self.request('/api/file/delete', {'product_id': pid, 'printer': 'H2D'}): pass
        self.assertEqual(len(self.app.catalog_view()['products'][0]['files']), 1)

    def test_bad_upload_keeps_previous_file_and_rejects_cross_origin(self):
        pid = self.create_product()
        with self.upload(pid): pass
        for payload in (b'not a zip', b''):
            with self.assertRaises(HTTPError) as caught:
                self.upload(pid, payload=payload)
            self.assertEqual(caught.exception.code, 400)
        with self.assertRaises(HTTPError) as caught:
            self.upload(pid, **{'Sec-Fetch-Site':'cross-site'})
        self.assertEqual(caught.exception.code, 403)
        with self.assertRaises(HTTPError): self.upload(pid, '../../outside')
        with self.request('/api/file?' + urlencode({'product_id':pid,'printer':'H2D'})) as r:
            self.assertEqual(r.read(), self.project())
        self.app.INGRESS_PEER = 'denied'
        with self.assertRaises(HTTPError) as caught: self.upload(pid)
        self.assertEqual(caught.exception.code, 403)

    def test_catalog_survives_sync_and_local_name_wins(self):
        self.populate()
        pid = self.app.catalog_view()['products'][0]['id']
        with self.request('/api/catalog/save', {'id':pid,'title':'Mein Name','notes':'H2D PLA','listing_id':'301'}): pass
        with self.upload(pid): pass
        with patch.object(self.app, 'api_request', return_value={'count':1,'results':[{'listing_id':301,'title':'Etsy Name'}]}):
            self.assertEqual(self.app.pull_catalog(), 1)
        result=self.app.catalog_view()['products'][0]
        self.assertEqual(result['title'],'Mein Name')
        self.assertEqual(result['notes'],'H2D PLA')
        self.assertEqual(len(result['files']),1)
        with self.assertRaises(HTTPError):
            self.request('/api/catalog/save', {'title':'Duplicate','listing_id':'301'})

    def test_real_order_date_and_seen_state(self):
        now=int(self.app.time.time())
        self.populate()
        with self.app.connect() as db:
            db.execute('UPDATE orders SET created_at=?,first_seen=? WHERE receipt_id=?',(now,now,'101'))
        state=self.app.dashboard()
        self.assertEqual(state['new_today'],1)
        self.assertEqual(state['unseen_orders'],1)
        with self.request('/api/seen',{}): pass
        self.assertEqual(self.app.dashboard()['unseen_orders'],0)
        self.assertEqual(self.app.dashboard()['new_today'],1)

    def test_stage_persists_and_finished_group_returns_to_planned(self):
        self.populate()
        key=self.app.dashboard()['groups'][0]['key']
        with self.request('/api/stage',{'key':key,'stage':'printing'}): pass
        self.populate()
        self.assertEqual(self.app.dashboard()['groups'][0]['stage'],'printing')
        with self.request('/api/batch',{'key':key,'amount':3}): pass
        self.assertEqual(self.app.dashboard()['done_groups'][0]['stage'],'done')
        with self.request('/api/progress',{'transaction_id':'201','produced':1}): pass
        self.assertEqual(self.app.dashboard()['groups'][0]['stage'],'planned')

    def test_sync_uses_etsy_date_without_marking_initial_import_as_new(self):
        now=int(self.app.time.time())
        sample=self.mock_api('/application/shops/42/receipts', {'was_canceled':'false'})
        sample['results'][0]['create_timestamp']=now
        sample['results'][1]['create_timestamp']=now-7*86400
        with patch.object(self.app,'api_request',return_value=sample):
            self.app.pull_orders()
        state=self.app.dashboard()
        self.assertEqual(state['new_today'],1)
        self.assertEqual(state['unseen_orders'],0)
        sample['results'].append({'receipt_id':105,'status':'paid','create_timestamp':now,
            'transactions':[{'transaction_id':205,'listing_id':304,'title':'Another product','quantity':1}]})
        sample['count']=5
        with patch.object(self.app,'api_request',return_value=sample):
            self.app.pull_orders()
        self.assertEqual(self.app.dashboard()['unseen_orders'],1)
        self.assertEqual(self.app.dashboard()['new_today'],2)

    def test_upgrade_from_v06_preserves_counts_and_names(self):
        self.populate()
        key=self.app.dashboard()['groups'][0]['key']
        with self.app.connect() as db:
            db.execute("INSERT INTO products(variant_key,short_name,printer) VALUES(?,?,?)",(key,'Test Name','H2D'))
            db.execute("UPDATE lines SET produced=1 WHERE transaction_id='201'")
            db.execute('DROP TABLE product_files')
            db.execute('DROP TABLE catalog')
            db.execute('ALTER TABLE products DROP COLUMN stage')
            db.execute('ALTER TABLE orders DROP COLUMN created_at')
            db.execute('ALTER TABLE orders DROP COLUMN first_seen')
        self.app.init_db()
        self.app.init_db()
        state=self.app.dashboard()
        self.assertEqual(state['open_units'],2)
        self.assertEqual(state['groups'][0]['title'],'Test Name')
        self.assertEqual(state['unseen_orders'],0)
        self.assertEqual(len(self.app.catalog_view()['products']),1)

    def test_recommendation_reserves_once_and_consumes_finished_units(self):
        self.populate()
        g=self.app.dashboard()['groups'][0]
        pid=self.app.catalog_view()['products'][0]['id']
        with self.upload(pid): pass
        with self.request('/api/profile',{'product_id':pid,'printer':'H2D','capacity':2,'minutes':90,'slicer':'Bambu Studio'}): pass
        s=self.app.dashboard()['suggestions'][0]
        self.assertEqual((s['amount'],s['printer'],s['minutes']),(2,'H2D',90))
        self.assertTrue(s['has_file'])
        with self.request('/api/reserve',{'key':g['key'],'printer':'H2D','amount':2}): pass
        self.assertEqual(self.app.dashboard()['suggestions'],[])
        self.app.init_db()
        self.assertEqual(self.app.dashboard()['groups'][0]['reserved'],2)
        with self.assertRaises(HTTPError) as caught:
            self.request('/api/reserve',{'key':g['key'],'printer':'H2D','amount':2})
        self.assertEqual(caught.exception.code,400)
        with self.request('/api/batch',{'key':g['key'],'amount':2}): pass
        state=self.app.dashboard()
        self.assertEqual(state['groups'][0]['reserved'],0)
        self.assertEqual(state['suggestions'][0]['amount'],1)
        with self.request('/api/reserve',{'key':g['key'],'printer':'H2D','amount':1}): pass
        with self.request('/api/reservation/delete',{'key':g['key']}): pass
        self.assertEqual(self.app.dashboard()['suggestions'][0]['amount'],1)

    def test_reservations_follow_order_reduction_and_closure(self):
        self.populate()
        key=self.app.dashboard()['groups'][0]['key']
        with self.request('/api/reserve',{'key':key,'printer':'H2D','amount':3}): pass
        with self.app.connect() as db:
            db.execute("UPDATE orders SET active=0 WHERE receipt_id='102'")
            db.execute("UPDATE lines SET qty=1 WHERE transaction_id='201'")
        self.assertEqual(self.app.dashboard()['groups'][0]['reserved'],1)
        with self.request('/api/progress',{'transaction_id':'201','produced':1}): pass
        self.assertEqual(self.app.dashboard()['done_groups'][0]['reserved'],0)
        with self.request('/api/progress',{'transaction_id':'201','produced':0}): pass
        self.assertEqual(self.app.dashboard()['suggestions'][0]['available'],1)

    def test_profile_validation_and_printing_conflict(self):
        self.populate()
        key=self.app.dashboard()['groups'][0]['key']
        pid=self.app.catalog_view()['products'][0]['id']
        for capacity in (0,-1,True,1.5,5001):
            with self.assertRaises(HTTPError):
                self.request('/api/profile',{'product_id':pid,'printer':'H2D','capacity':capacity,'minutes':0,'slicer':'Bambu Studio'})
        with self.request('/api/stage',{'key':key,'stage':'printing'}): pass
        self.assertEqual(self.app.dashboard()['suggestions'],[])
        with self.assertRaises(HTTPError):
            self.request('/api/reserve',{'key':key,'printer':'H2D','amount':1})

# Do not run the inherited v0.6 regression suite a second time in this subclass.
for _name in list(production.ProductionTests.__dict__):
    if _name.startswith('test_') and _name not in CatalogTests.__dict__:
        setattr(CatalogTests, _name, None)
