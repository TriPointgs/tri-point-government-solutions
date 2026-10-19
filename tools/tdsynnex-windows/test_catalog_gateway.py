"""Regression tests for the gateway's HTTP boundary with synthetic SQLite data.

Run: python -m unittest discover -s tools/tdsynnex-windows -p 'test_*.py'
No network listener, supplier data, or real credentials are used.
"""
from io import BytesIO
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import unittest
from unittest.mock import patch


class MemorySocket:
    def __init__(self, request):
        self.input = BytesIO(request)
        self.output = bytearray()

    def makefile(self, mode, buffering=-1):
        if mode != "rb":
            raise AssertionError("Unexpected socket mode")
        return self.input

    def sendall(self, data):
        self.output.extend(data)


class GatewayHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="catalog-gateway-test-")
        cls.addClassCleanup(cls.temporary.cleanup)
        database = Path(cls.temporary.name) / "synthetic.sqlite"
        with sqlite3.connect(database) as con:
            con.executescript("""
                CREATE TABLE products (
                  id INTEGER PRIMARY KEY, mfg_part TEXT, supplier_sku TEXT,
                  distributor_id TEXT, description TEXT, manufacturer TEXT,
                  product_family TEXT, field13_price_candidate TEXT,
                  field14_price_candidate TEXT, field10_quantity_candidate TEXT,
                  field11_quantity_candidate TEXT
                );
                CREATE VIRTUAL TABLE product_search USING fts5(
                  mfg_part,supplier_sku,distributor_id,description,manufacturer,
                  product_family
                );
                CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT);
            """)
            for row_id in range(1, 56):
                fields = (f"TEST-{row_id:03d}", f"SUP-{row_id:03d}",
                          f"ID-{row_id:03d}", "Synthetic ThinkPad laptop",
                          "LENOVO", "TPP")
                con.execute("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            (row_id, *fields, None, None, None, None))
                con.execute("INSERT INTO product_search(rowid,mfg_part,supplier_sku,"
                            "distributor_id,description,manufacturer,product_family) "
                            "VALUES (?,?,?,?,?,?,?)", (row_id, *fields))
            con.execute("INSERT INTO catalog_meta VALUES (?,?)", ("product_count", "55"))
        source = Path(__file__).with_name("catalog_gateway.py")
        settings = {"TP_CATALOG_SQLITE_PATH": str(database),
                    "TP_CATALOG_BACKEND_TOKEN": secrets.token_urlsafe(32),
                    "TP_CATALOG_BACKEND_PORT": "8766"}
        with patch.dict(os.environ, settings):
            spec = importlib.util.spec_from_file_location("gateway_under_test", source)
            cls.gateway = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.gateway)

    def request(self, route, authenticated=True):
        auth = ("Authorization: Bearer " + self.gateway.TOKEN + "\r\n"
                if authenticated else "")
        raw = ("GET " + route + " HTTP/1.0\r\nHost: localhost\r\n" + auth + "\r\n")
        transport = MemorySocket(raw.encode("ascii"))
        self.gateway.Handler(transport, ("127.0.0.1", 0), None)
        headers, body = bytes(transport.output).split(b"\r\n\r\n", 1)
        status = int(headers.split(b"\r\n", 1)[0].split()[1])
        self.assertIn(b"Cache-Control: private, no-store", headers)
        return status, json.loads(body)

    def test_omitted_and_zero_flags_use_keyword_search(self):
        for flag in ("", "&exact=0"):
            with self.subTest(flag=flag):
                status, result = self.request(
                    "/search?q=ThinkPad&maker=LENOVO&category=laptops&page=0" + flag)
                self.assertEqual(status, 200)
                self.assertEqual(len(result["items"]), 50)
                self.assertIs(result["hasMore"], True)
                self.assertIs(result["exact"], False)
                self.assertEqual(result["filterVersion"], 2)

    def test_keyword_pagination(self):
        status, result = self.request(
            "/search?q=ThinkPad&maker=LENOVO&category=laptops&page=1")
        self.assertEqual(status, 200)
        self.assertEqual(len(result["items"]), 5)
        self.assertIs(result["hasMore"], False)
        self.assertIs(result["exact"], False)

    def test_manufacturer_only_search(self):
        status, result = self.request("/search?maker=LENOVO&category=laptops")
        self.assertEqual(status, 200)
        self.assertEqual(len(result["items"]), 50)
        self.assertIs(result["exact"], False)

    def test_exact_identifiers_match_without_keyword_fallback(self):
        for query in ("TEST-001", "SUP-001", "ID-001"):
            with self.subTest(query=query):
                status, result = self.request("/search?q=" + query + "&exact=1")
                self.assertEqual(status, 200)
                self.assertEqual([row["mfgPart"] for row in result["items"]], ["TEST-001"])
                self.assertIs(result["exact"], True)
        status, result = self.request("/search?q=ThinkPad&exact=1")
        self.assertEqual(status, 200)
        self.assertEqual(result["items"], [])
        self.assertIs(result["exact"], True)

    def test_empty_search_reports_boolean_false(self):
        status, result = self.request("/search?category=laptops")
        self.assertEqual(status, 200)
        self.assertEqual(result["items"], [])
        self.assertIs(result["exact"], False)

    def test_invalid_exact_flags_and_duplicates_are_rejected(self):
        for query in ("q=ThinkPad&exact=true", "q=ThinkPad&exact=",
                      "q=ThinkPad&exact=2", "maker=LENOVO&exact=1",
                      "q=ThinkPad&exact=0&exact=1"):
            with self.subTest(query=query):
                status, _ = self.request("/search?" + query)
                self.assertEqual(status, 400)

    def test_authentication_is_required(self):
        for route in ("/health", "/search?q=ThinkPad"):
            with self.subTest(route=route):
                status, result = self.request(route, authenticated=False)
                self.assertEqual(status, 401)
                self.assertNotIn("items", result)


if __name__ == "__main__":
    unittest.main()
