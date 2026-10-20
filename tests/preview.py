import importlib.util,os,tempfile,time
from pathlib import Path
os.environ['PP_DATA_DIR']=tempfile.mkdtemp(prefix='lager-preview-')
spec=importlib.util.spec_from_file_location('app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a);a.init_db();a.INGRESS_PEER='127.0.0.1'
catalog=[];txs=[]
for lid,title,variant,stock,qty in [('101','Geldgeschenk mit Reagenzglas','Weiß',1,14),('102','Kleine Winterdekoration','Beige',0,7),('103','Buchstaben mit Struktur','Eisblau',5,3),('104','Laternenhalter – Wunschfarbe','Schwarz',None,0)]:
 rows=[(lid+'-default',lid,lid+'1',variant,'[]',40,1)]
 if lid=='102':rows.append((lid+'-black',lid,lid+'2','Schwarz','[["1","2"]]',30,1))
 catalog.append(({'listing_id':lid,'title':title,'quantity':40,'state':'active'},'','',rows,True))
 if qty:txs.append((lid+'9',lid+'8',lid,lid+'1','[]',qty,int(time.time())-86400,'shipped'))
a.apply_snapshot(catalog,txs,set())
for lid,stock in [('101',1),('102',0),('103',5)]:a.mutate_stock({'id':lid+'-default','action':'set','quantity':stock,'revision':0})
with a.connect() as db:db.execute("UPDATE stock_listings SET made_to_order=1 WHERE id='101'")
a.ThreadingHTTPServer(('127.0.0.1',8099),a.Handler).serve_forever()
