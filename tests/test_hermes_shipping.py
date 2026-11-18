"""Regression tests for the private-account Hermes address export."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('shipping_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class HermesShippingTests(unittest.TestCase):
    def setUp(self):
        self.order={'id':'123','customer':'Test Name','items':[{'item_id':'x','quantity':2,'finished':2,'remaining':0,'printing':0}]}
        self.address=app.hermes_address({'name':'Anna Müller','first_line':'Testweg 12a','second_line':'2. Stock','zip':'01234','city':'Teststadt','country_iso':'DE'})

    def test_address_split_and_encoding(self):
        self.assertEqual(self.address['number'],'12a')
        with patch.object(app,'overview',return_value={'orders':[self.order]}):
            body=app.hermes_csv([{'id':'123','confirmed':True,'address':self.address}])
            self.assertEqual(body,'Anna;Müller;2. Stock;Testweg;12a;01234;Teststadt;;DEU;;;;\r\n'.encode('cp1252'))
            self.assertEqual(len(body.decode('cp1252').rstrip('\r\n').split(';')[:-1]),12)

    def test_no_unconfirmed_missing_or_invalid_address(self):
        with patch.object(app,'overview',return_value={'orders':[self.order]}):
            for replacement in ({'zip':'1234'},{'number':''},{'street':'Test;weg'},{'city':'=x'},{'street':'Packstation'},{'extra':'a'*21},{'city':'🌟'},{'country':'CYP'}):
                with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                    app.hermes_csv([{'id':'123','confirmed':True,'address':{**self.address,**replacement}}])
            with self.assertRaises(ValueError):
                app.hermes_csv([{'id':'123','confirmed':False,'address':self.address}])
            with self.assertRaises(ValueError):
                app.hermes_csv([{'id':'123','confirmed':True,'address':self.address}]*2)

    def test_no_unfinished_pickup_and_unmapped_orders(self):
        self.order['items'][0]['finished']=1
        self.assertFalse(app.shipping_ready(self.order))
        with patch.object(app,'overview',return_value={'orders':[self.order]}), self.assertRaises(ValueError):
            app.hermes_csv([{'id':'123','confirmed':True,'address':self.address}])
        self.order['items'][0].update(finished=0,assembled=2)
        self.assertTrue(app.shipping_ready(self.order))
        self.order.update(source='local',fulfillment='pickup')
        self.assertFalse(app.shipping_ready(self.order))
        self.order.update(fulfillment='shipping')
        self.order['items'][0].update(item_id=None,local_custom=True)
        self.assertTrue(app.shipping_ready(self.order))

    def test_missing_source_fields_never_filled_with_guess(self):
        addr=app.hermes_address({'name':'Example','first_line':'12 Test Road','country_iso':'GB'})
        self.assertEqual(addr['street'],'12 Test Road')
        self.assertEqual(addr['number'],'')
        self.assertEqual(addr['country'],'')
        self.assertEqual(addr['first_name'],'')


if __name__=='__main__':
    unittest.main()
