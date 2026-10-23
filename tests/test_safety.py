"""Regression tests for transactional journal and verified, portable backups."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location(
    'safety_test_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner'/'app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

class DataSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.prev=app.DB_PATH
        self.db=Path(self.temp.name)/'production.sqlite3'
        self.masters=Path(self.temp.name)/'masters'
        self.archive=Path(self.temp.name)/'snapshot.zip'
        app.DB_PATH=self.db
        app.init_db()
        with app.connect() as db:
            db.execute("""INSERT INTO stock_listings
                (id,title,image,etsy_qty,state,updated)
                VALUES('101','Lesegeist','',20,'active',1)""")
            db.execute("""INSERT INTO stock_items
                (id,listing_id,product_id,label,signature,on_hand)
                VALUES('ghost','101','201','Buchfarbe: Blau','[]',5)""")
            db.execute("""INSERT INTO pp_components
                (id,listing_id,name,kind,stock,target_stock,updated)
                VALUES('white','101','Geist Weiß','stock',4,8,1)""")

    def tearDown(self):
        app.DB_PATH=self.prev
        self.temp.cleanup()

    def test_journal_records_stock_components_and_rolls_back(self):
        with app.connect() as db:
            db.execute("UPDATE stock_items SET on_hand=on_hand-2 WHERE id='ghost'")
            db.execute("UPDATE pp_components SET stock=stock-1 WHERE id='white'")
            db.execute("""INSERT INTO stock_order_prints
                (transaction_id,receipt_id,item_id,printing,finished,allocated,updated)
                VALUES('t1','r1','ghost',1,0,0,1)""")
        with app.connect() as db:
            rows=app.safety.report(db,80)
        self.assertTrue(any(e['category']=='Fertigwarenlager' and
                        any(c['delta']=='-2' for c in e['changes']) for e in rows))
        self.assertTrue(any(e['category']=='Bauteilvorrat' and
                        any(c['delta']=='-1' for c in e['changes']) for e in rows))
        self.assertTrue(any(e['category']=='Kundenauftrag' for e in rows))
        previous=len(rows)
        with self.assertRaises(RuntimeError):
            with app.connect() as db:
                db.execute("UPDATE stock_items SET on_hand=0 WHERE id='ghost'")
                raise RuntimeError('Test rollback')
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT on_hand FROM stock_items WHERE id='ghost'").fetchone()[0],3)
            self.assertEqual(len(app.safety.report(db,80)),previous)

    def test_idempotent_migration_and_verified_restore(self):
        app.init_db()
        app.init_db()
        master=self.masters/'101'/'H2D'/'one.3mf'
        master.parent.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(master,'w') as z:
            z.writestr('3D/3dmodel.model','<model/>')
        with app.connect() as db:
            db.execute("""INSERT INTO master_files
                (id,listing_id,variant_id,printer,filename,relative_path,bytes,created)
                VALUES('m1','101','','H2D','one.3mf','101/H2D/one.3mf',?,1)""",
                (master.stat().st_size,))
            db.execute("INSERT INTO config(k,value) VALUES('refresh_token','private-data')")
        report=app.safety.build_backup(self.db,self.masters,self.archive)
        self.assertEqual(report['master_files'],1)
        stage=Path(self.temp.name)/'restored'
        valid=app.safety.restore_to_staging(self.archive,stage)
        self.assertTrue(valid['ok'])
        self.assertEqual((stage/'masterdateien/101/H2D/one.3mf').read_bytes(),master.read_bytes())
        with sqlite3.connect(stage/'production.sqlite3') as db:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0],'ok')
            self.assertEqual(db.execute("SELECT stock FROM pp_components WHERE id='white'").fetchone()[0],4)
            self.assertEqual(db.execute("SELECT value FROM config WHERE k='refresh_token'").fetchone()[0],'private-data')

    def test_missing_registered_3mf_aborts_instead_of_incomplete_backup(self):
        with app.connect() as db:
            db.execute("""INSERT INTO master_files
              (id,listing_id,variant_id,printer,filename,relative_path,bytes,created)
              VALUES('lost','101','','H2D','lost.3mf','101/H2D/lost.3mf',500,1)""")
        with self.assertRaisesRegex(ValueError,'Master-3MF'):
            app.safety.build_backup(self.db,self.masters,self.archive)
        self.assertFalse(self.archive.exists())

    def test_archive_rejects_unexpected_file_names(self):
        with zipfile.ZipFile(self.archive,'w') as z:
            z.writestr('production.sqlite3',self.db.read_bytes())
            z.writestr('../outside.txt','not allowed')
            z.writestr('manifest.json',json.dumps({
                'format':'print-pulse-backup','version':1,
                'files':{'production.sqlite3':{'sha256':'x','bytes':0},
                    '../outside.txt':{'sha256':'x','bytes':0}}}))
        with self.assertRaises(ValueError):
            app.safety.restore_to_staging(self.archive,Path(self.temp.name)/'staging')
        self.assertFalse((Path(self.temp.name)/'outside.txt').exists())

    def test_assembled_etsy_delivery_is_not_charged_again(self):
        app.apply_snapshot(None,[('tx','receipt','101','201','[]',1,1,'open')],{'receipt'})
        with app.connect() as db:
            db.execute("""INSERT INTO stock_order_prints
                (transaction_id,receipt_id,item_id,printing,finished,allocated,assembled,updated)
                VALUES('tx','receipt','ghost',0,0,0,1,1)""")
        before_stock=app.overview()['products'][0]['items'][0]['on_hand']
        for _ in range(3):
            app.apply_snapshot(None,[('tx','receipt','101','201','[]',1,1,'shipped')],{'receipt'})
        after_stock=app.overview()['products'][0]['items'][0]['on_hand']
        self.assertEqual(after_stock,before_stock)
        with app.connect() as db:
            events=app.safety.report(db,100)
        self.assertTrue(any(e['category']=='Etsy-Synchronisation' and
                        any(x['field']=='status' and x['after']=='shipped' for x in e['changes'])
                        for e in events))

if __name__=='__main__':
    unittest.main()
