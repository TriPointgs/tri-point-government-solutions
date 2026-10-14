#!/usr/bin/env python3
"""Build the private SQLite catalog from the original TD SYNNEX 822539.zip SFTP file."""
from pathlib import Path
from zipfile import ZipFile
import json, sqlite3, os, sys, time
ROOT=Path(__file__).resolve().parent
source=ROOT/"822539.zip"
dest=ROOT/"catalog.sqlite"
tmp=ROOT/"catalog.building.sqlite"
if dest.is_file() and dest.stat().st_size>100_000_000:
    print("A large catalog.sqlite already exists; leaving it untouched.")
    sys.exit(0)
if not source.is_file():
    sys.exit("Missing original TD SYNNEX 822539.zip (from FileZilla). Put it in "+str(ROOT))
if tmp.exists(): tmp.unlink()
started=time.monotonic()
count=headers=0
CREATE="""CREATE TABLE products(
 id INTEGER PRIMARY KEY,mfg_part TEXT NOT NULL,supplier_sku TEXT NOT NULL,
 distributor_id TEXT NOT NULL,record_status TEXT,description TEXT NOT NULL,
 manufacturer TEXT NOT NULL,manufacturer_code TEXT,
 field10_quantity_candidate INTEGER,field11_quantity_candidate INTEGER,
 field12_quantity_candidate INTEGER,field13_price_candidate REAL,
 field14_price_candidate REAL,field21_price_candidate REAL,
 upc_candidate TEXT,unspsc_candidate TEXT,product_family TEXT,
 weight_candidate TEXT,country_candidate TEXT);
 CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);"""
def num(v,cast=float):
    try:return cast(v) if v else None
    except (ValueError,OverflowError):return None
def decode(b):
    try:return b.decode("utf-8").strip()
    except UnicodeDecodeError:return b.decode("cp1252",errors="replace").strip()
try:
    with ZipFile(source) as archive:
        files=[n for n in archive.namelist() if n.lower().endswith(".ap")]
        if len(files)!=1:raise ValueError("Expected one .ap catalog within ZIP")
        with archive.open(files[0]) as records,sqlite3.connect(tmp) as db:
            db.execute("PRAGMA synchronous=OFF")
            db.execute("PRAGMA journal_mode=OFF")
            db.executescript(CREATE)
            db.execute("CREATE VIRTUAL TABLE product_search USING fts5(mfg_part,supplier_sku,description,manufacturer,product_family,content='products',content_rowid='id')")
            insert="""INSERT INTO products(mfg_part,supplier_sku,distributor_id,record_status,description,
                 manufacturer,manufacturer_code,field10_quantity_candidate,field11_quantity_candidate,
                 field12_quantity_candidate,field13_price_candidate,field14_price_candidate,
                 field21_price_candidate,upc_candidate,unspsc_candidate,product_family,
                 weight_candidate,country_candidate) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
            batch=[]
            for raw in records:
                if not raw.strip():continue
                f=raw.rstrip(b"\r\n").split(b"~")
                if len(f)<2:raise ValueError("Malformed record")
                if f[1].strip()==b"HDR":
                    headers+=1
                    continue
                if f[1].strip()!=b"DTL" or len(f)!=70:raise ValueError("Unexpected 70-column catalog record")
                p=[decode(v) for v in f]
                batch.append((p[2],p[3],p[4],p[5],p[6],p[7],p[8],num(p[9],int),num(p[10],int),
                    num(p[11],int),num(p[12]),num(p[13]),num(p[20]),p[33],p[34],p[35],p[27],p[31]))
                count+=1
                if len(batch)>=10000:
                    db.executemany(insert,batch);batch.clear()
                if count%100000==0:
                    print(f"Imported {count:,} records; {time.monotonic()-started:.1f}s",flush=True)
            if batch:db.executemany(insert,batch)
            if count==0 or headers!=1:raise ValueError("Invalid source header or empty product feed")
            print("Building indexes; please wait...",flush=True)
            db.executescript("""CREATE INDEX idx_manufacturer ON products(manufacturer);
               CREATE INDEX idx_mfg_part ON products(mfg_part);
               CREATE INDEX idx_supplier_sku ON products(supplier_sku);
               CREATE INDEX idx_distributor_id ON products(distributor_id);""")
            db.execute("INSERT INTO product_search(product_search) VALUES('rebuild')")
            db.execute("INSERT INTO catalog_meta(key,value) VALUES (?,?)",
                ("product_count",json.dumps(count)))
            db.commit()
            if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":
                raise RuntimeError("SQLite integrity failed")
    os.replace(tmp,dest)
    print(f"SUCCESS: {count:,} products, database {dest.stat().st_size/1048576:.1f} MB",flush=True)
except Exception as e:
    if tmp.exists():tmp.unlink()
    sys.exit("IMPORT FAILED: "+str(e))
