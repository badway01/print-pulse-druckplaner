"""Print & Pulse A4 documents for local orders: internal workshop sheet and customer insert.

PDFs are generated in memory. Never include internal notes in the customer view.
The bundled web/brand.svg is the app's existing official Print & Pulse artwork.
"""
import base64
import datetime as dt
import io
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo('Europe/Berlin')
LOGO_PATH = Path(__file__).with_name('web') / 'brand.svg'


def _key(name):
    return unicodedata.normalize('NFKC', ' '.join(str(name).split())).casefold()


def customer_snapshot(db, order_id, include_internal=False):
    """Open orders for this customer are grouped. Completed orders print alone.

    Internal workshop notes are opt-in and NEVER fetched for customer handouts.
    """
    selected = db.execute(
        "SELECT * FROM pp_local_orders WHERE id=? AND status IN ('open','completed')",
        (order_id,),
    ).fetchone()
    if not selected:
        raise ValueError('Lokaler Auftrag ist nicht mehr offen oder abgeschlossen.')
    if selected['status'] == 'completed':
        records = [selected]
    else:
        records = [r for r in db.execute(
            "SELECT * FROM pp_local_orders WHERE status='open' ORDER BY due,created,id"
        ) if _key(r['customer']) == _key(selected['customer'])]
    if not records or len(records) > 120:
        raise ValueError('Zu viele offene Aufträge für einen Ausdruck.')
    titles = {}
    orders = []
    for record in records:
        raw = db.execute('SELECT lines_json FROM stock_receipts WHERE id=?',
                         (record['id'],)).fetchone()
        if not raw:
            raise ValueError('Bestellpositionen sind nicht vollständig.')
        lines = json.loads(raw['lines_json'])
        if not isinstance(lines, list) or not lines:
            raise ValueError('Bestellpositionen fehlen.')
        positions = []
        for line in lines:
            lid = str(line.get('listing_id') or '')
            if lid not in titles:
                item = db.execute('SELECT title FROM stock_listings WHERE id=?',
                                  (lid,)).fetchone()
                titles[lid] = item['title'] if item else 'Artikel nicht mehr im Katalog'
            qty = line.get('quantity')
            if type(qty) is not int or qty < 1:
                raise ValueError('Ungültige Positionsmenge.')
            position = {
                'title': str(line.get('custom_title') or titles[lid]) if line.get('custom_kind') else titles[lid],
                'quantity': qty,
                'variant': str(line.get('variant') or ''),
                'description': str(line.get('description') or ''),
                'color': str(line.get('color') or ''),
                'personalization': str(line.get('personalization') or ''),
            }
            if include_internal:
                position['note'] = str(line.get('note') or '')
            positions.append(position)
        order = {
            'id': record['id'],
            'created': record['created'],
            'due': record['due'],
            'fulfillment': record['fulfillment'],
            'status': record['status'],
            'items': positions,
        }
        if include_internal:
            order['notes'] = str(record['notes'] or '')
        orders.append(order)
    return {'customer': selected['customer'], 'orders': orders}


def _text(value):
    return escape(re.sub(r'[\x00-\x1f\x7f]', ' ', str(value or '')).strip())


@lru_cache(maxsize=1)
def _logo_png():
    """Recover the actual embedded WebP from the bundled brand.svg.

    Match its feColorMatrix transparency so the logo prints on white A4 without
    a creamy square or a replacement wordmark. No network or user-supplied path.
    """
    from PIL import Image
    source = LOGO_PATH.read_text(encoding='utf-8')
    match = re.search(r'data:image/webp;base64,([^"\s]+)', source)
    if not match:
        raise ValueError('Print & Pulse Logo fehlt in web/brand.svg.')
    original = Image.open(io.BytesIO(base64.b64decode(match.group(1), validate=True)))
    rgb = original.convert('RGB')
    pixels = rgb.getdata()
    # Equivalent to the SVG's alpha row: -4*R -4*G -4*B +11 (unit RGB).
    alpha = Image.frombytes('L', rgb.size, bytes(
        max(0, min(255, round(255 * (11 - 4 * (r + g + b) / 255))))
        for r, g, b in pixels
    ))
    rgba = rgb.convert('RGBA')
    rgba.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds:
        rgba = rgba.crop(bounds)
    buffer = io.BytesIO()
    rgba.save(buffer, format='PNG', optimize=True)
    return buffer.getvalue()


