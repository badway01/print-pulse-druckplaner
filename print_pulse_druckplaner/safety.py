"""Update-safe inventory journal and verified portable local backup.

No automatic data restoration: the only restore operation writes to a separate
staging directory and checks every file before the app offers the archive.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import tempfile
import time
import zipfile

BACKUP_FORMAT=1
MAX_BACKUP_BYTES=8*1024*1024*1024

def schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pp_audit(
      id TEXT PRIMARY KEY,created INTEGER NOT NULL,
      scope TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,
      before_json TEXT NOT NULL,after_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pp_audit_created ON pp_audit(created DESC);
    CREATE INDEX IF NOT EXISTS pp_audit_entity ON pp_audit(scope,entity_id,created DESC);

    CREATE TRIGGER IF NOT EXISTS pp_audit_item_updated
    AFTER UPDATE OF on_hand,in_print,minimum ON stock_items
    WHEN OLD.on_hand IS NOT NEW.on_hand OR OLD.in_print IS NOT NEW.in_print
         OR OLD.minimum IS NOT NEW.minimum
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'stock',NEW.id,'Bestand',
      json_object('stock',OLD.on_hand,'printing',OLD.in_print,'minimum',OLD.minimum),
      json_object('stock',NEW.on_hand,'printing',NEW.in_print,'minimum',NEW.minimum));
    END;

    CREATE TRIGGER IF NOT EXISTS pp_audit_component_updated
    AFTER UPDATE OF stock,printing_stock,target_stock ON pp_components
    WHEN OLD.stock IS NOT NEW.stock OR OLD.printing_stock IS NOT NEW.printing_stock
      OR OLD.target_stock IS NOT NEW.target_stock
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'component',NEW.id,'Bauteilbestand',
      json_object('stock',OLD.stock,'printing',OLD.printing_stock,'target',OLD.target_stock),
      json_object('stock',NEW.stock,'printing',NEW.printing_stock,'target',NEW.target_stock));
    END;

    CREATE TRIGGER IF NOT EXISTS pp_audit_component_order_added
    AFTER INSERT ON pp_component_orders
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'component-order',NEW.transaction_id||':'||NEW.component_id,'Bauteil zugeordnet',
      '{}',json_object('booked',NEW.booked,'printing',NEW.printing,
        'finished',NEW.finished,'consumed',NEW.consumed));
    END;

    CREATE TRIGGER IF NOT EXISTS pp_audit_component_order_updated
    AFTER UPDATE OF booked,printing,finished,consumed ON pp_component_orders
    WHEN OLD.booked IS NOT NEW.booked OR OLD.printing IS NOT NEW.printing
       OR OLD.finished IS NOT NEW.finished OR OLD.consumed IS NOT NEW.consumed
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'component-order',NEW.transaction_id||':'||NEW.component_id,'Bauteilauftrag',
      json_object('booked',OLD.booked,'printing',OLD.printing,
        'finished',OLD.finished,'consumed',OLD.consumed),
      json_object('booked',NEW.booked,'printing',NEW.printing,
        'finished',NEW.finished,'consumed',NEW.consumed));
    END;

    CREATE TRIGGER IF NOT EXISTS pp_audit_component_order_deleted
    BEFORE DELETE ON pp_component_orders
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'component-order',OLD.transaction_id||':'||OLD.component_id,'Auftrag beendet',
      json_object('booked',OLD.booked,'printing',OLD.printing,
        'finished',OLD.finished,'consumed',OLD.consumed),'{}');
    END;

    CREATE TRIGGER IF NOT EXISTS pp_audit_print_added
    AFTER INSERT ON stock_order_prints
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'order-print',NEW.transaction_id,'Auftragsdruck',
      '{}',json_object('printing',NEW.printing,'finished',NEW.finished,
        'allocated',NEW.allocated,'assembled',NEW.assembled));
    END;

    CREATE TRIGGER IF NOT EXISTS pp_audit_print_updated
    AFTER UPDATE OF printing,finished,allocated,assembled ON stock_order_prints
    WHEN OLD.printing IS NOT NEW.printing OR OLD.finished IS NOT NEW.finished
         OR OLD.allocated IS NOT NEW.allocated OR OLD.assembled IS NOT NEW.assembled
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'order-print',NEW.transaction_id,'Auftragsdruck',
      json_object('printing',OLD.printing,'finished',OLD.finished,
        'allocated',OLD.allocated,'assembled',OLD.assembled),
      json_object('printing',NEW.printing,'finished',NEW.finished,
        'allocated',NEW.allocated,'assembled',NEW.assembled));
    END;

    CREATE TRIGGER IF NOT EXISTS pp_audit_tx_shipped
    AFTER UPDATE OF status ON stock_transactions
    WHEN OLD.status != NEW.status
    BEGIN
      INSERT INTO pp_audit VALUES(lower(hex(randomblob(16))),strftime('%s','now'),
      'etsy',NEW.id,'Etsy-Auftrag',
      json_object('status',OLD.status,'qty',OLD.qty),
      json_object('status',NEW.status,'qty',NEW.qty));
    END;
    """)

