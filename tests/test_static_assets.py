"""Regression: assets linked by the dashboard must be served by the HA webserver."""
import importlib.util
from pathlib import Path
import re
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner"
spec = importlib.util.spec_from_file_location("static_asset_app", ROOT / "app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class FakeRequest:
    def __init__(self, path):
        self.path = path

    def allowed(self):
        return True

    def send(self, code, body, mime="application/json; charset=utf-8"):
        return code, body, mime


class StaticAssetsTests(unittest.TestCase):
    def test_every_index_script_and_stylesheet_is_served(self):
        html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
        urls = re.findall(r'(?:src|href)="([^"]+)"', html)
        assets = sorted({
            urlsplit(url).path
            for url in urls
            if urlsplit(url).path.endswith((".js", ".css"))
        })
        self.assertIn("farm-ui.js", assets)
        self.assertIn("farm-ui.css", assets)
        self.assertIn("dashboard-order-cards.css", assets)
        for asset in assets:
            with self.subTest(asset=asset):
                code, body, mime = app.Handler.do_GET(FakeRequest("/" + asset))
                self.assertEqual(code, 200, f"Static asset {asset} must not return 404")
                self.assertTrue(body)
                self.assertIn("javascript" if asset.endswith(".js") else "css", mime)


if __name__ == "__main__":
    unittest.main()
