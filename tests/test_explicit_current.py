import importlib.util
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/"print_pulse_druckplaner"
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/(name+".py"))
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
t=load("tablet_monitor")
p=load("power_monitor")
t.power_monitor=p
class ExplicitCurrentTest(unittest.TestCase):
    def test_renamed_device(self):
        def state(value,cls,unit):
            return {"state":str(value),"attributes":{"device_class":cls,"unit_of_measurement":unit}}
        states={"sensor.example_power":state(69,"power","W"),
                "sensor.example_current":state(.314,"current","A"),
                "switch.example": {"state":"on"},
                "binary_sensor.example_uberstrom":{"state":"off","attributes":{"device_class":"problem"}}}
        config=p.defaults()
        config["registry"]=[{"name":"Example","kind":"other","power_entity":"sensor.example_power","current_entity":"sensor.example_current","switch_entity":"switch.example"}]
        d=t.enrich_currents(p.snapshot(states,config),states)
        self.assertEqual(d["devices"][0]["amps"],.314)
        self.assertEqual(d["devices"][0]["amps_source"],"shelly")
        self.assertEqual(t.resolve_switch_state(d["devices"][0],states),"on")
        self.assertEqual(d["faults"][0]["state"],"off")
        self.assertEqual(d["watts"],69)
        self.assertIn("switch.example",[x["id"] for x in t.choices(states,"switch")])
        self.assertIn("sensor.example_current",[x["id"] for x in t.choices(states,"sensor")])
        del states["sensor.example_current"]
        d=t.enrich_currents(p.snapshot(states,config),states)
        self.assertEqual(d["devices"][0]["amps_source"],"calculated")
if __name__=="__main__":unittest.main()
