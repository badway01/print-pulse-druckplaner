"""Tests for read-only Home Assistant printer sensor integration, with fake device data."""
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.request import Request, urlopen

APP_FILE = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner" / "app.py"


def sensor(entity_id, state, name=None):
    return {"entity_id": entity_id, "state": state,
            "attributes": {"friendly_name": name or entity_id}}


class PrinterMonitorTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        with patch.dict(os.environ, {"PP_DATA_DIR": directory.name}):
            spec = importlib.util.spec_from_file_location("printer_test_module", APP_FILE)
            self.app = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.app)
        self.app.init_db()
        self.app.INGRESS_PEER = "127.0.0.1"

    def test_missing_home_assistant_permission_is_visible_not_faked(self):
        with patch.dict(os.environ, {"SUPERVISOR_TOKEN": ""}):
            overview = self.app.printer_overview()
        self.assertFalse(overview["connected"])
        self.assertIn("Berechtigung", overview["error"])
        self.assertEqual(len(overview["printers"]), 6)
        self.assertEqual(overview["printers"][0]["kind"], "unmapped")

    def test_two_bambu_p1s_names_remain_separate(self):
        data = [
            sensor("sensor.keller_p1s_old_druckstatus", "running"),
            sensor("sensor.keller_p1s_old_druckfortschritt", "68"),
            sensor("sensor.keller_p1s_new_druckstatus", "idle"),
            sensor("sensor.keller_p1s_new_druckfortschritt", "0"),
            sensor("sensor.other_unrelated_status", "running"),
        ]
        result = self.app.printer_sensor_summary(data, {})
        printers = {x["name"]: x for x in result}
        self.assertEqual(printers["P1S Old"]["kind"], "printing")
        self.assertEqual(printers["P1S Old"]["progress"], 68.0)
        self.assertEqual(printers["P1S New"]["kind"], "ready")
        self.assertEqual(printers["P1S New"]["progress"], 0.0)
        self.assertEqual(printers["H2D"]["kind"], "unmapped")
        self.assertNotIn("sensor.other_unrelated_status", str(result))

    def test_unavailable_does_not_become_a_false_idle_state(self):
        data = [sensor("sensor.keller_p1s_old_druckstatus", "unavailable"),
                sensor("sensor.keller_p1s_old_druckfortschritt", "999")]
        old = next(x for x in self.app.printer_sensor_summary(data, {}) if x["name"] == "P1S Old")
        self.assertEqual(old["kind"], "unavailable")
        self.assertIsNone(old["progress"])

    def test_mapping_requires_safe_entity_identifiers(self):
        self.assertTrue(self.app.valid_entity_id("sensor.keller_p1s_old_druckstatus"))
        self.assertTrue(self.app.valid_entity_id(""))
        self.assertFalse(self.app.valid_entity_id("http://127.0.0.1/secret"))
        self.assertFalse(self.app.valid_entity_id("sensor.foo/../../etc/passwd"))
        self.assertFalse(self.app.valid_entity_id("automation.turn_on"))

    def test_persist_mapping_through_ingress_api(self):
        srv = ThreadingHTTPServer(("127.0.0.1", 0), self.app.Handler)
        thread = threading.Thread(target=srv.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (srv.shutdown(), srv.server_close(), thread.join(timeout=2)))
        payload = {
            "printer": "P1S Old",
            "status_entity": "sensor.keller_p1s_old_druckstatus",
            "progress_entity": "sensor.keller_p1s_old_druckfortschritt",
            "remaining_entity": "", "job_entity": ""
        }
        req = Request(f"http://127.0.0.1:{srv.server_port}/api/printers/map",
                      data=json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=5) as reply:
            self.assertTrue(json.load(reply)["ok"])
        with patch.object(self.app, "get_home_assistant_states", return_value=[
                sensor("sensor.keller_p1s_old_druckstatus", "running"),
                sensor("sensor.keller_p1s_old_druckfortschritt", "23")]):
            with urlopen(f"http://127.0.0.1:{srv.server_port}/api/printers", timeout=5) as reply:
                overview = json.load(reply)
        old = next(p for p in overview["printers"] if p["name"] == "P1S Old")
        self.assertTrue(overview["connected"])
        self.assertEqual(old["progress"], 23.0)
        self.assertEqual(old["mapping"]["status"], payload["status_entity"])
        self.assertEqual(old["kind"], "printing")


if __name__ == "__main__":
    unittest.main()
