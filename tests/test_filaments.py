"""Local manual filament inventory and shopping list regression tests."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name

spec=importlib.util.spec_from_file_location('filament_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class FilamentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()

    def tearDown(self):
        self.temp.cleanup()

    def add(self,**overrides):
        data={'action':'save','id':None,'brand':'Bambu Lab','color':'Weiß','material':'PLA Matte',
              'color_hex':'#ffffff','stock_qty':1,'price':'19,90','purchase_url':'https://example.com/pla'}
        data.update(overrides)
        app.filament_mutate(data)
        return app.filament_overview()['filaments'][0]['id']

    def test_add_edit_cart_and_received(self):
        id=self.add()
        for _ in range(2):app.filament_mutate({'action':'cart','id':id,'delta':1})
        result=app.filament_overview()
        self.assertEqual((result['cart_count'],result['cart_known_total_cents']),(2,3980))
        self.assertEqual(result['filaments'][0]['stock_qty'],1)
        app.filament_mutate({'action':'receive','id':id})
        result=app.filament_overview()
        self.assertEqual((result['filaments'][0]['stock_qty'],result['cart_count']),(3,0))
        self.assertEqual(result['filaments'][0]['price_cents'],1990)
        app.filament_mutate({'action':'save','id':id,'brand':'Bambu Lab',
          'color':'Eisblau','material':'PLA','color_hex':'#aabbcc','stock_qty':2,
          'price':'14,5','purchase_url':'https://example.com/another'})
        self.assertEqual(app.filament_overview()['filaments'][0]['color'],'Eisblau')
        app.filament_mutate({'action':'delete','id':id})
        self.assertEqual(app.filament_overview()['filaments'],[])

    def test_cart_underflow_and_receive_without_order(self):
        id=self.add()
        with self.assertRaises(ValueError):app.filament_mutate({'action':'cart','id':id,'delta':-1})
        with self.assertRaises(ValueError):app.filament_mutate({'action':'receive','id':id})
        self.assertEqual(app.filament_overview()['cart_count'],0)


    def test_duplicate_names_normalized_and_brands(self):
        self.add(brand='Bambu',material='PLA Basic',color='Jade-Weiß')
        rows=app.filament_overview()['filaments']
        self.assertEqual(rows[0]['brand'],'Bambu Lab')
        for near in ['jadeweiß','JADE - WEISS','Jade White']:
            with self.subTest(name=near),self.assertRaisesRegex(ValueError,'bereits vorhanden'):
                self.add(brand='bambu lab',material='PLA Basic',color=near)
        self.assertEqual(len(app.filament_overview()['filaments']),1)
        # Different manufacturer or material remains a distinct stock item.
        self.add(brand='SUNLU',material='PLA Basic',color='Jadeweiß')
        self.add(brand='Bambu Lab',material='PLA Matte',color='Jadeweiß')
        self.assertEqual(len(app.filament_overview()['filaments']),3)

    def test_duplicate_edit_protection(self):
        first=self.add(brand='Bambu',material='PLA Basic',color='Jadeweiß')
        self.add(brand='Bambu',material='PLA Basic',color='Schwarz')
        second=next(row['id'] for row in app.filament_overview()['filaments'] if row['color']=='Schwarz')
        request={'action':'save','id':second,'brand':'Bambu Lab','material':'PLA Basic',
                 'color':'Jade-Weiß','color_hex':'#ffffff','stock_qty':3,
                 'price':'19,00','purchase_url':''}
        with self.assertRaisesRegex(ValueError,'bereits vorhanden'):
            app.filament_mutate(request)
        self.assertEqual(len(app.filament_overview()['filaments']),2)
        # Same entry can still be updated without triggering a false positive.
        request['id']=first
        app.filament_mutate(request)
        self.assertEqual(len(app.filament_overview()['filaments']),2)

    def test_price_and_link_safety(self):
        for invalid in ['javascript:alert(1)','http://example.org','https://user:pass'+chr(64)+'example.org']:
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):self.add(purchase_url=invalid)
        for invalid in ['-1','20.999','19e3','1;DROP TABLE']:
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):self.add(price=invalid)
        id=self.add(price='',purchase_url='')
        self.assertIsNone(app.filament_overview()['filaments'][0]['price_cents'])
        app.filament_mutate({'action':'cart','id':id,'delta':1})
        self.assertEqual(app.filament_overview()['cart_missing_prices'],1)

    def test_open_spool_moves_one_full_to_open_without_weighing(self):
        id=self.add(stock_qty=3,price='14,50')
        app.filament_mutate({'action':'open','id':id})
        app.filament_mutate({'action':'open','id':id})
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['stock_qty'],row['open_qty'],row['price_cents']),(1,2,1450))
        app.filament_mutate({'action':'empty','id':id})
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['stock_qty'],row['open_qty']),(1,1))
        app.filament_mutate({'action':'cart','id':id,'delta':1})
        app.filament_mutate({'action':'receive','id':id})
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['stock_qty'],row['open_qty'],row['cart_qty']),(2,1,0))

    def test_opening_empty_and_invalid_counts_are_rejected_atomically(self):
        id=self.add(stock_qty=1)
        with self.assertRaisesRegex(ValueError,'angeb(rochene|rochen)'):
            app.filament_mutate({'action':'empty','id':id})
        app.filament_mutate({'action':'open','id':id})
        with self.assertRaisesRegex(ValueError,'volle'):
            app.filament_mutate({'action':'open','id':id})
        app.filament_mutate({'action':'empty','id':id})
        with self.assertRaises(ValueError):
            app.filament_mutate({'action':'empty','id':id})
        self.assertEqual((app.filament_overview()['filaments'][0]['stock_qty'],
                          app.filament_overview()['filaments'][0]['open_qty']),(0,0))

    def test_manual_open_count_and_existing_client_preserve_open_spools(self):
        id=self.add(stock_qty=2,open_qty=3)
        self.assertEqual(app.filament_overview()['filaments'][0]['open_qty'],3)
        app.filament_mutate({'action':'save','id':id,'brand':'Bambu Lab',
            'color':'Weiß','material':'PLA Matte','color_hex':'#ffffff',
            'stock_qty':1,'price':'19,90','purchase_url':''})
        self.assertEqual(app.filament_overview()['filaments'][0]['open_qty'],3)
        for invalid in (-1,True,'4',100001):
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):
                app.filament_mutate({'action':'save','id':id,'brand':'Bambu Lab',
                    'color':'Weiß','material':'PLA Matte','color_hex':'#ffffff',
                    'stock_qty':1,'open_qty':invalid,'price':'19,90','purchase_url':''})
        app.filament_mutate({'action':'save','id':id,'brand':'Bambu Lab',
            'color':'Weiß','material':'PLA Matte','color_hex':'#ffffff',
            'stock_qty':1,'open_qty':5,'price':'19,90','purchase_url':''})
        self.assertEqual(app.filament_overview()['filaments'][0]['open_qty'],5)
        app.init_db()
        self.assertEqual(app.filament_overview()['filaments'][0]['open_qty'],5)

    def test_internal_shade_codes_preserve_trailing_digits_and_stock(self):
        codes=[('Grundweiß','2'),('Jadeweiß','2.1'),('Elfenbeinweiß','2.2'),
               ('Naturweiß','2.10'),('Beige','3'),('Warmweiß','2,11')]
        for color,code in codes:
            self.add(color=color,internal_code=code,stock_qty=2,open_qty=1)
        rows={r['color']:r for r in app.filament_overview()['filaments']}
        self.assertEqual({k:r['internal_code'] for k,r in rows.items()},
                         {'Grundweiß':'2','Jadeweiß':'2.1',
                          'Elfenbeinweiß':'2.2','Naturweiß':'2.10',
                          'Beige':'3','Warmweiß':'2.11'})
        self.assertNotEqual(rows['Jadeweiß']['internal_code'],rows['Naturweiß']['internal_code'])
        app.init_db()  # Update must never rewrite stored codes or stocks.
        after={r['color']:r for r in app.filament_overview()['filaments']}
        for color,_ in codes:
            self.assertEqual((after[color]['internal_code'],after[color]['stock_qty'],
                              after[color]['open_qty']),
                             (rows[color]['internal_code'],2,1))

    def test_internal_shade_code_rejects_invalid_without_changing_stock(self):
        self.add(color='Basisweiß',internal_code='2.1',stock_qty=3)
        before=app.filament_overview()['filaments'][0]
        for code in ('2..1','2.','2,','2.1.2','abc','2a','-1','2 1','2/1'):
            with self.subTest(code=code),self.assertRaisesRegex(ValueError,'Interner Farbcode'):
                self.add(color='Ungültig-'+code,internal_code=code,stock_qty=9)
        after=app.filament_overview()['filaments']
        self.assertEqual(len(after),1)
        self.assertEqual((after[0]['internal_code'],after[0]['stock_qty']),
                         (before['internal_code'],3))

    def test_last_full_roll_automatically_adds_exactly_one_to_cart(self):
        fid=self.add(color='Marineblau',stock_qty=2,open_qty=0)
        app.filament_mutate({'action':'open','id':fid})
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['stock_qty'],row['open_qty'],row['cart_qty']),(1,1,0))
        app.filament_mutate({'action':'open','id':fid})
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['stock_qty'],row['open_qty'],row['cart_qty']),(0,2,1))
        self.assertEqual(app.filament_overview()['cart_count'],1)
        # Emptying an already-open spool must not keep adding cart entries.
        app.filament_mutate({'action':'empty','id':fid})
        self.assertEqual(app.filament_overview()['filaments'][0]['cart_qty'],1)
        with self.assertRaisesRegex(ValueError,'Keine volle Rolle'):
            app.filament_mutate({'action':'open','id':fid})
        self.assertEqual(app.filament_overview()['filaments'][0]['cart_qty'],1)

    def test_auto_cart_never_adds_to_an_existing_manual_shopping_quantity(self):
        fid=self.add(color='Marineblau',stock_qty=1,open_qty=0)
        app.filament_mutate({'action':'cart','id':fid,'delta':1})
        app.filament_mutate({'action':'cart','id':fid,'delta':1})
        app.filament_mutate({'action':'open','id':fid})
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['stock_qty'],row['open_qty'],row['cart_qty']),(0,1,2))
        self.assertEqual(app.filament_overview()['cart_count'],2)

    def test_manual_inventory_correction_to_zero_adds_one_but_not_twice(self):
        fid=self.add(color='Marineblau',stock_qty=2)
        before=app.filament_overview()['filaments'][0]
        payload={'action':'save','id':fid,'brand':before['brand'],
            'color':before['color'],'material':before['material'],
            'color_hex':before['color_hex'],'stock_qty':0,'open_qty':1,
            'price':'19,90','purchase_url':before['purchase_url']}
        app.filament_mutate(payload)
        result=app.filament_overview()
        self.assertEqual((result['filaments'][0]['stock_qty'],
                          result['filaments'][0]['cart_qty'],result['cart_count']),(0,1,1))
        app.filament_mutate(payload)
        self.assertEqual(app.filament_overview()['cart_count'],1)
        # Restocking and then running low once more keeps the existing entry.
        payload['stock_qty']=2
        app.filament_mutate(payload)
        payload['stock_qty']=0
        app.filament_mutate(payload)
        self.assertEqual(app.filament_overview()['cart_count'],1)

    def test_new_empty_filament_does_not_create_an_unrequested_purchase(self):
        self.add(color='Marineblau',stock_qty=0,open_qty=1)
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['stock_qty'],row['open_qty'],row['cart_qty']),(0,1,0))

    def test_schema_migrates_without_touching_stock_and_is_idempotent(self):
        with app.connect() as db:
            db.execute("INSERT INTO config(k,value) VALUES('sentinel','kept')")
        self.add()
        app.init_db()
        with app.connect() as db:
            self.assertEqual(app.cfg(db,'sentinel'),'kept')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM filament_spools').fetchone()[0],1)


if __name__=='__main__':unittest.main()
