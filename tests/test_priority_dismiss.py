"""Persistent dismissal of optional production suggestions; never mutates inventory."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('priority_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class PriorityDismissTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()
        app.INGRESS_PEER='127.0.0.1'
        self.server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        self.worker=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.worker.start()
        self.base='http://127.0.0.1:'+str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=2)
        self.temp.cleanup()

    def get(self):
        with urllib.request.urlopen(self.base+'/api/status',timeout=4) as res:
            return json.load(res)

    def post(self,key,action):
        payload=json.dumps({'key':key,'action':action}).encode()
        req=urllib.request.Request(self.base+'/api/priority-dismiss',data=payload,
                                   headers={'Content-Type':'application/json'},method='POST')
        with urllib.request.urlopen(req,timeout=4) as res:
            return json.load(res)

    def test_dismiss_survives_refresh_and_restore(self):
        original=self.get()
        self.assertEqual(original['priority_dismissed'],[])
        key='variant:101:101-white'
        self.assertEqual(self.post(key,'dismiss')['priority_dismissed'],[key])
        self.assertEqual(self.post(key,'dismiss')['priority_dismissed'],[key])
        self.assertEqual(self.get()['priority_dismissed'],[key])
        # The ignore list is display-only; no product or inventory changes.
        self.assertEqual(self.get()['products'],original['products'])
        self.assertEqual(self.post(key,'restore')['priority_dismissed'],[])
        self.assertEqual(self.get()['priority_dismissed'],[])

    def test_preproduction_suggestions_and_invalid_ids(self):
        key='part:101:abc-123'
        self.assertEqual(self.post(key,'dismiss')['priority_dismissed'],[key])
        with self.assertRaises(urllib.error.HTTPError) as err:
            self.post('order:101:301','dismiss')
        self.assertEqual(err.exception.code,400)
        self.assertEqual(self.get()['priority_dismissed'],[key])


if __name__=='__main__':
    unittest.main()
