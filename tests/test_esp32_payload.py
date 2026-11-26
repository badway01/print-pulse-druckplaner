import ast
import json
import math
from pathlib import Path
import unittest

source=(Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py').read_text()
node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='esp32_payload')
scope={'math':math,'json':json}
exec(compile(ast.Module(body=[node],type_ignores=[]),'<esp32>','exec'),scope)

class Esp32PayloadTests(unittest.TestCase):
    def test_partial_and_sorting(self):
        d={'watts':10,'amps':.05,'warning_w':2500,'critical_w':3200,'devices':[
            {'name':'A','entity':'a','kind':'printer','switch_state':'off','watts':0,'amps':0,'amps_source':'shelly'},
            {'name':'B','entity':'b','kind':'printer','printer_state':'printing','watts':10,'amps':.05,'amps_source':'calculated'},
            {'name':'C','kind':'printer','watts':None,'amps':None},
            {'name':'Kühlschrank','kind':'other','entity':'c','switch_state':'on'}]}
        p=json.loads(scope['esp32_payload'](d,100,{'amps':3.2},{'amps':1.2}))
        self.assertEqual((p['n'],p['nw'],p['na'],p['e']),(4,2,1,1))
        self.assertEqual((p['p'],p['avg']),(3.2,1.2))
        self.assertEqual([x[0] for x in p['rows']],['B','A','C','Kuehlschrank'])
        self.assertEqual(p['rows'][2][1:3],[None,None])
        self.assertFalse(p['rows'][0][4])
    def test_missing(self):
        p=json.loads(scope['esp32_payload']({},100))
        self.assertIsNone(p['w'])
        self.assertIsNone(p['p'])
        self.assertEqual(p['rows'],[])
