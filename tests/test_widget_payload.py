import ast
from pathlib import Path
import unittest
import math
import time

source=(Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py').read_text()
tree=ast.parse(source)
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='widget_payload')
scope={'math':math,'time':time}
exec(compile(ast.Module(body=[node],type_ignores=[]),'<widget>','exec'),scope)
payload=scope['widget_payload']

class WidgetPayloadTests(unittest.TestCase):
    def test_partial_keeps_all_existing_totals(self):
        reading={'watts':90,'amps':.6,'devices':[
            {'name':'A','kind':'printer','watts':80,'amps':.5,'amps_source':'shelly','printer_state':'printing'},
            {'name':'B','kind':'printer','watts':10,'amps':.1,'amps_source':'calculated','switch_state':'off'},
            {'name':'C','kind':'other','watts':None,'amps':None}]}
        a=payload(reading,100,110)['attributes']
        self.assertEqual((a['watts'],a['amps'],a['printing']),(90,.6,1))
        self.assertEqual((a['watts_measured'],a['amps_measured'],a['devices']),(2,1,3))
        self.assertEqual(a['estimated_amps'],['B'])
    def test_stale(self):
        self.assertEqual(payload({},100,191)['state'],'unavailable')

if __name__=='__main__':unittest.main()
