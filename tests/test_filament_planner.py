"""Regression tests for read-only filament demand planning and safe cart updates."""
import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('pp_filament_test_app',
    Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class FilamentPlannerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()

    def tearDown(self):
        self.temp.cleanup()

    def add(self,color='Schwarz',stock=0,cart=0):
        app.filament_mutate({'action':'save','brand':'Bambu Lab',
            'color':color,'material':'PLA Basic','color_hex':'#080808',
            'stock_qty':stock,'price':'14,50','purchase_url':''})
        row=next(x for x in app.filament_overview()['filaments'] if x['color']==color)
        with app.connect() as db:
            db.execute('UPDATE filament_spools SET cart_qty=? WHERE id=?',(cart,row['id']))
        return row['id']

    def sale(self,lid='123',quantity=40,variant='Farbe: Schwarz',days_ago=2,status='shipped'):
        with app.connect() as db:
            db.execute("""INSERT OR IGNORE INTO pp_filament_sales
                (transaction_id,receipt_id,listing_id,variant_text,quantity,created,status,updated)
                VALUES(?,?,?,?,?,?,?,?)""",
                (str(time.time_ns()),'456',lid,variant,quantity,
                 int(time.time())-days_ago*86400,status,int(time.time())))

    def test_50g_per_unit_and_sales_history(self):
        fid=self.add()
        self.sale(quantity=40)
        with app.connect() as db:
            result=app.filament_planner.plan(db,14,60)
        f=result['suggestions'][0]
        self.assertEqual(f['id'],fid)
        self.assertEqual(f['historical_g'],2000)
        self.assertGreaterEqual(f['add_spools'],2)
        self.assertEqual(result['estimated_g_90'],2000)
        self.assertEqual(result['unassigned_count_90'],0)

    def test_multi_colour_splits_one_50g_total(self):
        self.add('Schwarz')
        self.add('Weiß')
        self.sale(quantity=2,variant='Farbe: Schwarz · Farbe 2: Weiß')
        with app.connect() as db:
            result=app.filament_planner.plan(db,14,60)
        self.assertEqual(sum(f['historical_g'] for f in result['suggestions']),100)

    def test_no_fabricated_colour_and_cancelled_excluded(self):
        self.add()
        self.sale(quantity=2,variant='Größe: 10 cm')
        self.sale(quantity=10,variant='Farbe: Schwarz',status='excluded')
        with app.connect() as db:
            result=app.filament_planner.plan(db)
        self.assertEqual(result['unassigned_count_90'],2)
        self.assertEqual(result['unassigned_g_90'],100)
        self.assertEqual(result['suggestions'],[])

    def test_real_print_weight_preferred(self):
        fid=self.add()
        now=int(time.time())
        with app.connect() as db:
            db.execute("""INSERT INTO stock_listings(id,title,image,state,updated)
               VALUES('123','Vase','','active',?)""",(now,))
            db.execute("""INSERT INTO pp_cost_profiles
                (listing_id,variant_id,printer,status,fields_json,materials_json,updated)
                VALUES('123','','H2D','approved','{"batch_units":2}',
                       ? ,?)""",('[{"filament_id":%d,"grams":400,"spool_g":1000}]'%fid,now))
        self.sale(quantity=3,variant='Größe: groß')
        with app.connect() as db:
            result=app.filament_planner.plan(db)
        self.assertEqual(result['exact_g_90'],600)
        self.assertEqual(result['estimated_g_90'],0)

    def test_explicit_opt_in_and_existing_cart_preserved(self):
        fid=self.add(cart=5)
        self.sale(quantity=100)
        with app.connect() as db:
            result=app.filament_planner.plan(db,14,60)
            snap={str(x['id']):x['cart_qty'] for x in db.execute('SELECT id,cart_qty FROM filament_spools')}
            self.assertEqual(result['current_cart'],5)
            self.assertEqual(db.execute('SELECT cart_qty FROM filament_spools').fetchone()[0],5)
            app.filament_planner.apply(db,[{'id':fid,'qty':2}],snap)
            self.assertEqual(db.execute('SELECT cart_qty FROM filament_spools').fetchone()[0],7)
            with self.assertRaisesRegex(ValueError,'geändert'):
                app.filament_planner.apply(db,[{'id':fid,'qty':2}],snap)

    def test_backfill_existing_does_not_destroy_transactions(self):
        self.add()
        now=int(time.time())
        with app.connect() as db:
            db.execute("""INSERT INTO stock_transactions(id,receipt_id,listing_id,item_id,qty,created,status)
                          VALUES('5','6','123',NULL,3,?,'shipped')""",(now,))
            app.filament_planner.backfill_existing(db)
            app.filament_planner.backfill_existing(db)
            self.assertEqual(db.execute('SELECT count(*) FROM pp_filament_sales').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT count(*) FROM stock_transactions').fetchone()[0],1)


if __name__ == '__main__':
    unittest.main()
