#!/usr/bin/env python3
"""Read-only Windows TD SYNNEX catalog gateway v2. Requires local SQLite and a private bearer token."""
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import hmac
import json
import os
import re
import sqlite3

DB = Path(os.environ.get("TP_CATALOG_SQLITE_PATH", str(Path(__file__).resolve().parent / "catalog.sqlite")))
TOKEN = os.environ.get("TP_CATALOG_BACKEND_TOKEN", "")
PORT = int(os.environ.get("TP_CATALOG_BACKEND_PORT", "8766"))
ENGINE_VERSION = 2
CATEGORIES = ("all", "laptops", "desktops", "monitors", "networking", "software", "accessories")
if len(TOKEN) < 32 or not DB.is_file():
    raise SystemExit("The private catalog database or authentication token is not configured.")
if not 1024 <= PORT <= 65535:
    raise SystemExit("Invalid gateway port.")

# Product type is a keyword heuristic, NOT an official TD SYNNEX classification.
# Use only fixed SQL fragments: no request-controlled SQL operators, columns, or patterns.
DOC = "UPPER(COALESCE(p.description,'') || ' ' || COALESCE(p.product_family,''))"
ACCESSORY_WORDS = (
    "BATTERY", "COVER", "CASE", "SLEEVE", "CABLE", "CHARGER",
    "ADAPTER", "DOCKING", "DOCK ", "REPLACEMENT", "SCREEN PROTECTOR",
    "BRACKET", "SPARE ", "WARRANTY", "SERVICE CONTRACT",
)
CATEGORY_POSITIVE = {
    "laptops": ("NOTEBOOK", "LAPTOP", "ULTRABOOK", "CHROMEBOOK", "THINKPAD",
                "MACBOOK", "MOBILE WORKSTATION", "ELITEBOOK", "PROBOOK",
                "LATITUDE", "IDEAPAD", "VOSTRO"),
    "desktops": ("DESKTOP", "TOWER PC", "MINI PC", "ALL-IN-ONE PC",
                 "THINKCENTRE", "OPTIPLEX", "PRODESK", "ELITEDESK",
                 "PRECISION WORKSTATION", "WORKSTATION DESKTOP"),
    "monitors": ("MONITOR", "DESKTOP DISPLAY", "FLAT PANEL DISPLAY",
                 "LED DISPLAY", "LCD DISPLAY", "COMPUTER DISPLAY"),
    "networking": ("NETWORK SWITCH", "ETHERNET SWITCH", "SWITCH  ", "ROUTER",
                   "FIREWALL", "ACCESS POINT", "NETWORK APPLIANCE",
                   "WIRELESS CONTROLLER"),
    "software": ("SOFTWARE", "LICENSE", "LICENCE", "SUBSCRIPTION",
                 "SaaS", "MICROSOFT 365", "CLOUD SERVICE", "ANTIVIRUS"),
    "accessories": ACCESSORY_WORDS + ("TRANSCEIVER", "MOUSE", "KEYBOARD",
                                      "HEADSET", "TONER", "INK CARTRIDGE"),
}
CATEGORY_NEGATIVE = {
    "laptops": ACCESSORY_WORDS + ("MEMORY UPGRADE", "SOLID STATE DRIVE"),
    "desktops": ACCESSORY_WORDS + ("NOTEBOOK", "LAPTOP", "MOBILE WORKSTATION"),
    "monitors": ACCESSORY_WORDS + ("MONITOR STAND", "MOUNTING KIT", "DISPLAY CABLE"),
    "networking": ACCESSORY_WORDS + ("LICENSE", "LICENCE", "SUBSCRIPTION", "SUPPORT",
                                     "TRANSCEIVER", "SFP", "POWER SUPPLY", "ANTENNA"),
    "software": ("HARDWARE ONLY", "SERVICE CONTRACT"),
    "accessories": (),
}

def category_where(category):
    if category == "all":
        return "", []
    def clause(words):
        if not words:
            return "", []
        return "(" + " OR ".join(f"{DOC} LIKE ?" for _ in words) + ")", [f"%{word.upper()}%" for word in words]
    positive, params = clause(CATEGORY_POSITIVE[category])
    negative, excluding = clause(CATEGORY_NEGATIVE[category])
    sql = " AND " + positive
    if negative:
        sql += " AND NOT " + negative
    return sql, params + excluding


