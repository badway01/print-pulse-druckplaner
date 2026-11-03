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

    def test_manufacturer_case_and_bambu_alias_reuse_one_catalog_color(self):
        """BAMBU, Bambu and Bambu Lab refer to the same PLA Basic Jade-Weiß."""
        first=line()
        first['brand']='bambu'
        first['material']='pla basic'
        a=self.create(payload([first]))
        second=line()
        second['brand']='BAMBU LAB'
        second['material']='PLA BASIC'
        b=self.create(payload([second]))
        third=line()
        third['brand']='Bambu'
        c=self.create(payload([third]))
        self.assertEqual(len(self.spools()),1)
        self.assertEqual(self.spools()[0]['brand'],'Bambu Lab')
        self.assertEqual(self.spools()[0]['material'],'PLA Basic')
        with app.connect() as db:
            linked={row['filament_id'] for row in db.execute(
                'SELECT filament_id FROM pp_filament_order_lines WHERE order_id IN (?,?,?)',(a,b,c))}
        self.assertEqual(len(linked),1)

    def test_known_position_prices_fill_missing_optional_order_total(self):
        p=payload([line('Synthetic Chestnut','129080',qty=1,price=900)],total_cents=None)
        oid=self.create(p)
        order=next(o for o in self.state()['orders'] if o['id']==oid)
        self.assertEqual(order['total_cents'],900)
        self.assertEqual(order['lines'][0]['gross_cents'],900)

    def test_castanienrot_discounted_refill_can_be_saved_and_received(self):
        source='''| PLA Basic x 1 | Kastanienrot (10205) / Nachfüllung / 1 kg |
                 Filament-Großverkauf -€7.99 EUR | €9.00 EUR | €16.99 EUR |'''
        with app.connect() as db:
            parsed=mod.parse_text(source,db)
        self.assertEqual(parsed['vendor'],'Bambu Lab')
        self.assertEqual(len(parsed['items']),1)
        entry=parsed['items'][0]
        self.assertEqual((entry['color'],entry['manufacturer_code'],entry['quantity']),
                         ('Kastanienrot','10205',1))
        self.assertEqual((entry['packaging'],entry['gross_cents']),('refill',900))
        body=payload([entry],vendor='Bambu Lab',total_cents=900)
        oid=self.create(body)
        saved=self.state()['orders'][0]
        self.assertEqual(saved['vendor'],'Bambu Lab')
        self.assertEqual(saved['lines'][0]['effective_cents'],900)
        self.receipt(oid,[{'id':saved['lines'][0]['id'],'quantity':1,'expected_received':0}],
                     'synthetic-refill-10205')
        result=self.state()['orders'][0]
        self.assertEqual(result['status'],'Erhalten')
        self.assertEqual((result['ordered_count'],result['received_count']),(1,1))
        self.assertEqual(self.spools()[0]['price_cents'],900)

    def test_missing_purchase_cost_can_be_completed_without_rebooking(self):
        raw=line('Synthetic Berry','129099',qty=3,price=None)
        oid=self.create(payload([raw],vendor='Unbekannter Händler',total_cents=None))
        part=self.state()['orders'][0]['lines'][0]
        self.receipt(oid,[{'id':part['id'],'quantity':2,'expected_received':0}],
                     'unknown-cost-receipt-a01')
        self.receipt(oid,[{'id':part['id'],'quantity':1,'expected_received':2}],
                     'unknown-cost-receipt-b02')
        initial=self.spools()[0]['stock_qty']
        self.assertEqual(initial,3)
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            mod.complete_missing_purchase_data(db,{
                'order_id':oid,'vendor':'Bambu Lab',
                'lines':[{'id':part['id'],'gross_cents':3178,'expected_gross_cents':None}]
            })
        result=self.state()['orders'][0]
        self.assertEqual(result['vendor'],'Bambu Lab')
        self.assertEqual(result['total_cents'],3178)
        self.assertEqual(result['lines'][0]['effective_cents'],3178)
        self.assertEqual(self.spools()[0]['stock_qty'],initial,
                         'Missing prices cannot cause another inventory receipt')
        with app.connect() as db:
            costs=[row[0] for row in db.execute(
                'SELECT cost_cents FROM pp_filament_cost_history ORDER BY id')]
        self.assertEqual(sum(costs),3178)
        self.assertEqual(costs,[2119,1059])
        with self.assertRaisesRegex(ValueError,'Vorhandene Einkaufspreise'):
            with app.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                mod.complete_missing_purchase_data(db,{
                    'order_id':oid,'vendor':'Bambu Lab',
                    'lines':[{'id':part['id'],'gross_cents':3200,'expected_gross_cents':3178}]
                })
        self.assertEqual(self.spools()[0]['stock_qty'],initial)

    def test_internal_code_cannot_be_duplicated_on_new_color(self):
        original=line('Synthetic Red','129088',qty=1,price=900)
        original['internal_code']='26'
        self.create(payload([original]))
        duplicate=line('Synthetic Blue','129089',qty=1,price=900)
        duplicate['internal_code']='26'
        with self.assertRaisesRegex(ValueError,'gehört bereits zur Farbe'):
            self.create(payload([duplicate]))
        self.assertEqual(len(self.spools()),1)

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

    def test_wrong_one_roll_corrected_to_three_before_receipt(self):
        """Regression: Jade-Weiß 10100, 3 rolls for 31.78 EUR, not 1 roll at 31.78."""
        original=self.create(payload([line(qty=1,price=3178)]))
        before=self.state()['orders'][0]['lines'][0]
        self.assertEqual((before['quantity'],before['remaining'],before['gross_cents']),(1,1,3178))
        self.assertEqual(self.spools()[0]['stock_qty'],0)

        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            mod.correct_quantity(db,{'order_id':original,'line_id':before['id'],
                                     'quantity':3,'expected_quantity':1})
        corrected=self.state()['orders'][0]
        self.assertEqual((corrected['ordered_count'],corrected['received_count']),(3,0))
        self.assertEqual((corrected['lines'][0]['quantity'],corrected['lines'][0]['remaining']),(3,3))
        self.assertEqual(corrected['lines'][0]['effective_cents'],3178)
        self.assertEqual(self.spools()[0]['stock_qty'],0,
                         'correcting the order must never change actual stock')
        with self.assertRaisesRegex(ValueError,'zwischenzeitlich'):
            with app.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                mod.correct_quantity(db,{'order_id':original,'line_id':before['id'],
                                         'quantity':2,'expected_quantity':1})
        with self.assertRaisesRegex(ValueError,'ungültiger Wert'):
            with app.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                mod.correct_quantity(db,{'order_id':original,'line_id':before['id'],
                                         'quantity':0,'expected_quantity':3})

        self.receipt(original,[{'id':before['id'],'quantity':2,'expected_received':0}],
                     'three-roll-partial-receipt-0001')
        state=self.state()['orders'][0]
        self.assertEqual((state['received_count'],state['lines'][0]['remaining']),(2,1))
        self.assertEqual(self.spools()[0]['stock_qty'],2)
        with app.connect() as db:
            first=db.execute('SELECT cost_cents FROM pp_filament_cost_history').fetchone()[0]
        self.assertEqual(first,2119, 'two of three rolls must receive 21.19 EUR of 31.78 EUR')
        self.receipt(original,[{'id':before['id'],'quantity':2,'expected_received':0}],
                     'three-roll-partial-receipt-0001')
        self.assertEqual(self.spools()[0]['stock_qty'],2,'retry must not double-book')
        with self.assertRaisesRegex(ValueError,'gesperrt'):
            with app.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                mod.correct_quantity(db,{'order_id':original,'line_id':before['id'],
                                         'quantity':4,'expected_quantity':3})
        self.receipt(original,[{'id':before['id'],'quantity':1,'expected_received':2}],
                     'three-roll-final-receipt-0002')
        self.assertEqual(self.state()['orders'][0]['status'],'Erhalten')
        self.assertEqual(self.spools()[0]['stock_qty'],3)
        with app.connect() as db:
            costs=[r[0] for r in db.execute(
                'SELECT cost_cents FROM pp_filament_cost_history ORDER BY id')]
        self.assertEqual(costs,[2119,1059])
        self.assertEqual(sum(costs),3178)
        self.assertEqual(self.delete(original,3)['reversed_spools'],3)
        self.assertEqual(self.spools()[0]['stock_qty'],0)
        self.assertEqual(self.state()['orders'],[])

    def delete(self,order_id,expected=None):
        with app.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            data={'order_id':order_id}
            if expected is not None:data['expected_received_count']=expected
            return mod.delete_order(db,data)

    def test_delete_unreceived_order_without_changing_inventory(self):
        oid=self.create(payload([line()]))
        before=self.spools()[0]
        self.assertEqual(before['stock_qty'],0)
        result=self.delete(oid,0)
        self.assertEqual(result['reversed_spools'],0)
        self.assertEqual(self.state()['orders'],[])
        self.assertEqual(self.spools()[0]['stock_qty'],0)

    def test_delete_received_order_restores_manual_catalog_price(self):
        app.filament_mutate({'action':'save','brand':'Bambu Lab','material':'PLA Basic',
            'color':'Jade-Weiß','manufacturer_code':'10100','internal_code':'',
            'stock_qty':2,'color_hex':'#dedede','price':'14,50','purchase_url':''})
        oid=self.create(payload([line()]))
        row=self.state()['orders'][0]['lines'][0]
        self.receipt(oid,[{'id':row['id'],'quantity':3,'expected_received':0}],'receipt-delete-baseline01')
        self.assertEqual((self.spools()[0]['stock_qty'],self.spools()[0]['price_cents']),(5,1059))
        deleted=self.delete(oid,3)
        self.assertEqual(deleted['reversed_spools'],3)
        self.assertEqual((self.spools()[0]['stock_qty'],self.spools()[0]['price_cents']),(2,1450))
        self.assertEqual(self.state()['orders'],[])

    def test_delete_second_order_recalculates_from_remaining_purchase(self):
        first=self.create(payload([line()]))
        one=self.state()['orders'][0]['lines'][0]
        self.receipt(first,[{'id':one['id'],'quantity':3,'expected_received':0}],'receipt-delete-order001')
        second=self.create(payload([line(qty=2,price=2200)]))
        two=next(o for o in self.state()['orders'] if o['id']==second)['lines'][0]
        self.receipt(second,[{'id':two['id'],'quantity':2,'expected_received':0}],'receipt-delete-order002')
        self.assertEqual((self.spools()[0]['stock_qty'],self.spools()[0]['price_cents']),(5,1100))
        self.delete(second,2)
        self.assertEqual((self.spools()[0]['stock_qty'],self.spools()[0]['price_cents']),(3,1059))
        self.delete(first,3)
        self.assertEqual(self.spools()[0]['stock_qty'],0)
        self.assertIsNone(self.spools()[0]['price_cents'])

    def test_delete_mixed_partial_receipt_and_stock_safety(self):
        oid=self.create(payload([line()]))
        l=self.state()['orders'][0]['lines'][0]
        self.receipt(oid,[{'id':l['id'],'quantity':2,'expected_received':0}],'receipt-delete-partial1')
        self.assertEqual(self.spools()[0]['stock_qty'],2)
        with self.assertRaisesRegex(ValueError,'zwischenzeitlich'):
            self.delete(oid,0)
        with app.connect() as db:
            db.execute('UPDATE filament_spools SET stock_qty=1')
        with self.assertRaisesRegex(ValueError,'negativen Lagerbestand'):
            self.delete(oid,2)
        self.assertEqual(len(self.state()['orders']),1)
        with app.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM pp_filament_cost_history').fetchone()[0],1)
            db.execute('UPDATE filament_spools SET stock_qty=2')
        self.delete(oid,2)
        self.assertEqual(self.spools()[0]['stock_qty'],0)

    def test_delete_keeps_later_manual_unit_price_override(self):
        oid=self.create(payload([line()]))
        l=self.state()['orders'][0]['lines'][0]
        self.receipt(oid,[{'id':l['id'],'quantity':3,'expected_received':0}],'receipt-delete-manualp')
        with app.connect() as db:
            db.execute('UPDATE filament_spools SET price_cents=1450')
        self.delete(oid,3)
        self.assertEqual(self.spools()[0]['price_cents'],1450)

if __name__=='__main__':unittest.main()
