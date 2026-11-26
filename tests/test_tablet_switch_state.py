import importlib.util
import unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"print_pulse_druckplaner"/"tablet_monitor.py"
spec=importlib.util.spec_from_file_location("tablet_monitor_switch",p)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class SwitchStateTest(unittest.TestCase):
    def test_exact_id_and_explicit_priority(self):
        a="switch.shellyplugsg3_0123456789ab"
        b="switch.shellyplugsg3_0123456789ac"
        states={a:{"state":"off"},b:{"state":"on"}}
        dev={"entity":"sensor.shellyplugsg3_0123456789ab_leistung","watts":18.5}
        self.assertEqual(m.resolve_switch_state(dev,states),"off")
        self.assertEqual(dev["watts"],18.5)
        self.assertEqual(m.resolve_switch_state(dict(dev,switch_entity=b),states),"on")
        self.assertIsNone(m.resolve_switch_state(dict(dev,switch_entity="switch.missing"),states))
        self.assertIsNone(m.resolve_switch_state(dev,{b:{"state":"on"}}))
        self.assertIsNone(m.resolve_switch_state({"watts":0},states))
        self.assertIsNone(m.resolve_switch_state(dev,{a:{"state":"unavailable"}}))

if __name__=="__main__":unittest.main()
