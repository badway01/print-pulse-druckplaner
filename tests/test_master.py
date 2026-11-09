"""Regression tests for master-3MF storage, printer slots and backward-compatible filament fields."""
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

BOOT=tempfile.TemporaryDirectory()
os.environ['PP_DATA_DIR']=BOOT.name
spec=importlib.util.spec_from_file_location('printmaster_app',Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/app.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class MasterTests(unittest.TestCase):
    def test_supervisor_chunked_http_post_accepts_json_and_binary_parts(self):
        import http.client
        import json
        import threading
        from http.server import ThreadingHTTPServer

        class IngressTestHandler(app.Handler):
            def allowed(self):
                return True

        server=ThreadingHTTPServer(('127.0.0.1',0),IngressTestHandler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        def post_chunked(endpoint,body,content_type,headers=None):
            conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=8)
            try:
                conn.putrequest('POST',endpoint)
                conn.putheader('Transfer-Encoding','chunked')
                conn.putheader('Content-Type',content_type)
                for k,v in (headers or {}).items():
                    conn.putheader(k,v)
                conn.endheaders()
                half=max(1,len(body)//2)
                for piece in (body[:half],body[half:]):
                    if piece:
                        conn.send(('%X\r\n'%len(piece)).encode()+piece+b'\r\n')
                conn.send(b'0\r\n\r\n')
                response=conn.getresponse()
                payload=json.loads(response.read())
                self.assertEqual(response.status,200,payload)
                return payload
            finally:
                conn.close()
        try:
            buffer=io.BytesIO()
            with zipfile.ZipFile(buffer,'w') as archive:
                archive.writestr('[Content_Types].xml','<Types/>')
                archive.writestr('3D/3dmodel.model','test')
            contents=buffer.getvalue()
            meta={'listing_id':'123','variant_id':'','printer':'H2D',
                  'filename':'Geist Größe.3mf','size':len(contents)}
            started=post_chunked('/api/master-upload-start',
                                json.dumps(meta).encode(),'application/json')
            session=started['upload_id']
            posted=post_chunked('/api/master-upload-chunk',contents,
                'application/octet-stream',{'X-PP-Upload':'1',
                'X-PP-Upload-ID':session,'X-PP-Offset':'0'})
            self.assertEqual(posted['offset'],len(contents))
            finished=post_chunked('/api/master-upload-finish',
                json.dumps({'upload_id':session}).encode(),'application/json')
            self.assertEqual(app.master_download_record(finished['id'])[1].read_bytes(),contents)
            self.assertEqual(len(app.print_tools_overview('123')['files']),1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(3)

    def test_chunked_http_body_rejects_truncation_and_size_overrun(self):
        content=io.BytesIO(b'3\r\nabc\r\n0\r\n\r\n')
        output=io.BytesIO()
        self.assertEqual(app.read_chunked_http_body(content,output,3),3)
        self.assertEqual(output.getvalue(),b'abc')
        for broken,limit in ((b'4\r\nab',10),(b'5\r\nabcde\r\n0\r\n\r\n',4),
                             (b'x\r\nhi\r\n',10)):
            with self.assertRaises(ValueError):
                app.read_chunked_http_body(io.BytesIO(broken),io.BytesIO(),limit)

    def test_ingress_streaming_required_for_large_uploads(self):
        config=(Path(__file__).resolve().parents[1]/'print_pulse_druckplaner/config.yaml').read_text(encoding='utf-8')
        self.assertIn('ingress_stream: true',config)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.original_root=app.MASTER_ROOT
        self.original_import_root=app.MASTER_IMPORT_ROOT
        app.DB_PATH=Path(self.temp.name)/'production.sqlite3'
        app.MASTER_ROOT=Path(self.temp.name)/'share'
        app.MASTER_IMPORT_ROOT=Path(self.temp.name)/'3mf-eingang'
        app.init_db()
        with app.connect() as db:
            db.execute("INSERT INTO stock_listings(id,title,image,state,updated) VALUES('123','Testprodukt','','active',0)")
            db.execute("""INSERT INTO stock_items(id,listing_id,product_id,label,signature)
                       VALUES('variant1','123','v1','Weiß','')""")

    def tearDown(self):
        app.MASTER_ROOT=self.original_root
        app.MASTER_IMPORT_ROOT=self.original_import_root
        self.temp.cleanup()

    def test_shared_master_and_profile_cover_multiple_color_variants(self):
        # A color-only Etsy listing has several stock items, but its single
        # geometry/project can legitimately be shared by all variants.
        with app.connect() as db:
            db.execute("""INSERT INTO stock_items(id,listing_id,product_id,label,signature)
                VALUES('variant2','123','v2','Schwarz','')""")
        common={'listing_id':'123','variant_id':'','printer':'H2D'}
        shared_profile=app.save_print_profile({**common,'sources':[]})
        self.assertEqual([p['variant_id'] for p in shared_profile['profiles']],[''])
        payload=io.BytesIO()
        with zipfile.ZipFile(payload,'w') as archive:
            archive.writestr('[Content_Types].xml','<Types/>')
            archive.writestr('3D/3dmodel.model','shared geometry')
        content=payload.getvalue()
        shared=app.store_master_file({**common,'filename':'Alle Farben.3mf'},
                                     io.BytesIO(content),len(content))
        self.assertTrue(shared['ok'])
        listing=app.print_tools_overview('123')
        self.assertEqual(len(listing['files']),1)
        self.assertEqual(listing['files'][0]['variant_id'],'')
        self.assertEqual(app.master_download_record(shared['id'])[1].read_bytes(),content)
        # A deliberately selected variant can still have an independent 3MF
        # and filament profile without replacing the shared originals.
        app.save_print_profile({**common,'variant_id':'variant1','sources':[]})
        special=app.store_master_file({**common,'variant_id':'variant1',
                                     'filename':'Nur Weiß.3mf'},io.BytesIO(content),len(content))
        listing=app.print_tools_overview('123')
        self.assertEqual({f['variant_id'] for f in listing['files']},{'','variant1'})
        self.assertEqual(len(listing['profiles']),2)
        self.assertNotEqual(shared['id'],special['id'])
        # Only genuine variants from this listing may be explicitly assigned.
        with self.assertRaisesRegex(ValueError,'Variante gehört nicht'):
            app.save_print_profile({**common,'variant_id':'not-on-product','sources':[]})
        with self.assertRaisesRegex(ValueError,'Variante gehört nicht'):
            app.store_master_file({**common,'variant_id':'not-on-product',
                'filename':'Unbekannt.3mf'},io.BytesIO(content),len(content))

    def test_chunked_and_samba_shared_master_allow_multiple_variants(self):
        with app.connect() as db:
            db.execute("""INSERT INTO stock_items(id,listing_id,product_id,label,signature)
                VALUES('variant2','123','v2','Schwarz','')""")
        payload=io.BytesIO()
        with zipfile.ZipFile(payload,'w') as archive:
            archive.writestr('[Content_Types].xml','<Types/>')
            archive.writestr('3D/3dmodel.model','same geometry')
        content=payload.getvalue()
        meta={'listing_id':'123','variant_id':'','printer':'H2D',
              'filename':'Gemeinsam.3mf'}
        upload=app.start_master_upload({**meta,'size':len(content)})
        self.assertTrue(upload['upload_id'])
        # Original Samba-import route uses the same variant_id='' validation.
        inbox=app.master_share_import_directory()
        (inbox/'Gemeinsam.3mf').write_bytes(content)
        imported=app.import_master_from_share(meta)
        self.assertTrue(imported['ok'])
        self.assertEqual(app.master_download_record(imported['id'])[1].read_bytes(),content)
        self.assertEqual(app.print_tools_overview('123')['files'][0]['variant_id'],'')

    def spool(self):
        app.filament_mutate({'action':'save','id':None,'brand':'Bambu','color':'Weiß','material':'PLA Matte',
                             'stock_qty':2,'price':'14,50','purchase_url':'',
                             'color_hex':'#ffffff','internal_code':'1','notes':'Eigener interner Code'})
        f=app.filament_overview()['filaments'][0]
        self.assertEqual(f['internal_code'],'1')
        self.assertEqual(f['notes'],'Eigener interner Code')
        return f['id']

    def test_snapmaker_u1_four_toolheads_and_existing_bambu_profile(self):
        fid=self.spool()
        h2d=app.save_print_profile({'listing_id':'123','variant_id':'variant1',
            'printer':'H2D','sources':[{'type':'ams','slots':[fid,None,None,None],'side':'left'}]})
        u1_sources=[{'type':'toolhead','side':f't{i}','slots':[fid if i==2 else None]}
                    for i in range(4)]
        result=app.save_print_profile({'listing_id':'123','variant_id':'variant1',
            'printer':'Snapmaker U1','sources':u1_sources})
        u1=next(p for p in result['profiles'] if p['printer']=='Snapmaker U1')
        self.assertEqual([s['label'] for s in u1['sources']],['Kopf T0','Kopf T1','Kopf T2','Kopf T3'])
        self.assertEqual(u1['colors'][0]['slot'],'Kopf T2')
        self.assertEqual(u1['sources'][2]['slots'],[fid])
        self.assertEqual(next(p for p in result['profiles'] if p['printer']=='H2D')['sources'],
                         h2d['profiles'][0]['sources'])
        with self.assertRaisesRegex(ValueError,'statt AMS'):
            app.save_print_profile({'listing_id':'123','variant_id':'variant1',
                'printer':'Snapmaker U1','sources':[{'type':'ams','slots':[fid,None,None,None]}]})
        with self.assertRaisesRegex(ValueError,'nur einmal'):
            app.save_print_profile({'listing_id':'123','variant_id':'variant1',
                'printer':'Snapmaker U1','sources':[{'type':'toolhead','side':'t0','slots':[fid]},
                                                  {'type':'toolhead','side':'t0','slots':[None]}]})
        with self.assertRaisesRegex(ValueError,'Unbekannte Filamentquelle'):
            app.save_print_profile({'listing_id':'123','variant_id':'variant1',
                'printer':'P1S Old','sources':[{'type':'toolhead','side':'t0','slots':[fid]}]})

    def test_samba_inbox_import_preserves_source_and_existing_masters(self):
        inbox=app.master_share_import_directory()
        self.assertTrue(inbox.is_dir())
        filename='Base+Schnüre P1S.3mf'
        with zipfile.ZipFile(inbox/filename,'w') as archive:
            archive.writestr('[Content_Types].xml','<Types/>')
            archive.writestr('3D/3dmodel.model','sample')
        original=(inbox/filename).read_bytes()
        files=app.master_share_imports()['files']
        self.assertEqual([item['filename'] for item in files],[filename])
        meta={'listing_id':'123','variant_id':'variant1','printer':'P1S Old',
              'filename':filename}
        imported=app.import_master_from_share(meta)
        self.assertTrue(imported['ok'])
        self.assertEqual(app.master_download_record(imported['id'])[1].read_bytes(),original)
        self.assertEqual((inbox/filename).read_bytes(),original)
        second=app.import_master_from_share(meta)
        self.assertNotEqual(second['id'],imported['id'])
        self.assertEqual(len(app.print_tools_overview('123')['files']),2)
        self.assertEqual(len(app.master_share_imports()['files']),1)

    def test_samba_inbox_rejects_bad_files_symlinks_paths_and_products(self):
        inbox=app.master_share_import_directory()
        (inbox/'Unfertig.3mf').write_bytes(b'not-a-zip')
        (inbox/'notes.txt').write_text('test')
        directory=inbox/'Unterordner.3mf'
        directory.mkdir()
        external=Path(self.temp.name)/'outside.3mf'
        with zipfile.ZipFile(external,'w') as archive:
            archive.writestr('[Content_Types].xml','<Types/>')
        (inbox/'Verknuepfung.3mf').symlink_to(external)
        filenames=[f['filename'] for f in app.master_share_imports()['files']]
        self.assertEqual(filenames,['Unfertig.3mf'])
        meta={'listing_id':'123','variant_id':'','printer':'H2D',
              'filename':'Unfertig.3mf'}
        with self.assertRaises(ValueError):
            app.import_master_from_share(meta)
        for name in ('../outside.3mf','Verknuepfung.3mf','Unterordner.3mf','notes.txt'):
            with self.assertRaises(ValueError):
                app.import_master_from_share({**meta,'filename':name})
        with self.assertRaises(ValueError):
            app.import_master_from_share({**meta,'listing_id':'999'})
        self.assertEqual(app.print_tools_overview('123')['files'],[])
        self.assertEqual(external.stat().st_size,(inbox/'Verknuepfung.3mf').stat().st_size)

    def test_chunked_upload_recovers_overlaps_and_publishes_once(self):
        import io
        body_io=io.BytesIO()
        with zipfile.ZipFile(body_io,'w',compression=zipfile.ZIP_STORED) as archive:
            archive.writestr('[Content_Types].xml','<Types/>')
            archive.writestr('3D/3dmodel.model',os.urandom(app.MASTER_CHUNK_SIZE+137))
        body=body_io.getvalue()
        started=app.start_master_upload({
            'listing_id':'123','variant_id':'','printer':'H2D',
            'filename':'Geist groß.3mf','size':len(body)})
        upload_id=started['upload_id']
        self.assertEqual(started['chunk_size'],2*1024*1024)
        self.assertEqual(app.master_upload_state(upload_id)['offset'],0)
        first=body[:app.MASTER_CHUNK_SIZE]
        self.assertEqual(app.write_master_chunk(upload_id,0,first)['offset'],len(first))
        # Re-delivered and overlapping chunks must never duplicate or corrupt data.
        self.assertEqual(app.write_master_chunk(upload_id,0,first)['offset'],len(first))
        with self.assertRaises(ValueError):
            app.write_master_chunk(upload_id,0,b'changed')
        with self.assertRaises(ValueError):
            app.finish_master_upload(upload_id)
        overlap_at=len(first)-60
        second=body[overlap_at:overlap_at+100]
        self.assertEqual(app.write_master_chunk(upload_id,overlap_at,second)['offset'],
                         overlap_at+len(second))
        offset=overlap_at+len(second)
        while offset<len(body):
            result=app.write_master_chunk(upload_id,offset,body[offset:offset+app.MASTER_CHUNK_SIZE])
            offset=result['offset']
        self.assertEqual(offset,len(body))
        completed=app.finish_master_upload(upload_id)
        self.assertEqual(app.finish_master_upload(upload_id),completed)
        self.assertTrue(app.master_upload_state(upload_id)['complete'])
        self.assertEqual(app.master_download_record(completed['id'])[1].read_bytes(),body)
        self.assertEqual(len(app.print_tools_overview('123')['files']),1)
        self.assertFalse(app.master_upload_paths(upload_id)[1].exists())

    def test_chunked_upload_rejects_corruption_and_oversized_parts(self):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_STORED) as archive:
            archive.writestr('3D/3dmodel.model',b'A'*5000)
        body=bytearray(buf.getvalue())
        body[50] ^= 0xFF
        started=app.start_master_upload({
            'listing_id':'123','variant_id':'','printer':'H2D',
            'filename':'Defekt.3mf','size':len(body)})
        with self.assertRaises(ValueError):
            app.write_master_chunk(started['upload_id'],0,b'A'*(app.MASTER_CHUNK_SIZE+1))
        with self.assertRaises(ValueError):
            app.write_master_chunk(started['upload_id'],1,b'A')
        app.write_master_chunk(started['upload_id'],0,bytes(body))
        with self.assertRaises(ValueError):
            app.finish_master_upload(started['upload_id'])
        self.assertEqual(app.print_tools_overview('123')['files'],[])

    def test_delete_master_removes_only_selected_file_and_links(self):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('[Content_Types].xml','<Types/>')
        body=buf.getvalue()
        meta={'listing_id':'123','variant_id':'','printer':'H2D','filename':'Größen.3mf'}
        first=app.store_master_file(meta,io.BytesIO(body),len(body))['id']
        other=app.store_master_file(meta,io.BytesIO(body),len(body))['id']
        _,path=app.master_download_record(first)
        with app.connect() as db:
            db.execute("INSERT INTO pp_components(id,listing_id,name,kind,updated) VALUES('part','123','Schale','demand',0)")
        app.save_component_master_link({'component_id':'part','variant_id':'','printer':'H2D','file_id':first})
        app.save_order_master_default({'listing_id':'123','variant_id':'','file_id':first})
        app.delete_master_file({'id':first})
        self.assertFalse(path.exists())
        result=app.print_tools_overview('123')
        self.assertEqual([f['id'] for f in result['files']],[other])
        self.assertEqual(result['component_links'],[])
        self.assertEqual(result['order_master_defaults'],[])
        self.assertEqual(app.master_download_record(other)[1].read_bytes(),body)
        self.assertTrue(app.delete_master_file({'id':first})['ok'])

    def test_delete_master_failure_preserves_record_and_missing_file_can_be_removed(self):
        from unittest.mock import patch
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('[Content_Types].xml','<Types/>')
        body=buf.getvalue()
        meta={'listing_id':'123','variant_id':'','printer':'H2D','filename':'Test.3mf'}
        fid=app.store_master_file(meta,io.BytesIO(body),len(body))['id']
        _,path=app.master_download_record(fid)
        with patch.object(Path,'rename',side_effect=PermissionError('denied')):
            with self.assertRaises(PermissionError):app.delete_master_file({'id':fid})
        self.assertEqual(app.master_download_record(fid)[1].read_bytes(),body)
        path.unlink()
        app.delete_master_file({'id':fid})
        self.assertEqual(app.print_tools_overview('123')['files'],[])
        for invalid in ('../outside',None,123):
            with self.assertRaises(ValueError):app.delete_master_file({'id':invalid})

    def test_profile_slots_and_immutable_revisions(self):
        fid=self.spool()
        payload={'listing_id':'123','variant_id':'variant1','printer':'H2D',
                 'sources':[{'type':'ams','slots':[fid,None,None,None]},
                            {'type':'ams_ht','slots':[fid]}]}
        summary=app.save_print_profile(payload)
        self.assertEqual(len(summary['profiles']),1)
        self.assertEqual([x['code'] for x in summary['profiles'][0]['colors']],['1','1'])
        self.assertEqual(summary['profiles'][0]['sources'][0]['label'],'AMS 1')
        with io.BytesIO() as buf:
            with zipfile.ZipFile(buf,'w') as z:
                z.writestr('[Content_Types].xml','<Types/>')
                z.writestr('3D/3dmodel.model','model')
            content=buf.getvalue()
        meta={'listing_id':'123','variant_id':'variant1','printer':'H2D','filename':'Master 50.3mf'}
        first=app.store_master_file(meta,io.BytesIO(content),len(content))
        second=app.store_master_file(meta,io.BytesIO(content),len(content))
        self.assertNotEqual(first['id'],second['id'])
        self.assertEqual(len(app.print_tools_overview('123')['files']),2)
        row,path=app.master_download_record(first['id'])
        self.assertEqual(path.read_bytes(),content)
        self.assertEqual(row['filename'],'Master 50.3mf')
        self.assertTrue(str(path).startswith(str(app.MASTER_ROOT)))

    def test_persistent_component_3mf_mapping_and_product_isolation(self):
        with app.connect() as db:
            db.execute("""INSERT INTO pp_components(id,listing_id,name,kind,updated)
                VALUES('part-schale','123','Schale','demand',0)""")
            db.execute("""INSERT INTO stock_listings(id,title,image,state,updated)
                VALUES('124','Andere','','active',0)""")
            db.execute("""INSERT INTO pp_components(id,listing_id,name,kind,updated)
                VALUES('part-other','124','Schale','demand',0)""")
        with io.BytesIO() as buf:
            with zipfile.ZipFile(buf,'w') as z:
                z.writestr('[Content_Types].xml','<Types/>')
            body=buf.getvalue()
        meta={'listing_id':'123','variant_id':'','printer':'H2D','filename':'Schale.3mf'}
        master=app.store_master_file(meta,io.BytesIO(body),len(body))
        payload={'component_id':'part-schale','variant_id':'variant1',
                 'printer':'H2D','file_id':master['id']}
        result=app.save_component_master_link(payload)
        self.assertEqual(result['component_links'][0]['file_id'],master['id'])
        self.assertEqual(len(app.print_tools_overview('123')['component_links']),1)
        self.assertEqual(app.print_tools_overview('124')['component_links'],[])
        app.init_db()
        self.assertEqual(len(app.print_tools_overview('123')['component_links']),1)
        for changed in [
            {**payload,'component_id':'part-other'},
            {**payload,'printer':'P1S Old'},
            {**payload,'variant_id':'unknown'},
            {**payload,'file_id':'a'*24},
        ]:
            with self.assertRaises(ValueError):
                app.save_component_master_link(changed)
        self.assertEqual(len(app.print_tools_overview('123')['component_links']),1)
        result=app.save_component_master_link({**payload,'file_id':''})
        self.assertEqual(result['component_links'],[])
        self.assertEqual(len(app.print_tools_overview('123')['files']),1)

    def test_order_master_default_inherits_existing_and_new_orders(self):
        with io.BytesIO() as buf:
            with zipfile.ZipFile(buf,'w') as z:
                z.writestr('[Content_Types].xml','<Types/>')
            content=buf.getvalue()
        one=app.store_master_file({'listing_id':'123','printer':'H2D',
              'variant_id':'','filename':'MagSafe_Master.3mf'},io.BytesIO(content),len(content))
        chosen=app.save_order_master_default({'listing_id':'123','variant_id':'variant1','file_id':one['id']})
        self.assertEqual(len(chosen['order_master_defaults']),1)
        self.assertEqual(chosen['order_master_defaults'][0]['file_id'],one['id'])
        self.assertEqual(app.print_tools_overview('123')['order_master_defaults'][0]['variant_id'],'variant1')
        app.init_db()
        self.assertEqual(len(app.print_tools_overview('123')['order_master_defaults']),1)
        with app.connect() as db:
            db.execute("INSERT INTO stock_listings(id,title,image,state,updated) VALUES('124','Andere','','active',0)")
        for bad in ({'listing_id':'124','variant_id':'','file_id':one['id']},
                    {'listing_id':'123','variant_id':'missing','file_id':one['id']},
                    {'listing_id':'123','variant_id':'variant1','file_id':'a'*24}):
            with self.assertRaises(ValueError):
                app.save_order_master_default(bad)
        self.assertEqual(app.print_tools_overview('124')['order_master_defaults'],[])
        cleared=app.save_order_master_default({'listing_id':'123','variant_id':'variant1','file_id':''})
        self.assertEqual(cleared['order_master_defaults'],[])
        self.assertEqual(len(cleared['files']),1)

    def test_url_safe_unicode_master_filename_and_legacy_compatibility(self):
        import base64
        original='My_Acorn_beide_größen.3mf'
        token=base64.urlsafe_b64encode(original.encode('utf-8')).decode('ascii').rstrip('=')
        self.assertEqual(app.decode_master_upload_name({'filename_b64':[token]}),original)
        self.assertEqual(app.decode_master_upload_name({'filename':[original]}),original)
        for corrupt in ('nicht+base64','***','%C3%B6'):
            with self.assertRaises(ValueError):
                app.decode_master_upload_name({'filename_b64':[corrupt]})
        with io.BytesIO() as buf:
            with zipfile.ZipFile(buf,'w') as z:
                z.writestr('[Content_Types].xml','<Types/>')
            content=buf.getvalue()
        result=app.store_master_file({'listing_id':'123','printer':'H2D','variant_id':'',
           'filename':app.decode_master_upload_name({'filename_b64':[token]})},
           io.BytesIO(content),len(content))
        file,path=app.master_download_record(result['id'])
        self.assertEqual(file['filename'],original)
        self.assertEqual(path.read_bytes(),content)
        self.assertIn('My_Acorn_beide_gr__en.3mf',path.name)

    def test_reject_invalid_file_and_profile(self):
        self.spool()
        with self.assertRaises(ValueError):
            app.save_print_profile({'listing_id':'123','printer':'H2D','sources':[{'type':'ams','slots':[999]}]})
        with self.assertRaises(ValueError):
            app.save_print_profile({'listing_id':'123','printer':'H2D','sources':[{'type':'external','slots':[999]}]})
        with self.assertRaises(ValueError):
            app.store_master_file({'listing_id':'123','printer':'H2D','filename':'Master.3mf'},io.BytesIO(b'junk'),4)
        self.assertEqual(list(app.MASTER_ROOT.rglob('*.3mf')),[])
        with self.assertRaises(ValueError):
            app.store_master_file({'listing_id':'123','printer':'bad','filename':'Master.3mf'},io.BytesIO(b'junk'),4)

    def test_corrupted_profile_is_readable_without_rewriting_database(self):
        with app.connect() as db:
            db.execute("""INSERT INTO pp_master_filament_profiles(listing_id,variant_id,printer,sources_json,updated)
                          VALUES('123','','H2D','{broken-json',0)""")
        summary=app.print_tools_overview()
        self.assertEqual(len(summary['profiles']),1)
        self.assertEqual(summary['profiles'][0]['sources'],[])
        with app.connect() as db:
            raw=db.execute("SELECT sources_json FROM pp_master_filament_profiles WHERE listing_id='123'").fetchone()[0]
        self.assertEqual(raw,'{broken-json')

    def test_malformed_slots_cannot_break_all_saved_profiles(self):
        with app.connect() as db:
            db.execute("""INSERT INTO pp_master_filament_profiles(listing_id,variant_id,printer,sources_json,updated)
                        VALUES('123','','H2D',?,0)""",
                       ('[{"label":"AMS", "slots":"oops"},{"label":"Extern","slots":[null]}]',))
        result=app.print_tools_overview('123')
        self.assertEqual(len(result['profiles']),1)
        self.assertEqual(result['profiles'][0]['sources'],[{'label':'Extern','slots':[None]}])

    def test_pre_migration_spool_columns_can_still_be_read(self):
        with app.connect() as db:
            db.execute("ALTER TABLE filament_spools RENAME TO filament_spools_new")
            db.execute("""CREATE TABLE filament_spools(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand TEXT NOT NULL,color TEXT NOT NULL,material TEXT NOT NULL,
              color_hex TEXT NOT NULL DEFAULT '#c1c9c1',price_cents INTEGER,
              purchase_url TEXT NOT NULL DEFAULT '',stock_qty INTEGER NOT NULL DEFAULT 0,
              cart_qty INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL)""")
            db.execute("DROP TABLE filament_spools_new")
        self.assertEqual(app.print_tools_overview(),{'profiles':[],'files':[],'component_links':[],'order_master_defaults':[],'filaments_library':[]})

    def test_existing_filament_schema_is_migrated(self):
        with app.connect() as db:
            db.execute("ALTER TABLE filament_spools RENAME TO filament_spools_new")
            db.execute("""CREATE TABLE filament_spools(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              brand TEXT NOT NULL,color TEXT NOT NULL,material TEXT NOT NULL,
              color_hex TEXT NOT NULL DEFAULT '#c1c9c1',price_cents INTEGER,
              purchase_url TEXT NOT NULL DEFAULT '',stock_qty INTEGER NOT NULL DEFAULT 0,
              cart_qty INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL)""")
            db.execute("DROP TABLE filament_spools_new")
            db.execute("""INSERT INTO filament_spools(brand,color,material,created,updated)
                        VALUES('Bambu Lab','Silber','PLA',0,0)""")
        app.init_db()
        row=app.filament_overview()['filaments'][0]
        self.assertEqual((row['brand'],row['internal_code'],row['notes']),('Bambu Lab','',''))


    def test_legacy_conflicting_profile_schema_survives_and_new_profiles_work(self):
        # Reproduce the actual HA log: an existing table named print_profiles
        # has no listing_id, while the new master-3MF feature expects it.
        with app.connect() as db:
            db.execute("DROP TABLE pp_master_filament_profiles")
            db.execute("""CREATE TABLE print_profiles(
                profile_id INTEGER PRIMARY KEY, printer_name TEXT NOT NULL,
                preset TEXT NOT NULL)""")
            db.execute("""INSERT INTO print_profiles(profile_id,printer_name,preset)
                          VALUES(7,'Altgerät','Unverändert')""")
        app.init_db()
        self.assertEqual(app.print_tools_overview(),{'profiles':[],'files':[],'component_links':[],'order_master_defaults':[],'filaments_library':[]})
        fid=self.spool()
        saved=app.save_print_profile({'listing_id':'123','variant_id':'variant1','printer':'H2D',
                 'sources':[{'type':'external','slots':[fid]}]})
        self.assertEqual(len(saved['profiles']),1)
        self.assertEqual(saved['profiles'][0]['colors'][0]['color'],'Weiß')
        app.init_db()
        self.assertEqual(len(app.print_tools_overview('123')['profiles']),1)
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT * FROM print_profiles").fetchall()[0]['preset'],
                             'Unverändert')
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pp_master_filament_profiles").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM stock_items").fetchone()[0],1)

    def test_compatible_old_master_profiles_copy_without_replacing_new_changes(self):
        with app.connect() as db:
            db.execute("""CREATE TABLE print_profiles(
                listing_id TEXT NOT NULL,variant_id TEXT NOT NULL DEFAULT '',
                printer TEXT NOT NULL,sources_json TEXT NOT NULL DEFAULT '[]',
                updated INTEGER NOT NULL,PRIMARY KEY(listing_id,variant_id,printer))""")
            db.execute("""INSERT INTO print_profiles(listing_id,variant_id,printer,sources_json,updated)
                          VALUES('123','variant1','H2D','[]',100)""")
        app.init_db()
        self.assertEqual(len(app.print_tools_overview('123')['profiles']),1)
        app.save_print_profile({'listing_id':'123','variant_id':'variant1',
                                'printer':'H2D','sources':[{'type':'external','slots':[None]}]})
        app.init_db()  # repeat must never overwrite a newer profile
        with app.connect() as db:
            new=db.execute("""SELECT sources_json FROM pp_master_filament_profiles
                              WHERE listing_id='123'""").fetchone()[0]
            old=db.execute("""SELECT sources_json FROM print_profiles
                              WHERE listing_id='123'""").fetchone()[0]
            self.assertIn('external',new)
            self.assertEqual(old,'[]')


    def test_theme_reads_only_home_assistant_sun_with_system_fallback(self):
        from unittest.mock import patch
        for state,theme in [('above_horizon','light'),('below_horizon','dark'),
                            ('unavailable',None)]:
            with self.subTest(state=state),patch.object(app,'homeassistant_states',
                      return_value={'sun.sun':{'state':state}}):
                result=app.theme_sun_state()
                self.assertEqual(result['theme'],theme)
                self.assertEqual(result['source'],'sun.sun' if theme else 'system')
        with patch.object(app,'homeassistant_states',return_value={}):
            self.assertEqual(app.theme_sun_state(),{'theme':None,'source':'system'})
        with patch.object(app,'homeassistant_states',side_effect=RuntimeError('offline')):
            self.assertEqual(app.theme_sun_state(),{'theme':None,'source':'system'})

    def test_direct_samba_save_becomes_version_two_and_retains_previous_bytes(self):
        import time
        def project(walls):
            b=io.BytesIO()
            with zipfile.ZipFile(b,'w') as z:
                z.writestr('3D/3dmodel.model','identical mesh')
                z.writestr('Metadata/project_settings.config','{"wall_loops":"%s"}'%walls)
            return b.getvalue()
        initial=project(2)
        meta={'listing_id':'123','variant_id':'variant1','printer':'H2D','filename':'Geist.3mf'}
        saved=app.store_master_file(meta,io.BytesIO(initial),len(initial))
        before=app.print_tools_overview('123')
        self.assertEqual(before['files'][0]['revision_no'],1)
        _,path=app.master_download_record(saved['id'])
        change=project(3)
        path.write_bytes(change)
        os.utime(path,ns=(time.time_ns(),time.time_ns()))
        after=app.print_tools_overview('123')
        current=next(row for row in after['files'] if row['id']==saved['id'])
        prior=next(row for row in after['files'] if row['is_history'])
        self.assertEqual(current['revision_no'],2)
        self.assertEqual(prior['revision_no'],1)
        self.assertEqual(prior['origin_id'],saved['id'])
        self.assertEqual(app.master_download_record(prior['id'])[1].read_bytes(),initial)
        self.assertEqual(app.master_download_record(saved['id'])[1].read_bytes(),change)
        self.assertEqual(len([f for f in after['files'] if not f['is_history']]),1)
        self.assertEqual(next(f['revision_no'] for f in app.print_tools_overview('123')['files'] if not f['is_history']),2)
        restored=app.restore_master_revision({'current_id':saved['id'],'history_id':prior['id']})
        self.assertTrue(restored['ok'])
        latest=app.print_tools_overview('123')['files']
        active=next(f for f in latest if not f['is_history'])
        self.assertEqual(active['revision_no'],3)
        self.assertEqual(app.master_download_record(saved['id'])[1].read_bytes(),initial)
        self.assertEqual({f['revision_no'] for f in latest if f['is_history']},{1,2})

    def test_multi_printer_clones_require_slicer_review_and_are_idempotent(self):
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w') as archive:
            archive.writestr('3D/3dmodel.model','mesh')
        raw=b.getvalue()
        source=app.store_master_file({'listing_id':'123','variant_id':'variant1',
                                      'printer':'H2D','filename':'Master.3mf'},io.BytesIO(raw),len(raw))
        clones=app.clone_master_printers({'file_id':source['id'],
                'printers':['P1S Old','P1S New','Snapmaker U1','X2D']})
        self.assertEqual(len(clones['files']),4)
        self.assertTrue(clones['review_required'])
        again=app.clone_master_printers({'file_id':source['id'],
                'printers':['P1S Old','P1S New','Snapmaker U1','X2D']})
        self.assertTrue(all(row['existing'] for row in again['files']))
        files=app.print_tools_overview('123')['files']
        self.assertEqual(len(files),5)
        for row in files:
            self.assertEqual(app.master_download_record(row['id'])[1].read_bytes(),raw)
            if row['printer']!='H2D':
                self.assertFalse(row['verified'])
                self.assertTrue(row['needs_review'])
        with self.assertRaises(ValueError):
            app.clone_master_printers({'file_id':source['id'],'printers':['Unknown']})

    def test_compatible_h2d_wall_line_transfer_preserves_p1s_machine_settings(self):
        def archive(walls,machine,geometry='same'):
            b=io.BytesIO()
            with zipfile.ZipFile(b,'w') as z:
                z.writestr('3D/3dmodel.model',geometry)
                z.writestr('Metadata/project_settings.config',
                           __import__('json').dumps({'wall_loops':walls,'machine':machine,
                                              'sparse_infill_density':'15%'}))
            return b.getvalue()
        source_bytes=archive('3','H2D')
        target_bytes=archive('2','P1S')
        src=app.store_master_file({'listing_id':'123','variant_id':'variant1',
                'printer':'H2D','filename':'Test.3mf'},io.BytesIO(source_bytes),len(source_bytes))
        dst=app.store_master_file({'listing_id':'123','variant_id':'variant1',
                'printer':'P1S Old','filename':'Test.3mf'},io.BytesIO(target_bytes),len(target_bytes))
        request={'source_id':src['id'],'target_id':dst['id']}
        preview=app.sync_compatible_bambu_settings({**request,'action':'preview'})
        self.assertEqual(preview['changes'],{'wall_loops':{'old':'2','new':'3'}})
        app.sync_compatible_bambu_settings({**request,'action':'apply'})
        current=app.print_tools_overview('123')['files']
        p1s=next(f for f in current if f['id']==dst['id'])
        self.assertEqual(p1s['revision_no'],2)
        self.assertFalse(p1s['verified'])
        with zipfile.ZipFile(app.master_download_record(dst['id'])[1]) as z:
            settings=__import__('json').loads(z.read('Metadata/project_settings.config'))
        self.assertEqual(settings['wall_loops'],'3')
        self.assertEqual(settings['machine'],'P1S')
        self.assertEqual(len([f for f in current if f['is_history']]),1)
        app.verify_master_printer({'file_id':dst['id']})
        self.assertFalse(next(f for f in app.print_tools_overview('123')['files']
                              if f['id']==dst['id'])['needs_review'])

    def test_changelog_exposes_real_version_and_release_notes(self):
        result=app.version_history()
        self.assertEqual(result['version'],app.APP_VERSION)
        self.assertTrue(result['releases'])
        self.assertEqual(result['releases'][0]['version'],app.APP_VERSION)
        self.assertTrue(result['releases'][0]['changes'])
        self.assertLessEqual(len(result['releases']),16)


if __name__=='__main__':
    unittest.main()
