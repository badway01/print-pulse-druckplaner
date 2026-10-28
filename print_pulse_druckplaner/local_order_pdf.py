"""Branded A4 document for current local orders of a single customer, never Etsy."""
import datetime as dt
import io
import json
import re
import unicodedata
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

BERLIN=ZoneInfo('Europe/Berlin')


def _key(name):
    return unicodedata.normalize('NFKC',' '.join(str(name).split())).casefold()


def customer_snapshot(db,order_id):
    """Open orders are grouped by customer; archived orders print individually."""
    selected=db.execute("SELECT * FROM pp_local_orders WHERE id=? AND status IN ('open','completed')",(order_id,)).fetchone()
    if not selected: raise ValueError('Lokaler Auftrag ist nicht mehr offen oder abgeschlossen.')
    if selected['status']=='completed':
        records=[selected]
    else:
        records=[r for r in db.execute(
            "SELECT * FROM pp_local_orders WHERE status='open' ORDER BY due,created,id"
        ) if _key(r['customer'])==_key(selected['customer'])]
    if not records or len(records)>120: raise ValueError('Zu viele offene Aufträge für einen Ausdruck.')
    titles={}
    orders=[]
    for record in records:
        raw=db.execute('SELECT lines_json FROM stock_receipts WHERE id=?',(record['id'],)).fetchone()
        if not raw: raise ValueError('Bestellpositionen sind nicht vollständig.')
        lines=json.loads(raw['lines_json'])
        if not isinstance(lines,list) or not lines: raise ValueError('Bestellpositionen fehlen.')
        positions=[]
        for line in lines:
            lid=str(line.get('listing_id') or '')
            if lid not in titles:
                item=db.execute('SELECT title FROM stock_listings WHERE id=?',(lid,)).fetchone()
                titles[lid]=item['title'] if item else 'Artikel nicht mehr im Katalog'
            qty=line.get('quantity')
            if type(qty) is not int or qty<1: raise ValueError('Ungültige Positionsmenge.')
            positions.append(dict(title=titles[lid],quantity=qty,variant=str(line.get('variant') or ''),
                 color=str(line.get('color') or ''),personalization=str(line.get('personalization') or '')))
        orders.append(dict(id=record['id'],created=record['created'],due=record['due'],
                          fulfillment=record['fulfillment'],items=positions))
    return {'customer':selected['customer'],'orders':orders}


def _text(value):
    return escape(re.sub(r'[\x00-\x1f\x7f]',' ',str(value or '')).strip())


