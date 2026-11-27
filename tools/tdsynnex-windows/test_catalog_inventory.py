import ast
import base64
from contextlib import closing
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlencode
import catalog_inventory as inv
from prepare_catalog_browse import patch_source


class FullCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'catalog.sqlite'
        with closing(sqlite3.connect(self.db)) as con:
            con.execute('CREATE TABLE products (id INTEGER PRIMARY KEY,mfg_part TEXT,supplier_sku TEXT,distributor_id TEXT,description TEXT,manufacturer TEXT,product_family TEXT,field13_price_candidate REAL,field14_price_candidate REAL,field10_quantity_candidate INTEGER,field11_quantity_candidate INTEGER)')
            con.execute('CREATE VIRTUAL TABLE product_search USING fts5(description,mfg_part,manufacturer)')
            con.execute('CREATE TABLE catalog_meta (key TEXT PRIMARY KEY,value TEXT)')
            for i in range(1,124):
                maker='LENOVO' if i%2 else 'EXAMPLE'
                desc='ThinkPad laptop '+str(i) if i%2 else 'Network switch '+str(i)
                con.execute('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?)',(i,'PART-'+str(i),'SUP-'+str(i),str(1000+i),desc,maker,'TPP',9999,19999,999,999))
                con.execute('INSERT INTO product_search(rowid,description,mfg_part,manufacturer) VALUES(?,?,?,?)',(i,desc,'PART-'+str(i),maker))
            con.execute('INSERT INTO catalog_meta VALUES(?,?)',('product_count','999999'))
            con.commit()
        self.before=self.db.read_bytes()
        self.category=lambda c: (' AND p.manufacturer = ?', ['LENOVO']) if c=='laptops' else ('',[])
    def tearDown(self):
        self.assertEqual(self.before,self.db.read_bytes(),'Read-only browse must not change index bytes')
        self.temp.cleanup()
    def browse(self,**kw):return inv.browse_catalog(self.db,{k:[str(v)] for k,v in kw.items()},self.category)
    def test_info_measures_all_rows_not_saved_selection_or_stale_meta(self):
        d=inv.catalog_info(self.db);self.assertEqual(d['totalRecords'],123);self.assertEqual(d['cloudCopy'],False);self.assertNotIn(str(self.db),json.dumps(d));self.assertFalse(d['priceVerified'])
    def test_empty_browse_reads_all_pages_without_duplicates(self):
        all_rows=[];cursor=''
        while True:
            d=self.browse(cursor=cursor);all_rows+=d['items']
            if not d['hasMore']:break
            cursor=d['nextCursor']
        self.assertEqual(len(all_rows),123);self.assertEqual(len({r['distributorId'] for r in all_rows}),123)
    def test_output_never_exposes_raw_prices_or_stock(self):
        for r in self.browse()['items']:self.assertEqual(set(r),{'mfgPart','supplierSku','distributorId','description','manufacturer','productFamily'})
    def test_category_filter_runs_before_pagination(self):
        a=self.browse(category='laptops');b=self.browse(category='laptops',cursor=a['nextCursor']);self.assertEqual(len(a['items']),50);self.assertEqual(len(b['items']),12);self.assertTrue(all(r['manufacturer']=='LENOVO' for r in a['items']+b['items']))
    def test_keyword_and_maker_filters_query_the_whole_source(self):
        d=self.browse(q='ThinkPad',maker='Lenovo');self.assertEqual(len(d['items']),50);self.assertTrue(d['hasMore']);self.assertTrue(all(x['manufacturer']=='LENOVO' for x in d['items']))
    def test_cursor_bound_to_filters(self):
        c=self.browse()['nextCursor']
        with self.assertRaises(inv.CatalogRequestError) as ctx:self.browse(category='laptops',cursor=c)
        self.assertEqual(ctx.exception.status,409)
    def test_cursor_rejects_stale_snapshot(self):
        c=self.browse()['nextCursor'];stat=self.db.stat();os.utime(self.db,ns=(stat.st_atime_ns,stat.st_mtime_ns+1000000))
        with self.assertRaises(inv.CatalogRequestError) as ctx:self.browse(cursor=c)
        self.assertEqual(ctx.exception.status,409)
    def test_replacing_file_with_preserved_mtime_invalidates_cursor(self):
        cursor=self.browse()['nextCursor'];stat=self.db.stat()
        other=self.db.with_suffix('.replacement');other.write_bytes(self.before)
        os.utime(other,ns=(stat.st_atime_ns,stat.st_mtime_ns));os.replace(other,self.db)
        with self.assertRaises(inv.CatalogRequestError) as ctx:self.browse(cursor=cursor)
        self.assertEqual(ctx.exception.status,409)
    def test_installer_embeds_two_distinct_compilable_modules(self):
        import re
        root=Path(__file__).parent
        source=(root/'ENABLE_FULL_CATALOG.ps1').read_text()
        payloads=re.findall(r'FromBase64String\("([A-Za-z0-9+/=]+)"\)',source)
        self.assertEqual(len(payloads),2)
        decoded=[base64.b64decode(p,validate=True) for p in payloads]
        self.assertEqual(decoded[0],(root/'catalog_inventory.py').read_bytes())
        self.assertEqual(decoded[1],(root/'prepare_catalog_browse.py').read_bytes())
        for i,content in enumerate(decoded):compile(content,'embedded-'+str(i),'exec')
        self.assertIn(__import__('hashlib').sha256(decoded[0]).hexdigest(),source)
    def test_no_fifty_thousand_row_offset_limit(self):
        d=self.browse();fingerprint=__import__('hashlib').sha256(b'["","","all"]').hexdigest()[:20]
        c=base64.urlsafe_b64encode(json.dumps({'v':1,'a':1200000,'s':d['snapshotKey'],'f':fingerprint}).encode()).decode().rstrip('=')
        self.assertEqual(self.browse(cursor=c)['items'],[])
    def test_invalid_duplicate_and_unsupported_inputs(self):
        for args in [{'q':['a','b']},{'category':['invalid']},{'cursor':['../file']},{'price':['0']},{'q':['\x00']}]:
            status,_=inv.handle_catalog_read('/browse',args,self.db,self.category);self.assertEqual(status,400,args)
    def test_maker_wildcards_do_not_become_unfiltered_selection(self):self.assertEqual(self.browse(maker='%')['items'],[])
    def test_routes_do_not_interfere_with_legacy_search(self):self.assertIsNone(inv.handle_catalog_read('/search',{},self.db,self.category))
    def test_corrupt_cursor_is_safe_error(self):
        for cursor in ['abc','_'*400,base64.urlsafe_b64encode(b'{"v":1}').decode().rstrip('=')]:
            status,_=inv.handle_catalog_read('/browse',{'cursor':[cursor]},self.db,self.category);self.assertEqual(status,400)
    def test_error_message_hides_paths_and_sql(self):
        status,d=inv.handle_catalog_read('/catalog-info',{},self.db.parent/'missing.sqlite',self.category);self.assertEqual(status,503);self.assertNotIn(self.temp.name,json.dumps(d))
    def test_patcher_is_additive_and_idempotent(self):
        source=Path(__file__).with_name('catalog_gateway.py').read_bytes();self.assertEqual(patch_source(source),source)
        stripped=source.decode().replace('        from catalog_inventory import handle_catalog_read\n        inventory = handle_catalog_read(route.path, parse_qs(route.query, keep_blank_values=True), DB, category_where)\n        if inventory is not None:\n            return self.respond(*inventory)\n','')
        self.assertEqual(patch_source(stripped.encode()),source)
        crlf=stripped.replace('\n','\r\n').encode('utf-8-sig');modified=patch_source(crlf);self.assertTrue(modified.startswith(b'\xef\xbb\xbf'));self.assertIn(b'\r\n',modified);ast.parse(modified.decode('utf-8-sig'))
    def test_patcher_refuses_unauthenticated_or_unexpected_handler(self):
        with self.assertRaises(ValueError):patch_source(b'class Handler:\n    def do_GET(self):\n        route = urlsplit(self.path)\n')
    def test_real_http_handler_preserves_authentication_for_new_routes(self):
        path=Path(__file__).with_name('catalog_gateway.py');spec=importlib.util.spec_from_file_location('gateway_test',path);module=importlib.util.module_from_spec(spec)
        with patch.dict(os.environ,{'TP_CATALOG_SQLITE_PATH':str(self.db),'TP_CATALOG_BACKEND_TOKEN':'x'*40}):spec.loader.exec_module(module)
        class Socket:
            def __init__(self,data):self.data=io.BytesIO(data);self.out=io.BytesIO()
            def makefile(self,*a,**k):return self.data
            def sendall(self,b):self.out.write(b)
        for authorized in [False,True]:
            headers=('Authorization: Bearer '+'x'*40+'\r\n') if authorized else ''
            sock=Socket(('GET /browse?category=all HTTP/1.1\r\nHost: localhost\r\n'+headers+'\r\n').encode());module.Handler(sock,('127.0.0.1',1),object());response=sock.out.getvalue();self.assertIn(b' 200 ' if authorized else b' 401 ',response.split(b'\r\n')[0]);self.assertNotIn(b'9999.0',response)

if __name__=='__main__':unittest.main()
