#!/usr/bin/env python3
"""Tri-Point private read-only TD SYNNEX catalog gateway. No third-party dependencies."""
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import hmac, json, os, re, sqlite3

DB = Path(os.environ.get("TP_CATALOG_SQLITE_PATH", str(Path(__file__).resolve().parent / "catalog.sqlite")))
TOKEN = os.environ.get("TP_CATALOG_BACKEND_TOKEN", "")
PORT = int(os.environ.get("TP_CATALOG_BACKEND_PORT", "8766"))
if len(TOKEN) < 32 or not DB.is_file():
    raise SystemExit("The private catalog database or authentication token is not configured.")
if not 1024 <= PORT <= 65535:
    raise SystemExit("Invalid gateway port")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Do not log search terms, paths, or credentials.

    def respond(self, code, data):
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        for k, v in {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow",
            "X-Content-Type-Options": "nosniff",
            "Content-Length": str(len(payload)),
        }.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):
            return self.respond(401, {"error": "Unauthorized"})
        route = urlsplit(self.path)
        if route.path == "/health":
            return self.respond(200, {"status": "ready"})
        if route.path != "/search":
            return self.respond(404, {"error": "Not found"})
        args = parse_qs(route.query, keep_blank_values=True)
        q = args.get("q", [""])[0].strip()
        maker = args.get("maker", [""])[0].strip()
        page = args.get("page", ["0"])[0]
        if len(q) > 100 or len(maker) > 80 or not re.fullmatch(r"\d{1,4}", page) or int(page) > 1000 or any(ord(c)<32 for c in q+maker):
            return self.respond(400, {"error": "Invalid search"})
        if not q and not maker:
            return self.respond(200, {"items": [], "hasMore": False, "priceVerified": False, "stockVerified": False})
        sql = """SELECT p.mfg_part,p.supplier_sku,p.distributor_id,p.description,
                 p.manufacturer,p.product_family,p.field13_price_candidate,
                 p.field14_price_candidate,p.field10_quantity_candidate,
                 p.field11_quantity_candidate FROM products p"""
        criteria = []
        params = []
        words = re.findall(r"[A-Za-z0-9]+", q)[:7]
        if words:
            sql += " JOIN product_search ON product_search.rowid=p.id"
            criteria.append("product_search MATCH ?")
            params.append(" ".join('"' + word + '"*' for word in words))
        elif q:
            return self.respond(400, {"error": "Invalid search phrase"})
        if maker:
            criteria.append("p.manufacturer LIKE ?")
            params.append("%" + maker.replace("%", "").replace("_", "") + "%")
        if criteria:
            sql += " WHERE " + " AND ".join(criteria)
        sql += " ORDER BY p.id LIMIT 51 OFFSET ?"
        params.append(int(page)*50)
        try:
            with closing(sqlite3.connect(DB.resolve().as_uri() + "?mode=ro", uri=True, timeout=7)) as con:
                con.execute("PRAGMA query_only=ON")
                rows = con.execute(sql, params).fetchall()
                count_row = con.execute("SELECT value FROM catalog_meta WHERE key='product_count'").fetchone()
        except sqlite3.Error:
            return self.respond(503, {"error": "Catalog database unavailable"})
        keys = ("mfgPart","supplierSku","distributorId","description","manufacturer","productFamily","rawField13","rawField14","rawField10","rawField11")
        return self.respond(200, {
            "items": [dict(zip(keys,row)) for row in rows[:50]],
            "hasMore": len(rows)>50,
            "totalRecords": int(json.loads(count_row[0])) if count_row else None,
            "priceVerified": False,
            "stockVerified": False,
        })

    def do_POST(self):
        return self.respond(405, {"error": "Read-only service"})

server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
print(f"Tri-Point private catalog gateway listening on 127.0.0.1:{PORT}", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
