# Tri-Point — Private TD SYNNEX catalog website integration

## What's delivered
- Admin-only `/admin/catalog` page linked from the existing administrator dashboard, separate from contractor accounts.
- Server-protected GET `/api/catalog`, reusing only the existing Tri-Point admin cookie, not the contractor cookie.
- Read-only SKU, product-description and manufacturer search; no cart, orders, quote approvals or public products.
- Server-side HTTPS upstream URL and bearer token. Secrets never appear in browser code or the public repository.
- Raw fields 13/14 and quantity-like fields 10/11 are displayed with **unverified** labels only.

## What is not yet connected
The 443 MB account-specific SQLite catalog is NOT in this public repository or on Vercel. The website cannot return product results until a private backend is configured.

Use the standalone localhost-only read-only SQLite gateway (`catalog_gateway.py`) alongside the previously downloaded private database on an owner-controlled machine. The gateway listens on 127.0.0.1:8766, requires `TP_CATALOG_BACKEND_TOKEN` (a random 32+ character token), and uses `TP_CATALOG_SQLITE_PATH` for the SQLite file. Do not expose port 8766 to the public Internet or tunnel the existing port 8765 GUI.

For remote access, connect the gateway through a properly authenticated HTTPS reverse proxy or secure tunnel that you control. Configure these **server-side** Vercel environment variables:
- `TP_CATALOG_API_URL` — trusted HTTPS base URL to the backend, without a query string.
- `TP_CATALOG_API_TOKEN` — exact backend bearer token, stored only in the Vercel environment.

Redeploy the website. Log in to Tri-Point administration and open `/admin/catalog`. Anonymous and contractor-only users must continue to be denied.

## Important limitations
- A home-computer gateway requires that the computer and secure tunnel stay running. An always-on private hosted service is another option, but paid infrastructure needs owner approval.
- Obtain the official TD SYNNEX positional data dictionary before using raw numerical fields for profitability or bids. Recheck licensing/segment authorization, inventory, freight and contractual restrictions directly with TD SYNNEX.
- The catalog is a point-in-time snapshot, not live distributor availability.
- No new third-party account, paid service, public product data, or scheduled SFTP sync has been activated.
