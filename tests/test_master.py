"""Regression tests for master-3MF storage, printer slots and backward-compatible filament fields."""
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('printmaster_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class MasterTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.original_root=app.MASTER_ROOT
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.MASTER_ROOT=Path(self.temp.name)/'share'
        app.init_db()
        with app.connect() as db:
            db.execute("INSERT INTO stock_listings(id,title,image,state,updated) VALUES('123','Testprodukt','','active',0)")
            db.execute("""INSERT INTO stock_items(id,listing_id,product_id,label,signature)
                       VALUES('variant1','123','v1','Weiß','')""")

    def tearDown(self):
        app.MASTER_ROOT=self.original_root
        self.temp.cleanup()

    def spool(self):
        app.filament_mutate({'action':'save','id':None,'brand':'Bambu','color':'Weiß','material':'PLA Matte',
                             'stock_qty':2,'price':'14,50','purchase_url':'',
                             'color_hex':'#ffffff','internal_code':'1','notes':'Eigener interner Code'})
        f=app.filament_overview()['filaments'][0]
        self.assertEqual(f['internal_code'],'1')
        self.assertEqual(f['notes'],'Eigener interner Code')
        return f['id']

    def test_profile_slots_and_immutable_revisions(self):
        fid=self.spool()
        payload={'listing_id':'123','variant_id':'variant1','printer':'H2D',
                 'sources':[{'type':'ams','slots':[fid,None,None,None]},
                            {'type':'ams_ht','slots':[fid]}]}
        summary=app.save_print_profile(payload)
        self.assertEqual(len(summary['profiles']),1)
        self.assertEqual([x['code'] for x in summary['profiles'][0]['colors']],['1','1'])
        self.assertEqual(summary['profiles'][0]['sources'][0]['label'],'AMS 1')
        with io.BytesIO() as buf:
            with zipfile.ZipFile(buf,'w') as z:
                z.writestr('[Content_Types].xml','<Types/>')
                z.writestr('3D/3dmodel.model','model')
            content=buf.getvalue()
        meta={'listing_id':'123','variant_id':'variant1','printer':'H2D','filename':'Master 50.3mf'}
        first=app.store_master_file(meta,io.BytesIO(content),len(content))
        second=app.store_master_file(meta,io.BytesIO(content),len(content))
        self.assertNotEqual(first['id'],second['id'])
        self.assertEqual(len(app.print_tools_overview('123')['files']),2)
        row,path=app.master_download_record(first['id'])
        self.assertEqual(path.read_bytes(),content)
        self.assertEqual(row['filename'],'Master 50.3mf')
        self.assertTrue(str(path).startswith(str(app.MASTER_ROOT)))

    def test_reject_invalid_file_and_profile(self):
        self.spool()
        with self.assertRaises(ValueError):
            app.save_print_profile({'listing_id':'123','printer':'H2D','sources':[{'type':'ams','slots':[999]}]})
        with self.assertRaises(ValueError):
            app.save_print_profile({'listing_id':'123','printer':'H2D','sources':[{'type':'external','slots':[999]}]})
        with self.assertRaises(ValueError):
            app.store_master_file({'listing_id':'123','printer':'H2D','filename':'Master.3mf'},io.BytesIO(b'junk'),4)
        self.assertEqual(list(app.MASTER_ROOT.rglob('*.3mf')),[])
        with self.assertRaises(ValueError):
            app.store_master_file({'listing_id':'123','printer':'bad','filename':'Master.3mf'},io.BytesIO(b'junk'),4)

    def test_corrupted_profile_is_readable_without_rewriting_database(self):
        with app.connect() as db:
            db.execute("""INSERT INTO print_profiles(listing_id,variant_id,printer,sources_json,updated)
                          VALUES('123','','H2D','{broken-json',0)""")
        summary=app.print_tools_overview()
        self.assertEqual(len(summary['profiles']),1)
        self.assertEqual(summary['profiles'][0]['sources'],[])
        with app.connect() as db:
            raw=db.execute("SELECT sources_json FROM print_profiles WHERE listing_id='123'").fetchone()[0]
        self.assertEqual(raw,'{broken-json')

    def test_malformed_slots_cannot_break_all_saved_profiles(self):
        with app.connect() as db:
            db.execute("""INSERT INTO print_profiles(listing_id,variant_id,printer,sources_json,updated)
                        VALUES('123','','H2D',?,0)""",
                       ('[{"label":"AMS", "slots":"oops"},{"label":"Extern","slots":[null]}]',))
        result=app.print_tools_overview('123')
        self.assertEqual(len(result['profiles']),1)
        self.assertEqual(result['profiles'][0]['sources'],[{'label':'Extern','slots':[None]}])

    def test_pre_migration_spool_columns_can_still_be_read(self):
        with app.connect() as db:
            db.execute("ALTER TABLE filament_spools RENAME TO filament_spools_new")
            db.execute("""CREATE TABLE filament_spools(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand TEXT NOT NULL,color TEXT NOT NULL,material TEXT NOT NULL,
              color_hex TEXT NOT NULL DEFAULT '#c1c9c1',price_cents INTEGER,
              purchase_url TEXT NOT NULL DEFAULT '',stock_qty INTEGER NOT NULL DEFAULT 0,
              cart_qty INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL)""")
            db.execute("DROP TABLE filament_spools_new")
        self.assertEqual(app.print_tools_overview(),{'profiles':[],'files':[]})

    def test_existing_filament_schema_is_migrated(self):
        with app.connect() as db:
            db.execute("ALTER TABLE filament_spools RENAME TO filament_spools_new")
            db.execute("""CREATE TABLE filament_spools(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand TEXT NOT NULL,color TEXT NOT NULL,material TEXT NOT NULL,
              color_hex TEXT NOT NULL DEFAULT '#c1c9c1',price_cents INTEGER,
              purchase_url TEXT NOT NULL DEFAULT '',stock_qty INTEGER NOT NULL DEFAULT 0,
              cart_qty INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL)""")
            db.execute("DROP TABLE filament_spools_new")
            db.execute("""INSERT INTO filament_spools(brand,color,material,created,updated)
                        VALUES('Bambu Lab','Silber','PLA',0,0)""")
        app.init_db()
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['brand'],row['internal_code'],row['notes']),('Bambu Lab','',''))


if __name__=='__main__':
    unittest.main()
