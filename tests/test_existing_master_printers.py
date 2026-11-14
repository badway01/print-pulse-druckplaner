"""Regression tests for reusing saved 3MFs on additional printers."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BOOT = tempfile.TemporaryDirectory()
previous = os.environ.get('PP_DATA_DIR')
os.environ['PP_DATA_DIR'] = BOOT.name
spec = importlib.util.spec_from_file_location('printer_sharing_test_app', ROOT / 'print_pulse_druckplaner' / 'app.py')
app = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(app)
finally:
    if previous is None:
        os.environ.pop('PP_DATA_DIR', None)
    else:
        os.environ['PP_DATA_DIR'] = previous


class ExistingMasterPrinterTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.previous_db, self.previous_root = app.DB_PATH, app.MASTER_ROOT
        app.DB_PATH = Path(self.directory.name) / 'data.sqlite3'
        app.MASTER_ROOT = Path(self.directory.name) / 'masterdateien'
        app.MASTER_ROOT.mkdir(parents=True, exist_ok=True)
        app.init_db()
        app.apply_snapshot([(
            {'listing_id': 101, 'title': 'Flache Deko', 'quantity': 5, 'state': 'active'},
            '', '', [], True
        )], [], set(), orders=[])

    def tearDown(self):
        app.DB_PATH, app.MASTER_ROOT = self.previous_db, self.previous_root
        self.directory.cleanup()

    def original(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr('3D/3dmodel.model', '<?xml version="1.0"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter"/>')
        payload = data.getvalue()
        return app.store_master_file({
            'listing_id': '101', 'variant_id': '', 'printer': 'H2D',
            'filename': 'Flache Deko.3mf'
        }, io.BytesIO(payload), len(payload))['id']

    def files(self):
        return [f for f in app.print_tools_overview('101')['files'] if not f['is_history']]

    def test_existing_master_can_be_reused_for_a1_and_p1s_without_reupload(self):
        original_id = self.original()
        with app.connect() as db:
            db.execute('INSERT INTO pp_master_file_insights(file_id,details_json,updated) VALUES(?,?,?)',
                       (original_id, json.dumps({'time_seconds': 3600, 'filaments': []}), int(time.time())))
        result = app.clone_master_printers({'file_id': original_id, 'printers': ['P1S Old', 'A1', 'A1 mini']})
        self.assertTrue(result['ok'])
        self.assertEqual(len(result['files']), 3)
        self.assertTrue(all(not r['existing'] for r in result['files']))
        files = self.files()
        self.assertEqual(len(files), 4)
        by_printer = {f['printer']: f for f in files}
        self.assertEqual(set(by_printer), {'H2D', 'P1S Old', 'A1', 'A1 mini'})
        self.assertEqual(by_printer['H2D']['insights']['time_seconds'], 3600)
        for printer in ('P1S Old', 'A1', 'A1 mini'):
            self.assertIsNone(by_printer[printer]['insights']['time_seconds'])
            self.assertEqual(by_printer[printer]['shared_source_id'], original_id)
            self.assertEqual(set(by_printer[printer]['shared_printers']), set(by_printer))
        repeated = app.clone_master_printers({'file_id': original_id, 'printers': ['A1', 'P1S Old']})
        self.assertTrue(all(row['existing'] for row in repeated['files']))
        self.assertEqual(len(self.files()), 4)

        # Separate A1 time does not overwrite the original H2D print data.
        with app.connect() as db:
            app.master_insights.change(db, app.MASTER_ROOT, by_printer['A1']['id'],
                {'action': 'save', 'hours': 2, 'minutes': 30, 'filaments': []})
        updated = {f['printer']: f for f in self.files()}
        self.assertEqual(updated['A1']['insights']['time_seconds'], 9000)
        self.assertEqual(updated['H2D']['insights']['time_seconds'], 3600)

    def test_assignment_started_from_a_printer_copy_extends_same_group(self):
        original_id = self.original()
        p1s_id = app.clone_master_printers({'file_id': original_id, 'printers': ['P1S New']})['files'][0]['id']
        added = app.clone_master_printers({'file_id': p1s_id, 'printers': ['A1 mini']})['files'][0]
        self.assertFalse(added['existing'])
        files = self.files()
        self.assertEqual(len(files), 3)
        for file in files:
            self.assertEqual(set(file['shared_printers']), {'H2D', 'P1S New', 'A1 mini'})
            self.assertEqual(file['shared_source_id'], original_id)


if __name__ == '__main__':
    unittest.main()