def search_db(query, maker, page, category="all", exact=False, database=DB):
    sql = """SELECT p.mfg_part,p.supplier_sku,p.distributor_id,p.description,
             p.manufacturer,p.product_family,p.field13_price_candidate,
             p.field14_price_candidate,p.field10_quantity_candidate,
             p.field11_quantity_candidate FROM products p"""
    predicates, values = [], []
    if exact:
        term = query.strip()
        variants = list(dict.fromkeys((term, term.upper())))
        placeholders = ",".join("?" for _ in variants)
        predicates.append("(" + " OR ".join(
            f"p.{field} IN ({placeholders})"
            for field in ("mfg_part", "supplier_sku", "distributor_id")
        ) + ")")
        values.extend(variants * 3)
    elif query:
        words = re.findall(r"[A-Za-z0-9]+", query)[:7]
        if not words:
            return {"items": [], "hasMore": False, "filterVersion": ENGINE_VERSION,
                    "category": category, "exact": exact}
        sql += " JOIN product_search ON product_search.rowid=p.id"
        predicates.append("product_search MATCH ?")
        values.append(" ".join('"' + word + '"*' for word in words))
    if maker:
        predicates.append("p.manufacturer LIKE ?")
        values.append("%" + maker.replace("%", "").replace("_", "") + "%")
    if predicates:
        sql += " WHERE " + " AND ".join(predicates)
    else:
        sql += " WHERE 1=1"
    extra_where, extra_values = category_where(category)
    sql += extra_where
    values.extend(extra_values)
    # A text relevance score improves broad keyword queries; exact mode uses indexes.
    if query and not exact:
        sql += " ORDER BY bm25(product_search),p.id"
    elif exact:
        sql += " ORDER BY p.id"
    else:
        sql += " ORDER BY p.id"
    sql += " LIMIT 51 OFFSET ?"
    values.append(page * 50)
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True, timeout=7)) as con:
        con.execute("PRAGMA query_only=ON")
        con.execute("PRAGMA busy_timeout=7000")
        rows = con.execute(sql, values).fetchall()
        count_row = con.execute("SELECT value FROM catalog_meta WHERE key='product_count'").fetchone()
    keys = ("mfgPart", "supplierSku", "distributorId", "description", "manufacturer",
            "productFamily", "rawField13", "rawField14", "rawField10", "rawField11")
    return {
        "items": [dict(zip(keys, row)) for row in rows[:50]],
        "hasMore": len(rows) > 50,
        "totalRecords": int(json.loads(count_row[0])) if count_row else None,
        "filterVersion": ENGINE_VERSION, "category": category, "exact": exact,
        "priceVerified": False, "stockVerified": False,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # No search terms, tokens, or customer requests in access logs.

    def respond(self, status, data):
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        for key, value in {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow",
            "X-Content-Type-Options": "nosniff",
            "Content-Length": str(len(payload)),
        }.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):
            return self.respond(401, {"error": "Unauthorized"})
        route = urlsplit(self.path)
        if route.path == "/health":
            return self.respond(200, {"status": "ready", "filterVersion": ENGINE_VERSION})
        if route.path != "/search":
            return self.respond(404, {"error": "Not found"})
        args = parse_qs(route.query, keep_blank_values=True)
        if any(len(vals) > 1 for vals in args.values()):
            return self.respond(400, {"error": "Duplicate search parameters"})
        query = args.get("q", [""])[0].strip()
        maker = args.get("maker", [""])[0].strip()
        page = args.get("page", ["0"])[0]
        category = args.get("category", ["all"])[0].strip().lower()
        exact = args.get("exact", ["0"])[0]
        if (len(query) > 100 or len(maker) > 80 or category not in CATEGORIES
            or exact not in ("0", "1") or (exact == "1" and not query)
            or not re.fullmatch(r"\d{1,4}", page) or int(page) > 1000
            or any(ord(char) < 32 or ord(char) == 127 for char in query + maker)):
            return self.respond(400, {"error": "Invalid catalog search"})
        if not query and not maker:
            return self.respond(200, {"items": [], "hasMore": False, "filterVersion": ENGINE_VERSION,
                                     "category": category, "exact": exact,
                                     "priceVerified": False, "stockVerified": False})
        try:
            result = search_db(query, maker, int(page), category, exact)
        except sqlite3.Error:
            return self.respond(503, {"error": "Catalog search unavailable"})
        return self.respond(200, result)

    def do_POST(self):
        return self.respond(405, {"error": "Read-only service"})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Tri-Point catalog gateway v{ENGINE_VERSION} listening on 127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