def report(db, limit=80):
    limit=max(1,min(int(limit),150))
    events=[dict(r) for r in db.execute(
        "SELECT * FROM pp_audit ORDER BY created DESC,rowid DESC LIMIT ?",(limit,))]
    item_ids=[e['entity_id'] for e in events if e['scope']=='stock']
    part_ids=[e['entity_id'] for e in events if e['scope']=='component']
    names={}
    for iid in set(item_ids):
        row=db.execute("""SELECT l.title,i.label FROM stock_items i
          JOIN stock_listings l ON l.id=i.listing_id WHERE i.id=?""",(iid,)).fetchone()
        if row:names['stock:'+iid]=row['title']+' · '+row['label']
    for pid in set(part_ids):
        row=db.execute("""SELECT l.title,p.name FROM pp_components p
          JOIN stock_listings l ON l.id=p.listing_id WHERE p.id=?""",(pid,)).fetchone()
        if row:names['component:'+pid]=row['name']+' · '+row['title']
    out=[]
    labels={'stock':'Fertigwarenlager','component':'Bauteilvorrat',
      'component-order':'Bauteilauftrag','order-print':'Kundenauftrag','etsy':'Etsy-Synchronisation'}
    for e in events:
        a=json.loads(e['before_json']);b=json.loads(e['after_json'])
        changed=[]
        for key in ('stock','printing','minimum','booked','finished','allocated','assembled',
                    'consumed','target','status'):
            if a.get(key)!=b.get(key):
                x=b.get(key);y=a.get(key)
                delta=('+' if x-y>0 else '')+str(x-y) if type(x)==int and type(y)==int else ''
                changed.append({'field':key,'before':y,'after':x,'delta':delta})
        if e['scope']=='component-order':
            cid=e['entity_id'].partition(':')[2]
            part=db.execute("SELECT name FROM pp_components WHERE id=?",(cid,)).fetchone()
            title=(part['name'] if part else 'Bauteil')+' · Kundenauftrag'
        elif e['scope'] in ('order-print','etsy'):
            title='Etsy-Auftrag'
        else:
            title=names.get(e['scope']+':'+e['entity_id'],'Nicht mehr vorhandener Artikel')
        out.append({'created':e['created'],'category':labels.get(e['scope'],e['scope']),
            'title':title,'action':e['action'],'changes':changed})
    return out

def _sha256(file_obj):
    h=hashlib.sha256()
    size=0
    while True:
        block=file_obj.read(1024*1024)
        if not block:break
        size+=len(block);h.update(block)
    return h.hexdigest(),size

