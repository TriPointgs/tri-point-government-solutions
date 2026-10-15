#!/usr/bin/env python3
"""Diagnose Tri-Point local catalog search without revealing account data or bearer token."""
from pathlib import Path
import importlib.util
import os
import sqlite3
import urllib.request
import json

root=Path(r"C:\TriPointPrivateCatalog")
db=root/"catalog.sqlite"
gateway=root/"catalog_gateway.py"
token_file=root/".catalog-token.txt"
if not db.is_file() or not gateway.is_file() or not token_file.is_file():
    raise SystemExit("Required local database, gateway, or token file is missing.")
os.environ["TP_CATALOG_SQLITE_PATH"]=str(db)
os.environ["TP_CATALOG_BACKEND_TOKEN"]=token_file.read_text(encoding="ascii").strip()
print("Database size (MB):",round(db.stat().st_size/1048576,1))
print("Gateway script size:",gateway.stat().st_size)
with sqlite3.connect(db.resolve().as_uri()+"?mode=ro",uri=True) as cx:
    queries=[
       ("Total catalog rows","SELECT count(*) FROM products",[]),
       ("Lenovo manufacturer records","SELECT count(*) FROM products WHERE UPPER(manufacturer)='LENOVO'",[]),
       ("Lenovo ThinkPad by description","SELECT count(*) FROM products WHERE UPPER(manufacturer)='LENOVO' AND UPPER(description) LIKE '%THINKPAD%'",[]),
       ("Lenovo ThinkPad FTS","""SELECT count(*) FROM products p JOIN product_search ON product_search.rowid=p.id
            WHERE product_search MATCH ? AND UPPER(p.manufacturer)='LENOVO'""",['"ThinkPad"*']),
       ("Lenovo ThinkPad laptop families","""SELECT count(*) FROM products p JOIN product_search ON product_search.rowid=p.id
            WHERE product_search MATCH ? AND UPPER(p.manufacturer)='LENOVO'
            AND (p.product_family LIKE 'TPP%' OR p.product_family LIKE 'TPE%' OR p.product_family LIKE 'TPTE%'
                 OR p.product_family='TPG')""",['"ThinkPad"*']),
    ]
    for label,sql,args in queries:
        try:print(label+":",cx.execute(sql,args).fetchone()[0])
        except sqlite3.Error as e:print(label+": DB ERROR:",type(e).__name__,str(e)[:90])
    print("Sample Lenovo laptop families:")
    for family,count in cx.execute("""SELECT product_family,count(*) FROM products WHERE UPPER(manufacturer)='LENOVO'
                 AND UPPER(description) LIKE '%THINKPAD%' GROUP BY product_family ORDER BY count(*) DESC LIMIT 8"""):
        print(" ",repr(family),count)

try:
    spec=importlib.util.spec_from_file_location("catalog_local_gateway",gateway)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    print("Loaded gateway version:",getattr(mod,"ENGINE_VERSION","unknown"))
    if hasattr(mod,"search_db"):
        results=mod.search_db("ThinkPad","LENOVO",0,"laptops",False)
        print("Direct gateway search count:",len(results.get("items",[])))
        print("Direct search categories:",results.get("category"),"version:",results.get("filterVersion"))
        for row in results.get("items",[])[:3]:
            print(" Direct match:",row.get("mfgPart"),repr(row.get("productFamily")),row.get("description","")[:90])
except Exception as e:
    print("Direct gateway search ERROR:",type(e).__name__,str(e)[:160])

url="http://127.0.0.1:8766/search?q=ThinkPad&maker=LENOVO&category=laptops&page=0"
try:
    request=urllib.request.Request(url,headers={"Authorization":"Bearer "+os.environ["TP_CATALOG_BACKEND_TOKEN"]})
    with urllib.request.urlopen(request,timeout=25) as res:
        payload=json.load(res)
    print("LIVE gateway search count:",len(payload.get("items",[])))
    print("LIVE gateway filter version:",payload.get("filterVersion"))
    print("LIVE gateway category:",payload.get("category"))
    for row in payload.get("items",[])[:3]:
        print(" Live match:",row.get("mfgPart"),repr(row.get("productFamily")),row.get("description","")[:90])
except Exception as e:
    print("LIVE gateway request ERROR:",type(e).__name__,str(e)[:120])
print("DIAGNOSTIC COMPLETE. Private token and raw price fields have NOT been printed.")
