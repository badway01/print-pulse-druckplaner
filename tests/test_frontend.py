from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/'print_pulse_druckplaner/web/app.js').read_text()
CSS=(ROOT/'print_pulse_druckplaner/web/style.css').read_text()

class PrintedButtonTests(unittest.TestCase):
    def test_visible_printer_button_on_card(self):
        self.assertIn('data-print-one=',JS)
        self.assertIn('printerIcon',JS)
        self.assertIn("g.remaining===1?'Gedruckt':'+1 gedruckt'",JS)
    def test_one_piece_per_click_and_double_click_guard(self):
        self.assertIn("await api('batch',{key,amount:1})",JS)
        self.assertIn('pendingPrints.has(key)',JS)
        self.assertIn('pendingPrints.add(key)',JS)
    def test_batch_and_undo_paths_remain(self):
        self.assertIn('Mehrere Stück',JS)
        self.assertIn('data-txn=',JS)
        self.assertIn("await api('progress'",JS)
    def test_prominent_printer_button_css(self):
        self.assertIn('.work-actions .printed-action',CSS)
        self.assertIn('flex: 1 0 100%',CSS)
