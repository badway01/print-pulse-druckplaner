"""Synthetic inventory, sync, migration and ingress tests. No live shop data."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('lager',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


def catalog(qty=50, variants=1):
    rows=[('101-default','101','201','Standard','[]',qty,1)]
    if variants==2:
        rows=[('101-white','101','201','Farbe: Weiß','[["1","11"]]',qty,1),('101-black','101','202','Farbe: Schwarz','[["1","12"]]',qty,1)]
    return [({'listing_id':101,'title':'Testprodukt','quantity':qty,'state':'active'},'', '', rows, True)]


def transaction(status='open',qty=2,tid='301',product='201',created=None):
    return (tid,'401','101',product,'[]',qty,created or int(time.time()),status)


class StockTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()
        app.STATUS.update(running=False,error=None,message='')
        app.apply_snapshot(catalog(),[],set())

    def tearDown(self): self.temp.cleanup()

    def item(self): return app.overview()['products'][0]['items'][0]

    def act(self,action,quantity=None,**more):
        data={'id':'101-default','action':action,**more}
        if quantity is not None:data['quantity']=quantity
        if action=='set':data.setdefault('revision',self.item()['revision'])
        app.mutate_stock(data)

    def test_etsy_quantity_never_becomes_stock(self):
        self.assertIsNone(self.item()['on_hand'])
        self.assertIsNone(self.item()['need'])
        self.act('set',3)
        app.apply_snapshot(catalog(999),[],set())
        self.assertEqual(self.item()['on_hand'],3)
        self.assertEqual(self.item()['etsy_qty'],999)

    def test_reservation_shipping_and_repeated_sync(self):
        self.act('set',5)
        app.apply_snapshot(catalog(),[transaction()],{'401'})
        self.assertEqual((self.item()['on_hand'],self.item()['reserved'],self.item()['free']),(5,2,3))
        for _ in range(3):app.apply_snapshot(catalog(),[transaction('shipped')],{'401'})
        self.assertEqual((self.item()['on_hand'],self.item()['reserved']),(3,0))

    def test_initial_historical_shipments_do_not_reduce_count(self):
        self.act('set',5)
        app.apply_snapshot(catalog(),[transaction('shipped')],{'401'})
        self.assertEqual(self.item()['on_hand'],5)
        self.assertEqual(self.item()['sold30'],2)

    def test_order_bought_and_shipped_between_syncs(self):
        self.act('set',5)
        with app.connect() as db:app.put_cfg(db,'stock_last_sync',int(time.time())-100)
        tx=transaction('shipped',created=int(time.time())-50)
        app.apply_snapshot(catalog(),[tx],{'401'})
        app.apply_snapshot(catalog(),[tx],{'401'})
        self.assertEqual(self.item()['on_hand'],3)

    def test_cancellation_and_removed_line_release_only(self):
        for status in ('excluded','review'):
            app.apply_snapshot(catalog(),[transaction()],{'401'})
            self.act('set',5)
            app.apply_snapshot(catalog(),[transaction(status)],{'401'})
            self.assertEqual((self.item()['on_hand'],self.item()['reserved']),(5,0))
        app.apply_snapshot(catalog(),[transaction()],{'401'})
        app.apply_snapshot(catalog(),[],{'401'})
        self.assertEqual(self.item()['reserved'],0)
        self.assertEqual(self.item()['on_hand'],5)

    def test_short_stock_shipment_warns_and_clamps(self):
        self.act('set',1)
        app.apply_snapshot(catalog(),[transaction()],{'401'})
        app.apply_snapshot(catalog(),[transaction('shipped')],{'401'})
        self.assertEqual(self.item()['on_hand'],0)
        self.assertIn('nachzählen',self.item()['notice'])

    def test_print_finish_cancel_and_undo(self):
        self.act('set',1)
        self.act('printing',5)
        self.assertEqual(self.item()['need'],0)
        self.act('finish',4)
        self.assertEqual((self.item()['on_hand'],self.item()['in_print']),(5,1))
        self.act('cancel',1)
        app.undo_action(app.overview()['undo'])
        self.assertEqual(self.item()['in_print'],1)
        with self.assertRaises(ValueError):self.act('finish',2)
        self.assertEqual(self.item()['on_hand'],5)

    def test_undo_cannot_override_shipment(self):
        self.act('set',5)
        undo=app.overview()['undo']
        app.apply_snapshot(catalog(),[transaction()],{'401'})
        app.apply_snapshot(catalog(),[transaction('shipped')],{'401'})
        with self.assertRaises(ValueError):app.undo_action(undo)
        self.assertEqual(self.item()['on_hand'],3)

    def test_edit_revision_and_validation(self):
        self.act('set',2)
        revision=self.item()['revision']
        self.act('adjust',delta=1)
        with self.assertRaises(ValueError):self.act('set',0,revision=revision)
        for value in (-1,1.5,True,'2',None):
            with self.assertRaises(ValueError):self.act('set',value)
        self.assertEqual(self.item()['on_hand'],3)

    def test_parallel_plus_is_atomic(self):
        self.act('set',0)
        errors=[]
        def increment():
            try:self.act('adjust',delta=1)
            except Exception as e:errors.append(e)
        threads=[threading.Thread(target=increment) for _ in range(15)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertFalse(errors)
        self.assertEqual(self.item()['on_hand'],15)

    def test_variants_and_product_id_change(self):
        app.apply_snapshot(catalog(50,2),[transaction(product='201')],{'401'})
        byid={i['id']:i for i in app.overview()['products'][0]['items']}
        # Retired default and new white share a product id in this synthetic transition;
        # ambiguity is explicit, never silently booked against a different variant.
        self.assertEqual(app.overview()['products'][0]['unmatched'],2)
        with app.connect() as db:db.execute("DELETE FROM stock_items WHERE id='101-default'")
        app.apply_snapshot(catalog(50,2),[transaction(product='202')],{'401'})
        byid={i['id']:i for i in app.overview()['products'][0]['items']}
        self.assertEqual(byid['101-black']['reserved'],2)
        self.assertEqual(byid['101-white']['reserved'],0)
        app.mutate_stock({'id':'101-white','action':'set','quantity':4,'revision':0})
        cat=catalog(50,2)
        row=cat[0][3][0]
        cat[0][3][0]=(*row[:2],'209',*row[3:])
        app.apply_snapshot(cat,[],set())
        byid={i['id']:i for i in app.overview()['products'][0]['items']}
        self.assertEqual(byid['101-white']['on_hand'],4)

    def test_recommendations_and_made_to_order(self):
        r=app.recommendation(3,1,2,7,12,2,7,False)
        self.assertEqual(r['need'],5)
        self.assertEqual(r['coverage'],1)
        self.assertEqual(app.recommendation(3,0,5,7,12,2,7,True)['need'],2)
        self.assertEqual(app.recommendation(0,0,0,0,0,2,7,True)['need'],0)
        self.assertEqual(app.recommendation(0,0,0,0,0,2,7,False,False)['need'],0)

    def test_sales_window_bestseller_and_idempotence(self):
        tx=transaction(qty=6)
        old=transaction(qty=80,tid='302',created=int(time.time())-32*86400)
        for _ in range(2):app.apply_snapshot(catalog(),[tx,old],{'401'})
        p=app.overview()['products'][0]
        self.assertEqual(p['sold30'],6)
        self.assertEqual(p['sold7'],6)
        self.assertTrue(p['bestseller'])

    def test_absent_catalog_not_recommended_but_stock_retained(self):
        self.act('set',2)
        app.apply_snapshot([],[],set())
        self.assertEqual(app.overview()['products'][0]['state'],'removed')
        self.assertEqual(self.item()['on_hand'],2)
        self.assertEqual(self.item()['need'],0)

    def test_api_inventory_failure_preserves_stock(self):
        self.act('set',5)
        cat=catalog()
        cat[0]=(cat[0][0],'','Bitte Etsy erneut verbinden.',[],False)
        app.apply_snapshot(cat,[],set(),'Berechtigung fehlt')
        self.assertEqual(self.item()['on_hand'],5)
        self.assertIn('verbinden',app.overview()['products'][0]['inventory_error'])

    def test_snapshot_rollback(self):
        self.act('set',3)
        cat=catalog(10)
        bad=({'title':'Bad'},'','',[],True)
        with self.assertRaises(KeyError):app.apply_snapshot(cat+[bad],[],set())
        self.assertEqual(self.item()['etsy_qty'],50)

    def test_migration_keeps_legacy_and_auth(self):
        with app.connect() as db:
            app.put_cfg(db,'keystring','synthetic-test')
            db.execute('CREATE TABLE legacy_test(value INTEGER)')
            db.execute('INSERT INTO legacy_test VALUES(7)')
        self.act('set',4)
        app.init_db()
        with app.connect() as db:
            self.assertEqual(app.cfg(db,'keystring'),'synthetic-test')
            self.assertEqual(db.execute('SELECT value FROM legacy_test').fetchone()[0],7)
        self.assertEqual(self.item()['on_hand'],4)

    def test_catalog_uses_inventory_properties_and_keeps_etsy_quantity_separate(self):
        listing={'listing_id':101,'title':'Test &amp; Artikel','quantity':99,'state':'active'}
        inventory={'products':[{'product_id':201,'property_values':[{'property_id':1,'property_name':'Farbe','value_ids':[11],'values':['Weiß']}], 'offerings':[{'quantity':8,'is_enabled':True},{'quantity':8,'is_enabled':True}]}]}
        def request(path,params=None):
            if path.endswith('/images'):return {'results':[]}
            if path.endswith('/inventory'):return inventory
            raise AssertionError(path)
        with patch.object(app,'pages',side_effect=lambda path,params:[listing] if params['state']=='active' else []),patch.object(app,'api_request',side_effect=request),patch.object(app.time,'sleep'):
            result,warning=app.fetch_catalog('501')
        self.assertFalse(warning)
        row=result[0][3][0]
        self.assertEqual(row[3],'Farbe: Weiß')
        self.assertEqual(row[5],8)  # Shared readiness offerings aren't summed.
        self.assertEqual(row[4],app.signature([{'property_id':1,'value_id':11}],True))
        app.apply_snapshot(result,[],set())
        product=app.overview()['products'][0]
        self.assertEqual(product['etsy_qty'],99)
        self.assertEqual(product['items'][0]['etsy_qty'],8)
        self.assertIsNone(product['items'][0]['on_hand'])

    def test_catalog_permission_fallback_is_visible(self):
        def paged(path,params=None):
            if path.endswith('/active'):return [{'listing_id':101,'title':'Test','quantity':50}]
            raise RuntimeError('Etsy API meldet HTTP 403')
        def request(path,params=None):
            if path.endswith('/images'):return {'results':[]}
            raise RuntimeError('Etsy API meldet HTTP 403')
        with patch.object(app,'pages',side_effect=paged),patch.object(app,'api_request',side_effect=request),patch.object(app.time,'sleep'):
            result,warning=app.fetch_catalog('501')
        self.assertIn('erneut verbinden',warning)
        self.assertFalse(result[0][4])
        self.assertIn('erneut verbinden',result[0][2])

    def test_fetch_verifies_missing_open_order_instead_of_assuming_shipped(self):
        self.act('set',4)
        app.apply_snapshot(catalog(),[transaction()],{'401'})
        receipt={'receipt_id':401,'status':'canceled','transactions':[{'transaction_id':301,'listing_id':101,'product_id':201,'quantity':2}]}
        with patch.object(app,'pages',return_value=[]),patch.object(app,'api_request',return_value=receipt) as request,patch.object(app.time,'sleep'):
            txs,rids=app.fetch_receipts('501')
        request.assert_called_once_with('/application/shops/501/receipts/401')
        app.apply_snapshot(catalog(),txs,rids)
        self.assertEqual(self.item()['on_hand'],4)
        self.assertEqual(self.item()['reserved'],0)

    def test_refunds_and_payment_status(self):
        self.assertEqual(app.receipt_status({'status':'paid','is_paid':True}),'open')
        self.assertEqual(app.receipt_status({'status':'paid','is_shipped':True}),'shipped')
        self.assertEqual(app.receipt_status({'status':'completed','refunds':[{}]}),'excluded')
        self.assertEqual(app.receipt_status({'status':'payment processing'}),'review')

    def test_no_etsy_write_api(self):
        with self.assertRaises(ValueError):app.api_request('/application/listings/101',method='PUT')

    def test_ingress_and_http_stock(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(server.server_port)
        try:
            with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(base+'/api/status')
            self.assertEqual(ctx.exception.code,403)
            with patch.object(app,'INGRESS_PEER','127.0.0.1'):
                response=urllib.request.urlopen(base+'/')
                self.assertIn("script-src 'self'",response.headers['Content-Security-Policy'])
                payload=json.dumps({'id':'101-default','action':'set','quantity':8,'revision':0}).encode()
                request=urllib.request.Request(base+'/api/stock',data=payload,headers={'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'})
                result=json.load(urllib.request.urlopen(request))
                self.assertEqual(result['products'][0]['items'][0]['on_hand'],8)
                request.add_header('Sec-Fetch-Site','cross-site')
                with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(request)
                self.assertEqual(ctx.exception.code,403)
        finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