def render_pdf(snapshot):
    """Generate a multi-page A4 PDF using ReportLab, in memory, without customer notes."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    regular,bold='Helvetica','Helvetica-Bold'
    for root in (Path('/usr/share/fonts/ttf-dejavu'),Path('/usr/share/fonts/dejavu'),
                 Path('/usr/share/fonts/truetype/dejavu')):
        if (root/'DejaVuSans.ttf').is_file() and (root/'DejaVuSans-Bold.ttf').is_file():
            if 'PPA4Regular' not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont('PPA4Regular',str(root/'DejaVuSans.ttf')))
                pdfmetrics.registerFont(TTFont('PPA4Bold',str(root/'DejaVuSans-Bold.ttf')))
                pdfmetrics.registerFontFamily('PPA4Regular',normal='PPA4Regular',
                                             bold='PPA4Bold',italic='PPA4Regular',
                                             boldItalic='PPA4Bold')
            regular,bold='PPA4Regular','PPA4Bold'
            break

    green=colors.HexColor('#355F50')
    ink=colors.HexColor('#343F39')
    muted=colors.HexColor('#626F67')
    pale=colors.HexColor('#EEF3EF')
    line=colors.HexColor('#D8E1DB')
    gold=colors.HexColor('#C29D69')
    base=ParagraphStyle('PPA4',fontName=regular,fontSize=9,leading=14,
                        textColor=ink,splitLongWords=True)
    light=ParagraphStyle('PPA4Light',parent=base,fontSize=8,leading=12,textColor=muted)
    strong=ParagraphStyle('PPA4Strong',parent=base,fontName=bold)
    smallcap=ParagraphStyle('PPA4Small',parent=light,fontName=bold,textColor=green)
    title=ParagraphStyle('PPA4Title',parent=strong,fontSize=15,leading=21,textColor=green)
    right=ParagraphStyle('PPA4Right',parent=base,alignment=TA_RIGHT,fontSize=8)
    p=lambda val,style=base:Paragraph(_text(val),style)
    buff=io.BytesIO()
    doc=SimpleDocTemplate(buff,pagesize=A4,leftMargin=45,rightMargin=45,
                          topMargin=104,bottomMargin=59,pageCompression=1,
                          author='Print & Pulse',title='Print & Pulse Kundenauftrag A4')
    orders=snapshot['orders']
    total=sum(i['quantity'] for o in orders for i in o['items'])
    date=lambda t:dt.datetime.fromtimestamp(t,BERLIN).strftime('%d.%m.%Y')
    now=dt.datetime.now(BERLIN)
    story=[p('Auftragsübersicht',title),Spacer(1,9)]
    box=Table([
      [p('KUNDE',smallcap),p('AUFTRÄGE',smallcap)],
      [p(snapshot['customer'],strong),
       p(str(len(orders))+' Aufträge · '+str(total)+' Stück · '+
         str(sum(len(o['items']) for o in orders))+' Positionen')]
    ],colWidths=[253,252])
    box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),pale),
      ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),12),
      ('TOPPADDING',(0,0),(-1,0),11),('BOTTOMPADDING',(0,0),(-1,0),2),
      ('TOPPADDING',(0,1),(-1,1),0),('BOTTOMPADDING',(0,1),(-1,1),13)]))
    story.extend([box,Spacer(1,18)])
    for order in orders:
        mode='Versand' if order['fulfillment']=='shipping' else 'Abholung'
        head=Table([[
          p('Auftrag '+order['id'],strong),
          p('Bestellt: '+date(order['created'])+'  ·  Fertig bis: '+date(order['due'])+'  ·  '+mode,right)
        ]],colWidths=[176,329])
        head.setStyle(TableStyle([
          ('LINEBELOW',(0,0),(-1,-1),1.2,green),
          ('BOTTOMPADDING',(0,0),(-1,-1),9),
          ('TOPPADDING',(0,0),(-1,-1),5),
          ('LEFTPADDING',(0,0),(-1,-1),0),
          ('RIGHTPADDING',(0,0),(-1,-1),0),
          ('VALIGN',(0,0),(-1,-1),'TOP')]))
        story.extend([head,Spacer(1,7)])
        data=[[p('POS.',smallcap),p('ARTIKEL',smallcap),
               p('MENGE',smallcap),p('AUSFÜHRUNG',smallcap)]]
        for index,item in enumerate(order['items'],1):
            labels=[]
            if item['variant']:labels.append('Variante: '+_text(item['variant']))
            if item['color']:labels.append('Wunschfarbe: '+_text(item['color']))
            if item['personalization']:labels.append('Personalisierung: '+_text(item['personalization']))
            data.append([p(str(index)),p(item['title']),p(str(item['quantity'])+' ×',strong),
                         Paragraph('<br/>'.join(labels) if labels else 'Standardausführung',light)])
        tab=Table(data,colWidths=[34,177,53,241],repeatRows=1,hAlign='LEFT')
        tab.setStyle(TableStyle([
         ('BACKGROUND',(0,0),(-1,0),pale),
         ('LINEBELOW',(0,0),(-1,0),0.7,line),
         ('LINEBELOW',(0,1),(-1,-1),0.35,line),
         ('VALIGN',(0,0),(-1,-1),'TOP'),
         ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
         ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
        story.extend([tab,Spacer(1,19)])
    story.append(p('Auftragsübersicht, keine Rechnung. Preise, Zahlungsdaten und '
                   'interne Werkstattnotizen sind nicht Bestandteil dieses Ausdrucks.',light))
    def frame(c,document):
        width,height=A4
        c.saveState()
        c.setFillColor(green)
        c.rect(0,height-9,width,9,stroke=0,fill=1)
        c.setFont(bold,19)
        c.drawString(45,height-50,'PRINT & PULSE')
        c.setStrokeColor(gold)
        c.setLineWidth(2)
        c.line(45,height-64,width-45,height-64)
        c.setFont(regular,8)
        c.setFillColor(muted)
        c.drawString(45,height-79,'LOKALE BESTELLUNGEN  ·  A4-KUNDENAUSDRUCK')
        c.setStrokeColor(line)
        c.setLineWidth(.5)
        c.line(45,43,width-45,43)
        c.setFont(regular,8)
        c.drawString(45,29,'Erstellt am '+now.strftime('%d.%m.%Y · %H:%M')+' Uhr')
        c.drawRightString(width-45,29,'Seite '+str(document.page))
        c.restoreState()
    doc.build(story,onFirstPage=frame,onLaterPages=frame)
    return buff.getvalue()


def safe_filename(customer):
    value=unicodedata.normalize('NFKD',str(customer))
    name=re.sub(r'[^A-Za-z0-9_-]+','-',''.join(c for c in value if c.isascii())).strip('-')[:48]
    return 'Print-Pulse-Auftrag-'+(name or 'Kunde')+'.pdf'
