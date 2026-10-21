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
        second=self.add(brand='Bambu',material='PLA Basic',color='Schwarz')
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

    def test_schema_migrates_without_touching_stock_and_is_idempotent(self):
        with app.connect() as db:
            db.execute("INSERT INTO config(k,value) VALUES('sentinel','kept')")
        self.add()
        app.init_db()
        with app.connect() as db:
            self.assertEqual(app.cfg(db,'sentinel'),'kept')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM filament_spools').fetchone()[0],1)


if __name__=='__main__':unittest.main()
