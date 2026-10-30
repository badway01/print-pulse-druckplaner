"""Reject obviously unsafe artifacts and plausible embedded private identifiers."""
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parents[1]
allowed={'print_pulse_druckplaner/web/brand.svg', 'tests/ui.cjs', 'tests/ui_safari.cjs', 'tests/preview.py', 'print_pulse_druckplaner/web/app.js', 'print_pulse_druckplaner/config.yaml', 'repository.yaml', 'print_pulse_druckplaner/README.md', '.github/workflows/validate.yml', 'scripts/check_public.py', 'print_pulse_druckplaner/app.py', 'CHANGELOG.md', 'print_pulse_druckplaner/Dockerfile', 'print_pulse_druckplaner/CHANGELOG.md', '.gitignore', 'README.md', 'print_pulse_druckplaner/web/index.html', 'tests/test_order_prints.py', 'tests/test_stock.py', 'tests/test_filaments.py', 'tests/test_master.py', 'tests/test_etsy_stock_alert.py', 'tests/test_printer_monitor.py', 'print_pulse_druckplaner/web/style.css', 'print_pulse_druckplaner/components.py', 'print_pulse_druckplaner/safety.py', 'print_pulse_druckplaner/web/components-ui.js', 'print_pulse_druckplaner/web/priority-ui.js', 'print_pulse_druckplaner/web/import-ui.js', 'tests/test_etsy_imports.py', 'tests/test_components.py', 'tests/test_order_reservation_quick.py', 'tests/test_direct_component_completion.py', 'tests/test_safety.py', 'print_pulse_druckplaner/local_orders.py', 'print_pulse_druckplaner/local_order_pdf.py', 'print_pulse_druckplaner/web/local-orders-ui.js', 'tests/test_local_orders.py', 'tests/local_ui.cjs', 'print_pulse_druckplaner/web/dialog-behavior.js', 'tests/dialog_ui.cjs', 'print_pulse_druckplaner/web/order-zoom-ui.js', 'print_pulse_druckplaner/web/stock-orders-ui.js', 'tests/stock_orders_ui.cjs', 'tests/test_priority_dismiss.py', 'print_pulse_druckplaner/economics.py', 'print_pulse_druckplaner/web/economics-ui.js', 'tests/test_economics.py', 'tests/test_filament_planner.py', 'print_pulse_druckplaner/filament_planner.py', 'print_pulse_druckplaner/web/filament-planner-ui.js', 'print_pulse_druckplaner/web/filament-planner.css', 'print_pulse_druckplaner/filament_purchases.py', 'print_pulse_druckplaner/web/filament-purchases-ui.js', 'print_pulse_druckplaner/web/filament-purchases.css', 'tests/test_filament_purchases.py', 'tests/filament_purchases_ui.cjs'}
files={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and '__pycache__' not in str(p) and '.git/' not in str(p)}
errors=[]
if files!=allowed:
 errors.append(f'Unexpected/missing files: {sorted(files^allowed)}')
for name in sorted(files):
 if name == 'print_pulse_druckplaner/web/brand.png':
  if not (root/name).read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):errors.append('Brand asset is not PNG')
  continue
 data=(root/name).read_text(encoding='utf-8')
 if re.search(r'(?<!\d)\d{10,}(?!\d)',data):errors.append(f'Potential hardcoded order/listing/shop ID: {name}')
 if re.search(r'(?i)\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b',data):errors.append(f'Email address in code: {name}')
 if re.search(r'(?i)(?:(?:etsy[_-]?)?(?:api[_-]?)?(?:key|secret|token|password))\s*[:=]\s*[\\\"\\\']?[A-Za-z0-9_-]{20,}',data):errors.append(f'Potential embedded credential: {name}')
 if re.search(r'(?i)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',data):errors.append(f'Private key: {name}')
 if re.search(r'(?i)\b(?:sqlite3|production\.sqlite3|\.db)\b',name):errors.append(f'Database tracked: {name}')
if errors:
 print('PUBLICATION BLOCKED:')
 print('\n'.join(' - '+s for s in errors))
 sys.exit(1)
print(f'Public source scan: PASS ({len(files)} permitted source files)')