def build_backup(db_path,master_root,archive):
    """Use sqlite3 backup API (WAL-consistent), then zip and verify the copy."""
    db_path=Path(db_path);master_root=Path(master_root);archive=Path(archive)
    archive.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pp-backup-sqlite-',dir=archive.parent) as scratch:
        clone=Path(scratch)/'production.sqlite3'
        with sqlite3.connect(str(db_path),timeout=30) as source, sqlite3.connect(str(clone)) as target:
            source.backup(target)
        with sqlite3.connect(str(clone)) as conn:
            if conn.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise ValueError('SQLite-Datenbank konnte nicht fehlerfrei kopiert werden.')
            listed=[row[0] for row in conn.execute('SELECT relative_path FROM master_files')]
        paths={}
        if master_root.exists():
            for path in sorted(master_root.rglob('*')):
                if path.is_symlink():raise ValueError('Verknüpfungen im 3MF-Verzeichnis werden nicht gesichert.')
                if not path.is_file():continue
                relative=path.relative_to(master_root).as_posix()
                paths[relative]=path
        if not set(listed).issubset(paths):
            raise ValueError('Mindestens eine registrierte Master-3MF-Datei fehlt. Sicherung abgebrochen.')
        total=clone.stat().st_size+sum(path.stat().st_size for path in paths.values())
        if total>MAX_BACKUP_BYTES:
            raise ValueError('Sicherung größer als 8 GB; zuerst die Dateisammlung prüfen.')
        files={}
        try:
            with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
                entries=[('production.sqlite3',clone)]+[
                    ('masterdateien/'+name,path) for name,path in paths.items()]
                for name,path in entries:
                    with path.open('rb') as source, z.open(name,'w',force_zip64=True) as sink:
                        h=hashlib.sha256();size=0
                        for block in iter(lambda:source.read(1024*1024),b''):
                            size+=len(block);h.update(block);sink.write(block)
                    files[name]={'sha256':h.hexdigest(),'bytes':size}
                manifest={'format':'print-pulse-backup','version':BACKUP_FORMAT,
                    'created_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
                    'files':files,'master_files_count':len(paths),
                    'contains_credentials':True}
                z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,
                            separators=(',',':')))
            with tempfile.TemporaryDirectory(prefix='pp-verify-',dir=archive.parent) as verify_dir:
                restore_to_staging(archive,verify_dir)
            return {'files':len(paths)+1,'master_files':len(paths),'bytes':archive.stat().st_size}
        except BaseException:
            archive.unlink(missing_ok=True)
            raise

def restore_to_staging(archive,staging):
    """Strictly validate a backup by restoring it to a non-production directory."""
    archive=Path(archive);staging=Path(staging)
    staging.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        entries=z.namelist()
        if len(entries)!=len(set(entries)) or 'manifest.json' not in entries:
            raise ValueError('Ungültige oder doppelte Dateien im Sicherungsarchiv.')
        try:manifest=json.loads(z.read('manifest.json'))
        except (ValueError,KeyError) as exc:raise ValueError('Sicherungsmanifest fehlt oder ist beschädigt.') from exc
        if manifest.get('format')!='print-pulse-backup' or manifest.get('version')!=BACKUP_FORMAT:
            raise ValueError('Nicht unterstütztes Sicherungsformat.')
        files=manifest.get('files')
        if not isinstance(files,dict) or 'production.sqlite3' not in files or set(entries)!=(set(files)|{'manifest.json'}):
            raise ValueError('Sicherung enthält unbekannte oder fehlende Dateien.')
        for name,meta in files.items():
            safe=PurePosixPath(name)
            if (name.startswith('/') or '\\' in name or not safe.parts or
                '..' in safe.parts or (name!='production.sqlite3' and
                not (name.startswith('masterdateien/') and len(safe.parts)>1))):
                raise ValueError('Ungültiger Dateipfad im Sicherungsarchiv.')
            if not isinstance(meta,dict) or not isinstance(meta.get('sha256'),str):
                raise ValueError('Ungültige Prüfsumme.')
            dest=staging.joinpath(*safe.parts)
            dest.parent.mkdir(parents=True,exist_ok=True)
            with z.open(name) as source,dest.open('xb') as target:
                h=hashlib.sha256();size=0
                for block in iter(lambda:source.read(1024*1024),b''):
                    size+=len(block);h.update(block);target.write(block)
            if meta['sha256']!=h.hexdigest() or meta.get('bytes')!=size:
                raise ValueError('Prüfsumme der Datei stimmt nicht: '+name)
    with sqlite3.connect(str(staging/'production.sqlite3')) as conn:
        if conn.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise ValueError('Wiederhergestellte SQLite-Datenbank ist beschädigt.')
        mandatory={'stock_items','stock_listings','pp_components','master_files','pp_audit'}
        tables={row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not mandatory.issubset(tables):
            raise ValueError('Wichtige Tabellen fehlen in der Sicherung.')
        refs=[row[0] for row in conn.execute('SELECT relative_path FROM master_files')]
        if any(not (staging/'masterdateien'/ref).is_file() for ref in refs):
            raise ValueError('Masterdatei-Verweise lassen sich nicht wiederherstellen.')
    return {'ok':True,'files':len(files),'master_files':len(files)-1}
