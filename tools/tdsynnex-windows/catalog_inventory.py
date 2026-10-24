"""Read-only, identity-only full catalog browsing; never submits supplier requests.
Installed alongside catalog_gateway.py. Existing token/authentication stays in its handler.
"""
import base64
from contextlib import closing
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import sqlite3

PAGE_SIZE = 50
CAPABILITY = "full-catalog-v1"
CATEGORIES = ("all", "laptops", "desktops", "monitors", "networking", "software", "accessories")


class CatalogRequestError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def connection(path):
    con = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True, timeout=7)
    con.execute("PRAGMA query_only=ON")
    con.execute("PRAGMA busy_timeout=7000")
    con.execute("PRAGMA trusted_schema=OFF")
    return con


@lru_cache(maxsize=4)
def _record_count(path, signature):
    with closing(connection(path)) as con:
        return int(con.execute("SELECT COUNT(*) FROM products").fetchone()[0])


def catalog_info(database):
    path = Path(database).resolve()
    stat = path.stat()
    def signature():
        main = path.stat()
        with path.open("rb") as source:
            header = hashlib.sha256(source.read(100)).hexdigest()
        main_signature = (main.st_dev, main.st_ino, main.st_size, main.st_mtime_ns, main.st_ctime_ns, header)
        try:
            wal = Path(str(path) + '-wal').stat()
            return main_signature + (wal.st_ino, wal.st_size, wal.st_mtime_ns, wal.st_ctime_ns)
        except FileNotFoundError:
            return main_signature + (0, 0, 0, 0)
    stamp = signature()
    total = _record_count(str(path), stamp)
    if stamp != signature():
        raise CatalogRequestError(409, 'Catalog changed during this read. Start again.')
    # This identifies the local index generation, not the live supplier's inventory.
    fingerprint = hashlib.sha256(f"{stamp}:{total}".encode()).hexdigest()[:24]
    return {"capability": CAPABILITY, "totalRecords": total, "snapshotKey": fingerprint,
            "indexModifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "pageSize": PAGE_SIZE, "source": "existing-private-distributor-index",
            "priceVerified": False, "stockVerified": False, "cloudCopy": False}


def query_fields(args):
    if not isinstance(args, dict) or set(args) - {"q", "maker", "category", "cursor"}:
        raise CatalogRequestError(400, "Unsupported full-catalog fields")
    if any(not isinstance(v, list) or len(v) != 1 or not isinstance(v[0], str) for v in args.values()):
        raise CatalogRequestError(400, "Invalid or duplicate catalog fields")
    raw_text = args.get("q", [""])[0] + args.get("maker", [""])[0]
    if any(ord(c) < 32 or ord(c) == 127 for c in raw_text):
        raise CatalogRequestError(400, "Invalid full-catalog query")
    query = args.get("q", [""])[0].strip()
    maker = args.get("maker", [""])[0].strip()
    category = args.get("category", ["all"])[0].strip().lower()
    cursor = args.get("cursor", [""])[0]
    if len(query) > 100 or len(maker) > 80 or category not in CATEGORIES or len(cursor) > 400 or any(ord(c) < 32 or ord(c) == 127 for c in query + maker):
        raise CatalogRequestError(400, "Invalid full-catalog query")
    return query, maker, category, cursor


def cursor_after(token, snapshot, binding):
    if not token:
        return 0
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,400}", token):
        raise CatalogRequestError(400, "Invalid catalog cursor")
    try:
        data = json.loads(base64.b64decode(token + "=" * (-len(token) % 4), altchars=b"-_", validate=True))
        if not isinstance(data, dict) or set(data) != {"v", "a", "s", "f"} or data["v"] != 1 or isinstance(data["a"], bool) or not isinstance(data["a"], int) or not 0 < data["a"] < 2**63:
            raise ValueError()
    except (ValueError, TypeError, UnicodeDecodeError):
        raise CatalogRequestError(400, "Invalid catalog cursor")
    if data["s"] != snapshot or data["f"] != binding:
        raise CatalogRequestError(409, "Catalog or filters changed. Start browsing from the first page.")
    return data["a"]


def browse_catalog(database, args, category_where):
    query, maker, category, token = query_fields(args)
    info = catalog_info(database)
    binding = hashlib.sha256(json.dumps([query, maker, category], ensure_ascii=True, separators=(",", ":")).encode()).hexdigest()[:20]
    after = cursor_after(token, info["snapshotKey"], binding)
    sql = "SELECT p.id,p.mfg_part,p.supplier_sku,p.distributor_id,p.description,p.manufacturer,p.product_family FROM products p"
    where, values = ["p.id > ?"], [after]
    if query:
        words = re.findall(r"[A-Za-z0-9]+", query)[:7]
        if not words:
            return {**info, "items": [], "hasMore": False, "nextCursor": None, "category": category, "categoryApproximate": category != "all"}
        sql += " JOIN product_search ON product_search.rowid=p.id"
        where.append("product_search MATCH ?")
        values.append(" ".join('"' + w + '"*' for w in words))
    if maker:
        where.append("p.manufacturer LIKE ? ESCAPE '\\'")
        values.append("%" + maker.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
    extra, extra_values = category_where(category)
    sql += " WHERE " + " AND ".join(where) + extra + " ORDER BY p.id LIMIT ?"
    values += extra_values + [PAGE_SIZE + 1]
    with closing(connection(database)) as con:
        rows = con.execute(sql, values).fetchall()
    if catalog_info(database)["snapshotKey"] != info["snapshotKey"]:
        raise CatalogRequestError(409, "Catalog changed during this read. Start again.")
    next_cursor = None
    if len(rows) > PAGE_SIZE:
        payload = {"v": 1, "a": int(rows[PAGE_SIZE - 1][0]), "s": info["snapshotKey"], "f": binding}
        next_cursor = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    names = ("mfgPart", "supplierSku", "distributorId", "description", "manufacturer", "productFamily")
    return {**info, "items": [dict(zip(names, r[1:])) for r in rows[:PAGE_SIZE]], "hasMore": next_cursor is not None,
            "nextCursor": next_cursor, "category": category, "categoryApproximate": category != "all"}


def handle_catalog_read(route, args, database, category_where):
    if route not in ("/browse", "/catalog-info"):
        return None
    try:
        if route == "/catalog-info":
            if args:
                raise CatalogRequestError(400, "Catalog info takes no query fields")
            return 200, catalog_info(database)
        return 200, browse_catalog(database, args, category_where)
    except CatalogRequestError as exc:
        return exc.status, {"error": str(exc)}
    except (sqlite3.Error, OSError, ValueError, TypeError, OverflowError):
        return 503, {"error": "The full catalog index is temporarily unavailable"}
