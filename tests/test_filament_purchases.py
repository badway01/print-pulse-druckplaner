"""Regression tests: screenshot/text import, catalog review, orders and partial receipts."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('purchase_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
mod=app.filament_purchases

def line(color='Jade-Weiß',code='10100',qty=3,price=3178,material='PLA Basic'):
    return {'brand':'Bambu Lab','material':material,'color':color,'manufacturer_code':code,
            'internal_code':'','color_hex':'','quantity':qty,'grams':1000,
            'packaging':'spool','gross_cents':price,'description':'','filament_id':None,
            'accept_changes':[]}

def payload(lines,**kw):
    body={'action':'create','vendor':'Bambu Lab','reference':'','ordered_on':'2026-10-29',
         'total_cents':sum(l['gross_cents'] or 0 for l in lines),
         'discount_cents':0,'credit_cents':0,'shipping_cents':0,
         'source_type':'manual','fingerprint':'','lines':lines}
    body.update(kw)
    return body

class FilamentPurchases(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()
    def tearDown(self):self.temp.cleanup()

    def create(self,data):
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            return mod.create(db,data)
    def receipt(self,order_id,lines,key):
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            return mod.receive(db,{'order_id':order_id,'request_key':key,'lines':lines})
    def state(self):
        with app.connect() as db:return mod.overview(db)
    def spools(self):return app.filament_overview()['filaments']

    def test_long_image_is_split_without_losing_pixels(self):
        """Tall screenshots must become short OCR images in their original order."""
        from io import BytesIO
        from PIL import Image, ImageDraw, ImageChops
        original=Image.new('RGB',(804,6794),'white')
        painter=ImageDraw.Draw(original)
        for i in range(12):
            y=180+i*475
            painter.rectangle((40,y,720,y+35),fill='black')
            painter.text((48,y+48),f'PLA Basic - item {i+1:02d}',fill='black')
        path=Path(self.temp.name)/'long.png'
        original.save(path)
        tiles=mod.tall_screenshot_tiles(path)
        self.assertGreaterEqual(len(tiles),4)
        rebuilt=Image.new('RGB',original.size)
        offset=0
        for raw in tiles:
            with Image.open(BytesIO(raw)) as tile:
                self.assertEqual(tile.width,804)
                self.assertLessEqual(tile.height,1700)
                rebuilt.paste(tile,(0,offset))
                offset+=tile.height
        self.assertEqual(offset,6794)
        self.assertIsNone(ImageChops.difference(original,rebuilt).getbbox())
        normal=Image.new('RGB',(900,900),'white')
        short=Path(self.temp.name)/'short.png'
        normal.save(short)
        self.assertEqual(mod.tall_screenshot_tiles(short),[])

    def test_bambu_text_and_gift(self):
        content='''Bambu Lab EU Bestellbestätigung
        PLA Basic x 3
        Jade-Weiß (10100) / Filament mit Spule / 1 kg
        Filament-Großverkauf -€28.19 EUR €31.78 EUR €59.97 EUR
        PLA Matte x 2
        Elfenbeinweiß (11100) / Filament mit Spule / 1 kg
        Filament-Großverkauf -€18.79 EUR €21.19 EUR €39.98 EUR
        PETG Matte x 1
        White(35100) / Filament with spool / 1kg
        Geschenk €0.00 EUR'''
        with app.connect() as db:result=mod.parse_text(content,db)
        self.assertEqual([(x['quantity'],x['manufacturer_code'],x['gross_cents']) for x in result['items']],
                         [(3,'10100',3178),(2,'11100',2119),(1,'35100',0)])
        self.assertEqual(result['vendor'],'Bambu Lab')


    def test_bambu_order_details_screenshot_ocr(self):
        # This is the observed OCR layout of the tall Bambu order page:
        # material heading, then color/code/packaging/quantity, then discounted total.
        text='''Bambu Lab EU
Fortschritt
PLA Basic
Jade-Weiß (10100) / Filament mit Spule /X3
PLA Basic
Schwarz (10101) / Filament mit Spule /X2

Zahlungsdetails
R @ PLABasic
Jade-Weiß (10100) / Filament mit Spule /1kg x3
Mengenrabatt -28,19€
31,78 €
PLA Basic
Schwarz (10101) / Filament mit Spule /1kg x2
Mengenrabatt -18,79€
21,19 €
R PLA Matte
Anthrazit (11101) / Filament mit Spule /1kg x2
Mengenrabatt -18,79€
21,19 €
PLA Matte
Elfenbeinweiß (11100) / Filament mit Spule /1kg x2
Mengenrabatt -18,79€
21,19 €
PLA Basic
Mistelzweig-Grün (10502) /Nachfüllung/1kg x1
Mengenrabatt -7,99€
9,00€
PLA Matte
Sakura-Rosa (11201) / Nachfüllung /1kg x1
Mengenrabatt -7,99€
9,00€
PLA Matte
Dunkelgrün (11501) / Nachfüllung /1kg x1
Mengenrabatt -7,99€
9,00€
PLA Basic
Bronze (10801) /Nachfüllung / 1kg x1
Mengenrabatt -7,99€
9,00€
PLA Basic
Kastanienrot (10205) /Nachfüllung /1kg x1
Mengenrabatt -7,99€
9,00€
PLA Matte
Aschgrau (11102) / Nachfüllung /1kg x1
Mengenrabatt -7,99€
9,00€
PLA Matte
Dunkelblau (11602) / Nachfüllung /1kg x1
Mengenrabatt -7,99€
9,00€
PETG Matte
White(35100) / Filament with spool /1kg x1
Geschenk
0,00 €
Zwischensumme 158,35 €
Gesamtsumme 137,24 €'''
        with app.connect() as db:
            result=mod.parse_text(text,db)
        found=result['items']
        self.assertEqual(len(found),12)
        self.assertEqual(sum(x['quantity'] for x in found),17)
        self.assertEqual([x['manufacturer_code'] for x in found],
           ['10100','10101','11101','11100','10502','11201',
            '11501','10801','10205','11102','11602','35100'])
        self.assertEqual(found[0]['color'],'Jade-Weiß')
        self.assertEqual(found[0]['material'],'PLA Basic')
        self.assertEqual((found[0]['quantity'],found[0]['gross_cents']),(3,3178))
        self.assertEqual((found[2]['quantity'],found[2]['gross_cents']),(2,2119))
        self.assertEqual(found[4]['packaging'],'refill')
        self.assertEqual(found[-1]['gross_cents'],0)
        self.assertEqual(sum(x['gross_cents'] for x in found),15835)
        self.assertFalse(any('Nur ' in w for w in result['warnings']))

    def test_incomplete_order_details_has_visible_warning(self):
        text='''Bambu Lab
Zahlungsdetails
PLA Basic
Jade-Weiß (10100) / Filament mit Spule /1kg x3
31,78€
PLA Matte
Anthrazit (11101) / Filament mit Spule /1kg x2
21,19€
PLA Basic
Schwarz (10101) / Filament mit Spule /1kg
21,19€
Zwischensumme 74,16€'''
        with app.connect() as db:
            result=mod.parse_text(text,db)
        self.assertEqual(len(result['items']),2)
        self.assertTrue(any('2 von mindestens 3' in x for x in result['warnings']))

    def test_order_saved_without_stock_and_partial_receipt(self):
        id=self.create(payload([line()]))
        self.assertEqual(len(self.spools()),1)
        self.assertEqual(self.spools()[0]['stock_qty'],0)
        first=self.state()['orders'][0]['lines'][0]
        self.receipt(id,[{'id':first['id'],'quantity':2,'expected_received':0}],'receipt-request-000001')
        self.assertEqual(self.spools()[0]['stock_qty'],2)
        self.assertEqual(self.spools()[0]['price_cents'],1059)
        self.assertEqual(self.state()['orders'][0]['status'],'Teilweise erhalten')
        # Repeated HTTP request id must never increase stock twice.
        self.receipt(id,[{'id':first['id'],'quantity':2,'expected_received':0}],'receipt-request-000001')
        self.assertEqual(self.spools()[0]['stock_qty'],2)
        with self.assertRaisesRegex(ValueError,'zwischenzeitlich'):
            self.receipt(id,[{'id':first['id'],'quantity':1,'expected_received':0}],'receipt-request-000002')
        self.receipt(id,[{'id':first['id'],'quantity':1,'expected_received':2}],'receipt-request-000003')
        self.assertEqual(self.spools()[0]['stock_qty'],3)
        self.assertEqual(self.state()['orders'][0]['status'],'Erhalten')

    def test_free_roll_does_not_zero_existing_last_price(self):
        app.filament_mutate({'action':'save','brand':'Bambu Lab','material':'PETG Matte',
           'color':'White','manufacturer_code':'35100','internal_code':'',
           'stock_qty':2,'color_hex':'#ffffff','price':'14,50','purchase_url':''})
        id=self.create(payload([line('White','35100',1,0,'PETG Matte')]))
        item=self.state()['orders'][0]['lines'][0]
        self.receipt(id,[{'id':item['id'],'quantity':1,'expected_received':0}],'receipt-request-gift01')
        self.assertEqual((self.spools()[0]['stock_qty'],self.spools()[0]['price_cents']),(3,1450))
        with app.connect() as db:
            self.assertEqual(db.execute('SELECT cost_cents FROM pp_filament_cost_history').fetchone()[0],0)

    def test_manual_catalog_review_preserves_old_code_until_accepted(self):
        app.filament_mutate({'action':'save','brand':'Bambu Lab','material':'PLA Matte',
           'color':'Kohleschwarz','manufacturer_code':'11101','internal_code':'3',
           'stock_qty':1,'color_hex':'#121212','price':'11,04','purchase_url':''})
        first=line('Anthrazit','11101',2,2119,'PLA Matte')
        id=self.create(payload([first]))
        self.assertEqual(self.spools()[0]['color'],'Kohleschwarz')
        self.assertEqual(self.spools()[0]['internal_code'],'3')
        first['accept_changes']=['color']
        id2=self.create(payload([first]))
        self.assertEqual(self.spools()[0]['color'],'Anthrazit')
        with app.connect() as db:
            edits=[dict(r) for r in db.execute('SELECT * FROM pp_filament_catalog_audit')]
            self.assertEqual(edits[0]['old_value'],'Kohleschwarz')
            self.assertEqual(edits[0]['new_value'],'Anthrazit')

    def test_money_and_discount_allocation_and_duplicate_document(self):
        entries=[line(qty=2,price=2000),line('PETG White','35100',1,0,'PETG Matte')]
        p=payload(entries,discount_cents=200,credit_cents=100,total_cents=1700,fingerprint='a'*64)
        id=self.create(p)
        with self.assertRaisesRegex(ValueError,'bereits importiert'):self.create(p)
        o=self.state()['orders'][0]
        self.assertEqual(o['lines'][0]['effective_cents'],1700)
        self.assertEqual(o['lines'][1]['effective_cents'],0)
        self.assertEqual(o['received_count'],0)

    def test_overreceipt_atomic(self):
        id=self.create(payload([line(qty=2,price=1000)]))
        item=self.state()['orders'][0]['lines'][0]
        with self.assertRaisesRegex(ValueError,'Mehr Rollen'):
            self.receipt(id,[{'id':item['id'],'quantity':3,'expected_received':0}],'receipt-request-over01')
        self.assertEqual(self.spools()[0]['stock_qty'],0)

if __name__=='__main__':unittest.main()