def render_pdf(snapshot, kind='customer'):
    """Generate an attractive, print-friendly multi-page A4 PDF.

    kind='customer': packing insert, without workshop notes or prices.
    kind='internal': full production checklist with internal notes.
    """
    if kind not in ('customer', 'internal'):
        raise ValueError('Unbekannte PDF-Vorlage.')
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.utils import ImageReader
    from reportlab.platypus import (
        KeepTogether, LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    regular, bold = 'Helvetica', 'Helvetica-Bold'
    for root in (
        Path('/usr/share/fonts/ttf-dejavu'),
        Path('/usr/share/fonts/dejavu'),
        Path('/usr/share/fonts/truetype/dejavu'),
    ):
        if (root / 'DejaVuSans.ttf').is_file() and (root / 'DejaVuSans-Bold.ttf').is_file():
            if 'PPA4Regular' not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont('PPA4Regular', str(root / 'DejaVuSans.ttf')))
                pdfmetrics.registerFont(TTFont('PPA4Bold', str(root / 'DejaVuSans-Bold.ttf')))
                pdfmetrics.registerFontFamily(
                    'PPA4Regular', normal='PPA4Regular', bold='PPA4Bold',
                    italic='PPA4Regular', boldItalic='PPA4Bold',
                )
            regular, bold = 'PPA4Regular', 'PPA4Bold'
            break

    green = colors.HexColor('#355F50')
    ink = colors.HexColor('#2F4038')
    muted = colors.HexColor('#68756D')
    pale = colors.HexColor('#F1F5F1')
    white = colors.white
    line = colors.HexColor('#D8E2D9')
    gold = colors.HexColor('#C29D69')
    styles = {
        'base': ParagraphStyle('PPBase', fontName=regular, fontSize=9, leading=14, textColor=ink),
        'small': ParagraphStyle('PPSmall', fontName=regular, fontSize=7.8, leading=12, textColor=muted),
        'bold': ParagraphStyle('PPStrong', fontName=bold, fontSize=9, leading=14, textColor=ink),
        'eyebrow': ParagraphStyle('PPEyebrow', fontName=bold, fontSize=7.5, leading=12, textColor=green),
        'title': ParagraphStyle('PPTitle', fontName=bold, fontSize=18, leading=25, textColor=green),
        'section': ParagraphStyle('PPSection', fontName=bold, fontSize=10.6, leading=15, textColor=green),
        'right': ParagraphStyle('PPRight', fontName=regular, fontSize=8, leading=12,
                                alignment=TA_RIGHT, textColor=muted),
        'thank': ParagraphStyle('PPThank', fontName=regular, fontSize=9.2,
                                leading=16, textColor=ink),
    }
    p = lambda value, name='base': Paragraph(_text(value), styles[name])
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=45, rightMargin=45,
        topMargin=128, bottomMargin=65,
        pageCompression=1, author='Print & Pulse',
        title=('Print & Pulse Werkstattauftrag' if kind == 'internal'
               else 'Print & Pulse Kundenbeileger'),
    )
    orders = snapshot['orders']
    total = sum(item['quantity'] for order in orders for item in order['items'])
    positions = sum(len(order['items']) for order in orders)
    date = lambda timestamp: dt.datetime.fromtimestamp(timestamp, BERLIN).strftime('%d.%m.%Y')
    now = dt.datetime.now(BERLIN)
    customer = kind == 'customer'
    story = [
        p('DEIN AUFTRAG BEI PRINT & PULSE' if customer else 'PRODUKTION · LOKAL', 'eyebrow'),
        Spacer(1, 5),
        p('Vielen Dank für deine Bestellung!' if customer else 'Werkstattauftrag', 'title'),
        Spacer(1, 12),
    ]
    box = Table([
        [p('FÜR' if customer else 'KUNDE', 'eyebrow'), p('AUFTRAGSÜBERSICHT', 'eyebrow')],
        [p(snapshot['customer'], 'bold'),
         p(f'{len(orders)} Auftrag/Aufträge · {total} Stück · {positions} Positionen')],
    ], colWidths=[246, 259], hAlign='LEFT')
    box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), pale),
        ('BOX', (0, 0), (-1, -1), 0.5, line),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 13),
        ('RIGHTPADDING', (0, 0), (-1, -1), 13),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 3),
        ('TOPPADDING', (0, 1), (-1, 1), 0),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 13),
    ]))
    story.extend([box, Spacer(1, 19)])

    for order in orders:
        mode = 'Versand' if order['fulfillment'] == 'shipping' else 'Abholung'
        status = 'Abgeschlossen' if order['status'] == 'completed' else 'In Bearbeitung'
        info = f'Bestellt: {date(order["created"])} · {mode}'
        if not customer:
            info += f' · Fällig: {date(order["due"])} · {status}'
        order_head = Table([
            [p('Auftrag ' + order['id'], 'section'), p(info, 'right')],
        ], colWidths=[190, 315], hAlign='LEFT')
        order_head.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 1.25, gold),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))
        story.extend([KeepTogether([order_head, Spacer(1, 8)])])
        data = [[p('MENGE', 'eyebrow'), p('ARTIKEL', 'eyebrow'),
                 p('AUSFÜHRUNG', 'eyebrow')]]
        for item in order['items']:
            descriptions = []
            if item['variant']:
                descriptions.append(('Ausführung', item['variant']))
            if item.get('description'):
                descriptions.append(('Beschreibung', item['description']))
            if item['color']:
                descriptions.append(('Farbe', item['color']))
            if item['personalization']:
                descriptions.append(('Personalisierung', item['personalization']))
            if not customer and item.get('note'):
                descriptions.append(('Interner Positionshinweis', item['note']))
            details = '<br/>'.join(
                '<b>' + _text(label) + ':</b> ' + _text(value)
                for label, value in descriptions
            ) if descriptions else 'Standardausführung'
            data.append([
                p(str(item['quantity']) + ' ×', 'bold'),
                p(item['title'], 'bold'),
                Paragraph(details, styles['small']),
            ])
        tab = LongTable(data, colWidths=[57, 185, 263], repeatRows=1, hAlign='LEFT')
        tab.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), pale),
            ('LINEBELOW', (0, 0), (-1, 0), 0.8, line),
            ('LINEBELOW', (0, 1), (-1, -1), 0.4, line),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, colors.HexColor('#FBFCFA')]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 9),
            ('RIGHTPADDING', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ]))
        story.extend([tab, Spacer(1, 11)])
        if not customer:
            if order.get('notes'):
                story.extend([
                    p('INTERNE AUFTRAGSNOTIZ', 'eyebrow'),
                    Spacer(1, 3), p(order['notes']), Spacer(1, 12),
                ])
            checks = Table([
                [p('[  ] Gefertigt / gelasert', 'small'), p('[  ] Qualität geprüft', 'small'),
                 p('[  ] Verpackt', 'small')],
                [p('[  ] Beileger dabei', 'small'), p('[  ] Versendet / übergeben', 'small'),
                 p('[  ] Auftrag erledigt', 'small')],
            ], colWidths=[160, 182, 163])
            checks.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), pale),
                ('BOX', (0, 0), (-1, -1), .5, line),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ]))
            story.extend([checks, Spacer(1, 6),
                          p('Notizen: ______________________________________________________________', 'small'),
                          Spacer(1, 18)])
        else:
            story.append(Spacer(1, 12))

    if customer:
        thanks = Table([[
            p('MIT LIEBE FÜR DICH GEFERTIGT', 'eyebrow')
        ], [
            Paragraph(
                'Schön, dass du dich für Print &amp; Pulse entschieden hast. '
                'Dein Produkt wurde mit viel Sorgfalt gefertigt. '
                'Wir wünschen dir ganz viel Freude damit!', styles['thank']),
        ]], colWidths=[505])
        thanks.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), pale),
            ('LINEBEFORE', (0, 0), (0, -1), 3, green),
            ('TOPPADDING', (0, 0), (-1, 0), 13),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            ('TOPPADDING', (0, 1), (-1, 1), 0),
            ('BOTTOMPADDING', (0, 1), (-1, 1), 13),
            ('LEFTPADDING', (0, 0), (-1, -1), 14),
            ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ]))
        story.extend([thanks, Spacer(1, 13),
                      p('Dies ist ein Beileger zur Bestellung, keine Rechnung.', 'small')])
    else:
        story.append(p('Internes Werkstattdokument · keine Rechnung.', 'small'))

    logo = _logo_png()
    def frame(canvas, document):
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(green)
        canvas.rect(0, height - 7, width, 7, stroke=0, fill=1)
        canvas.drawImage(ImageReader(io.BytesIO(logo)), 45, height - 102,
                         width=151, height=78, preserveAspectRatio=True, anchor='c',
                         mask='auto')
        canvas.setFillColor(green)
        canvas.setFont(bold, 10)
        canvas.drawRightString(width - 45, height - 44,
                               'KUNDENBEILEGER' if customer else 'WERKSTATTAUFTRAG')
        canvas.setFillColor(muted)
        canvas.setFont(regular, 7.9)
        canvas.drawRightString(width - 45, height - 59, 'PRINT & PULSE · DESIGNS MIT HERZ')
        canvas.setStrokeColor(gold)
        canvas.setLineWidth(1.25)
        canvas.line(45, height - 110, width - 45, height - 110)
        canvas.setStrokeColor(line)
        canvas.setLineWidth(0.5)
        canvas.line(45, 46, width - 45, 46)
        canvas.setFillColor(muted)
        canvas.setFont(regular, 7.5)
        canvas.drawString(45, 30, 'printandpulse.de')
        canvas.drawCentredString(width / 2, 30, 'Erstellt am ' + now.strftime('%d.%m.%Y'))
        canvas.drawRightString(width - 45, 30, 'Seite ' + str(document.page))
        canvas.restoreState()

    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    result = buffer.getvalue()
    if not result.startswith(b'%PDF-'):
        raise ValueError('Die PDF-Erzeugung hat kein gültiges Dokument geliefert.')
    return result


def safe_filename(customer, kind='customer'):
    value = unicodedata.normalize('NFKD', str(customer))
    name = re.sub(r'[^A-Za-z0-9_-]+', '-', ''.join(c for c in value if c.isascii())).strip('-')[:48]
    label = 'Werkstattauftrag' if kind == 'internal' else 'Kundenbeileger'
    return 'Print-Pulse-' + label + '-' + (name or 'Kunde') + '.pdf'
