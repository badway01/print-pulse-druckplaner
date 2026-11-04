"""Regression checks for per-3MF statistics without touching orders or inventory."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner" / "master_insights.py"
spec = importlib.util.spec_from_file_location("pp_master_insights_test", MODULE)
insights = importlib.util.module_from_spec(spec)
spec.loader.exec_module(insights)


class MasterInsightsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE master_files (
              id TEXT PRIMARY KEY, listing_id TEXT, variant_id TEXT,
              printer TEXT, filename TEXT, relative_path TEXT, bytes INTEGER, created INTEGER);
            CREATE TABLE filament_spools (
              id INTEGER PRIMARY KEY, brand TEXT, color TEXT, material TEXT,
              color_hex TEXT, internal_code TEXT, price_cents INTEGER, spool_g REAL);
            CREATE TABLE pp_cost_settings (id INTEGER PRIMARY KEY, data_json TEXT);
            INSERT INTO filament_spools VALUES
              (1,'Bambu','Schwarz','PLA Matte','#111111','25',1450,1000),
              (2,'Bambu','Beige','PLA Basic','#e8d7a1','07',1450,1000);
        """)
        insights.schema(self.db)
        self.fid = "a" * 24
        self.path = self.root / "master.3mf"
        self.db.execute("INSERT INTO master_files VALUES(?,?,?,?,?,?,?,?)",
                        (self.fid, "123", "", "H2D", "master.3mf", self.path.name, 500, 1))

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def row(self):
        return self.db.execute("SELECT * FROM master_files WHERE id=?", (self.fid,)).fetchone()

    def spools(self):
        return {r["id"]: dict(r) for r in self.db.execute("SELECT * FROM filament_spools")}

    def test_import_existing_sliced_file_and_edit_cost(self):
        with zipfile.ZipFile(self.path, "w") as archive:
            archive.writestr("Metadata/slice_info.config", """
                <config><plate><metadata key="prediction" value="7200"/>
                <filament id="1" type="PLA" color="#111111" used_g="20"/>
                <filament id="2" type="PLA" color="#e8d7a1" used_g="10"/>
                </plate></config>""")
        data = insights.summarize(self.db, self.row(), self.root, self.spools())
        self.assertEqual(data["time_seconds"], 7200)
        self.assertEqual(data["total_grams"], 30)
        self.assertEqual([f["percent"] for f in data["filaments"]], [67, 33])
        self.assertIsNone(data["production_eur"], "Unassigned filament must not invent a cost")
        self.assertEqual(data["print_count"], 0)
        insights.change(self.db, self.root, self.fid, {
            "action": "save", "hours": 2, "minutes": 0,
            "filaments": [{"filament_id": 1, "grams": 20.0},
                          {"filament_id": 2, "grams": 10.0}]
        })
        result = insights.summarize(self.db, self.row(), self.root, self.spools())
        self.assertAlmostEqual(result["material_eur"], .435, delta=.011)
        self.assertIsNotNone(result["production_eur"])
        insights.change(self.db, self.root, self.fid, {"action": "count"})
        result = insights.summarize(self.db, self.row(), self.root, self.spools())
        self.assertEqual(result["print_count"], 1)
        self.assertIsInstance(result["last_print"], int)
        self.assertTrue(self.path.exists())

    def test_unsliced_project_shows_colors_but_no_fake_cost(self):
        with zipfile.ZipFile(self.path, "w") as archive:
            archive.writestr("Metadata/project_settings.config", json.dumps({
                "filament_colour": ["#000000", "#EEEEEE"], "filament_type": ["PLA", "PLA"]
            }))
        result = insights.summarize(self.db, self.row(), self.root, self.spools())
        self.assertEqual(len(result["filaments"]), 2)
        self.assertIsNone(result["material_eur"])
        self.assertIsNone(result["time_seconds"])

    def test_invalid_filament_edit_does_not_modify_saved_data(self):
        with zipfile.ZipFile(self.path, "w") as archive:
            archive.writestr("3D/3dmodel.model", "model")
        insights.summarize(self.db, self.row(), self.root, self.spools())
        previous = self.db.execute("SELECT details_json FROM pp_master_file_insights").fetchone()[0]
        with self.assertRaises(ValueError):
            insights.change(self.db, self.root, self.fid, {
                "action": "save", "hours": 2, "minutes": 0,
                "filaments": [{"filament_id": 999, "grams": 10}]
            })
        current = self.db.execute("SELECT details_json FROM pp_master_file_insights").fetchone()[0]
        self.assertEqual(previous, current)

    def test_broken_zip_never_fails_listing(self):
        self.path.write_bytes(b"PK-corrupt")
        result = insights.summarize(self.db, self.row(), self.root, self.spools())
        self.assertEqual(result["filaments"], [])
        self.assertIsNone(result["production_eur"])


if __name__ == "__main__":
    unittest.main()
