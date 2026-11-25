"""Run the real GET handler against synthetic SQLite rows, without opening a socket."""
import json
import os
from pathlib import Path
import runpy
import sqlite3
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace


def populate_database(path):
    with sqlite3.connect(path) as database:
        database.execute("""
            CREATE TABLE products (
                id INTEGER PRIMARY KEY, mfg_part TEXT, supplier_sku TEXT,
                distributor_id TEXT, description TEXT, manufacturer TEXT, product_family TEXT,
                field13_price_candidate REAL, field14_price_candidate REAL,
                field10_quantity_candidate INTEGER, field11_quantity_candidate INTEGER
            )
        """)
        database.execute("CREATE TABLE catalog_meta (key TEXT, value TEXT)")
        # Nonmatching rows precede the first page of laptops in database order.
        for index in range(1, 103):
            description = "Laptop sleeve" if index <= 51 else "Laptop"
            database.execute(
                "INSERT INTO products VALUES (?, ?, ?, ?, ?, 'Example', '', 10, 11, 12, 13)",
                (index, f"PART-{index}", f"SKU-{index}", f"DIST-{index}", description),
            )
        database.execute("CREATE VIRTUAL TABLE product_search USING fts5(description)")
        database.execute("INSERT INTO product_search(rowid, description) SELECT id, description FROM products")
        database.execute("INSERT INTO catalog_meta VALUES ('product_count', '102')")


def main():
    gateway = Path(__file__).resolve().parents[2] / "tools/tdsynnex-windows/catalog_gateway.py"
    with TemporaryDirectory() as temp:
        path = Path(temp) / "catalog.sqlite"
        populate_database(path)
        os.environ.update(TP_CATALOG_SQLITE_PATH=str(path), TP_CATALOG_BACKEND_PORT="8766",
                          TP_CATALOG_BACKEND_TOKEN="synthetic-catalog-contract-token-12345678")
        handler = runpy.run_path(str(gateway))["Handler"]
        request = json.load(sys.stdin)
        response = handler.do_GET(SimpleNamespace(
            path=request["path"], headers=request["headers"],
            respond=lambda status, body: {"status": status, "body": body},
        ))
        print(json.dumps(response))


if __name__ == "__main__":
    main()
