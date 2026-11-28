import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "print_pulse_druckplaner"

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

t = load("tablet_monitor")
p = load("power_monitor")
t.power_monitor = p

class ConsumerProvisioningTest(unittest.TestCase):
    def setUp(self):
        self.store = {t.REGISTRY_KEY: json.dumps({"items": [
            {"id":"printer-a","name":"Printer","kind":"printer","enabled":True,"power_entity":"sensor.example_printer"},
            {"id":"existing-fridge","name":"Kühlschrank","kind":"other","enabled":False,"power_entity":""}
        ]})}
        self.states = {}
        self.mac = "abcdefabcdef"
        self.cfg = lambda db,k,default="": self.store.get(k,default)
        self.put = lambda db,k,v: self.store.update({k:v})

    def add_profile(self, name, slug, mac, watts=0, amps=0):
        prefix = "example_" + slug
        hw = "sensor.shellyplugsg3_" + mac
        def sensor(key, value, cls, unit, friendly):
            self.states[key] = {"state":str(value),"attributes":{"device_class":cls,"unit_of_measurement":unit,"friendly_name":friendly}}
        sensor("sensor."+prefix+"_leistung",watts,"power","W",name+" Leistung")
        sensor("sensor."+prefix+"_energie",.04,"energy","kWh",name+" Energie")
        sensor(hw+"_energieverbrauch",.04,"energy","kWh",name+" Energieverbrauch")
        sensor(hw+"_stromstarke",amps,"current","A",name+" Stromstärke")
        self.states["switch."+prefix]={"state":"on","attributes":{"friendly_name":name}}
        for suffix in p.FAULT_SUFFIXES:
            self.states["binary_sensor."+prefix+"_"+suffix]={"state":"off","attributes":{"device_class":"problem"}}

    def provision(self, profile):
        return t.provision_consumer(None,self.cfg,self.put,self.states,*profile)

    def test_all_consumers_and_no_double_count(self):
        for profile,mac,w,a in zip(t.CONSUMER_PROFILES,
            ["abcdefabcdef","abcdefabcdea","abcdefabcdeb"],[69,0,4.6],[.314,0,.032]):
            self.add_profile(profile[0],profile[1],mac,w,a)
            self.assertTrue(self.provision(profile))
            self.assertFalse(self.provision(profile))
        settings=p.config(None,self.cfg)
        rows=settings["registry"]
        self.assertEqual(len(rows),4)
        self.assertEqual(rows[0]["id"],"printer-a")
        fridge=next(x for x in rows if x["name"]=="Kühlschrank")
        self.assertEqual(fridge["id"],"existing-fridge")
        self.assertTrue(fridge["enabled"])
        reading=t.enrich_currents(p.snapshot(self.states,settings),self.states)
        self.assertAlmostEqual(reading["watts"],73.6)
        self.assertAlmostEqual(sum(x["amps"] or 0 for x in reading["devices"]),.346)
        self.assertEqual(reading["amps_real_count"],3)
        self.assertEqual(len(reading["faults"]),12)
        for row in reading["devices"]:
            if row["kind"]=="other":
                self.assertEqual(t.resolve_switch_state(row,self.states),"on")
                self.assertEqual(row["amps_source"],"shelly")

    def test_local_farm_status_one_time_preserves_measurements(self):
        rows = [
            {"id":"a1","name":"A1","kind":"printer","enabled":True,"power_entity":"sensor.a1"},
            {"id":"h2d","name":"H2D","kind":"printer","enabled":True,"power_entity":"sensor.old"},
            {"id":"h2d2","name":"H2D No2","kind":"printer","enabled":True,"power_entity":"sensor.new"}
        ]
        self.store[t.REGISTRY_KEY]=json.dumps({"items":rows})
        self.assertTrue(t.migrate_local_farm_status(None,self.cfg,self.put))
        settings=p.config(None,self.cfg)
        self.assertFalse(settings["registry"][0]["enabled"])
        self.assertTrue(settings["registry"][1]["maintenance"])
        self.assertEqual(settings["registry"][1]["power_entity"],"sensor.old")
        self.states["sensor.old"]={"state":"25","attributes":{"unit_of_measurement":"W","device_class":"power"}}
        snap=p.snapshot(self.states,settings)
        self.assertEqual([x["name"] for x in snap["devices"]],["H2D","H2D No2"])
        self.assertTrue(snap["devices"][0]["maintenance"])
        self.assertEqual(snap["watts"],25.)
        settings["registry"][1]["maintenance"]=False
        self.store[t.REGISTRY_KEY]=json.dumps({"items":settings["registry"]})
        self.assertFalse(t.migrate_local_farm_status(None,self.cfg,self.put))
        self.assertFalse(p.config(None,self.cfg)["registry"][1]["maintenance"])

    def test_ambiguous_profile_not_saved(self):
        profile=t.CONSUMER_PROFILES[1]
        self.add_profile(profile[0],profile[1],self.mac)
        self.add_profile(profile[0],profile[1],"abcdefabcdea")
        self.assertFalse(self.provision(profile))
        self.assertEqual(len(json.loads(self.store[t.REGISTRY_KEY])["items"]),2)

    def test_same_socket_existing_elsewhere_not_duplicated(self):
        profile=t.CONSUMER_PROFILES[2]
        self.add_profile(profile[0],profile[1],self.mac)
        rows=json.loads(self.store[t.REGISTRY_KEY])
        rows["items"][0]["current_entity"]="sensor.shellyplugsg3_"+self.mac+"_stromstarke"
        self.store[t.REGISTRY_KEY]=json.dumps(rows)
        self.assertFalse(self.provision(profile))

if __name__=="__main__":
    unittest.main()
