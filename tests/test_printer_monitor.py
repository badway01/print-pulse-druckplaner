"""Read-only printer status, duration units, safe mapping and absence handling."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('printer_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


def entity(name,value,unit=''):
    return {'entity_id':name,'state':str(value),'attributes':{'unit_of_measurement':unit,'friendly_name':name}}


class PrinterMonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.init_db()

    def tearDown(self):
        self.temp.cleanup()

    def test_five_printers_start_unconfigured_without_fake_values(self):
        with patch.object(app,'homeassistant_states',return_value={}):
            data=app.printer_dashboard()
        self.assertEqual(len(data['printers']),5)
        self.assertTrue(all(p['state']=='setup' and p['progress'] is None for p in data['printers']))
        self.assertEqual([p['id'] for p in data['printers']],list(app.MONITOR_PRINTERS))

    def test_bambu_minutes_and_snapmaker_seconds(self):
        app.save_printer_bindings({'printer':'H2D','entities':{
            'status':'sensor.h2d_print_status','progress':'sensor.h2d_print_progress',
            'remaining':'sensor.h2d_remaining_time','filename':'sensor.h2d_gcode_file',
            'nozzle_left':'sensor.h2d_left_nozzle_temperature','nozzle_right':'sensor.h2d_right_nozzle_temperature'}})
        app.save_printer_bindings({'printer':'Snapmaker U1','entities':{
            'status':'sensor.u1_print_state','progress':'sensor.u1_print_progress',
            'remaining':'sensor.u1_time_remaining','head0':'sensor.u1_tool0_temperature'}})
        states={row['entity_id']:row for row in (
            entity('sensor.h2d_print_status','RUNNING'),
            entity('sensor.h2d_print_progress','72','%'),
            entity('sensor.h2d_remaining_time','84','min'),
            entity('sensor.h2d_gcode_file','goldene_hochzeit.3mf'),
            entity('sensor.h2d_left_nozzle_temperature','210','°C'),
            entity('sensor.h2d_right_nozzle_temperature','215','°C'),
            entity('sensor.u1_print_state','printing'),
            entity('sensor.u1_print_progress','43','%'),
            entity('sensor.u1_time_remaining','3660','s'),
            entity('sensor.u1_tool0_temperature','205.5','°C'))}
        with patch.object(app,'homeassistant_states',return_value=states):
            data=app.printer_dashboard()
        h2d=next(p for p in data['printers'] if p['id']=='H2D')
        u1=next(p for p in data['printers'] if p['id']=='Snapmaker U1')
        self.assertEqual((h2d['state'],h2d['progress'],h2d['remaining_seconds']),('printing',72,5040))
        self.assertEqual(h2d['filename'],'goldene_hochzeit.3mf')
        self.assertEqual((h2d['temps']['nozzle_left'],h2d['temps']['nozzle_right']),(210,215))
        self.assertEqual((u1['state'],u1['progress'],u1['remaining_seconds']),('printing',43,3660))
        self.assertEqual(u1['temps']['head0'],205.5)
        self.assertEqual(data['bindings']['H2D']['status'],'sensor.h2d_print_status')

    def test_two_p1s_remain_separate_and_offline_wipes_progress(self):
        app.save_printer_bindings({'printer':'P1S Old','entities':{
            'status':'sensor.p1s_old_print_status','progress':'sensor.p1s_old_print_progress'}})
        app.save_printer_bindings({'printer':'P1S New','entities':{
            'status':'sensor.p1s_new_print_status','progress':'sensor.p1s_new_print_progress'}})
        states={row['entity_id']:row for row in (
            entity('sensor.p1s_old_print_status','idle'),
            entity('sensor.p1s_old_print_progress','89','%'),
            entity('sensor.p1s_new_print_status','unavailable'),
            entity('sensor.p1s_new_print_progress','70','%'))}
        with patch.object(app,'homeassistant_states',return_value=states):
            result=app.printer_dashboard()
        self.assertEqual(result['printers'][1]['state'],'idle')
        self.assertIsNone(result['printers'][1]['progress'])
        self.assertEqual(result['printers'][2]['state'],'offline')
        self.assertIsNone(result['printers'][2]['progress'])
        with patch.object(app,'homeassistant_states',side_effect=RuntimeError('Keine Verbindung')):
            lost=app.printer_dashboard()
        self.assertFalse(lost['connected'])
        self.assertTrue(all(p['progress'] is None for p in lost['printers']))

    def test_invalid_mappings_rejected_and_empty_source_safe(self):
        for value in ('http://example.org','sensor.foo/../bar','script.turn_on','sensor.bad id'):
            with self.assertRaises(ValueError):
                app.save_printer_bindings({'printer':'H2D','entities':{'status':value}})
        with self.assertRaises(ValueError):
            app.save_printer_bindings({'printer':'Prusa MK4','entities':{'status':'sensor.prusa_status'}})
        self.assertEqual(app.printer_remaining(entity('sensor.u1_time','01:05:20'),'Snapmaker U1'),3920)
        self.assertIsNone(app.printer_remaining(entity('sensor.u1_time','unknown'),'Snapmaker U1'))

    def test_ha_sensor_choices_only_printer_relevant(self):
        states={row['entity_id']:row for row in (
            entity('sensor.h2d_print_status','running'),
            entity('sensor.living_room_temperature','23.1','°C'),
            entity('switch.bedroom_light','on'))}
        with patch.object(app,'homeassistant_states',return_value=states):
            result=app.ha_entity_choices()
        self.assertTrue(result['connected'])
        self.assertEqual([x['id'] for x in result['entities']],['sensor.h2d_print_status'])


if __name__=='__main__':
    unittest.main()
