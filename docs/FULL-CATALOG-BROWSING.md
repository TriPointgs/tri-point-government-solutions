# Full distributor catalog browsing — reuse the existing bulk import

Date: October 20, 2026. Review branch only. Parent: ba6db8a918c35c0b7c804f8c386873a1ad5a234a.

## Owner request and data-source distinction

The owner asked to import all TD products through the API. The installed US GetPriceAvailability contract looks up supplied SKUs/part numbers, up to 100 per request. It is not the full product-enumeration operation in the supplied documentation. TD's supplied Price & Availability guide provides the full catalog through SFTP as a ZIP containing an AP flat file.

The existing private Windows SQLite index already contains the imported account catalog. The historical owner-reported result was 1,201,703 rows. That number is historical, not a newly measured or imported total in this change. Do not turn a test fixture count into a claim about the current live database.

This release reuses that existing full import and makes it the shop's browse source. It does not download another SFTP file, copy the database into the public repository, upload 1.2 million private records to Vercel, schedule a feed refresh, or certify all records for public sale. A full current supplier sync or always-on cloud migration remains a separate deployment task.

## The problem corrected

The previous shop already searched the full catalog for a keyword, but blank or category-only browsing returned the small saved product-control selection. That suggested only manually imported products were available. The old gateway also refused unfiltered HTTP searches and had a numbered search-page limit.

The shop now browses the source index directly for empty, category-only, manufacturer and keyword queries. No manual per-SKU draft import is needed to browse or add a source product to the cart. The 500-row review pool is retained for exceptions and authorizations, not used as the full catalog. Supplier prices and stock are still checked automatically when the cart changes, rather than issuing a price request for every record in the catalog.

## New private gateway endpoints

An additive helper, `catalog_inventory.py`, provides `/browse` and `/catalog-info` behind the existing gateway's bearer authentication. The original loopback binding, token, launcher, source paths, custom category rules and repaired exact-query handling are preserved.

- Reads SQLite in URI read-only/query-only mode and exposes only manufacturer, description, part and SKU identities. Raw source prices and stock fields are omitted.
- Reads the actual total row count once per observed index generation instead of relying on possibly stale metadata.
- Uses fixed-size pages and an ID-based cursor, without a 500-item selection limit or the previous numbered-offset cap.
- Binds cursors to filters and an observed index signature using file identity, size, timestamps, SQLite header fingerprint, optional WAL metadata and row count. Replacement or detected updates require restarting the page traversal; this is not a claim of a cryptographic full-file content audit.
- Applies original category/keyword/manufacturer filters before pagination. Categories remain the existing approximate heuristics, not official TD taxonomy.
- Does not infer sellability, price validity, inventory, authorization, pictures or full manufacturer specifications from the record count.
- Returns the local index modification time, not a verified supplier feed-generation timestamp.

The website sanitizes and limits the response, sends the upstream token server-side only, and maintains previous/next cursor state. Saved exclusions remain effective. An entirely excluded page keeps its next cursor instead of falsely declaring the entire catalog empty.

## Compatibility and one-time Windows activation

The website deployment and the Windows gateway are separate runtime components. A deployed website cannot install code on the owner's PC. If the existing gateway does not yet implement `/browse`, the site explains the one-time connector update and keeps keyword search working; it does not claim full browsing has been activated or silently substitute the saved pilot selection.

`tools/tdsynnex-windows/ENABLE_FULL_CATALOG.ps1` is a standalone one-time local installer. It embeds two different verified source modules, prepares a compiled additive gateway candidate, keeps the existing database and token unchanged, uses real backup paths with File.Replace, verifies installed source/helper hashes, and restarts only the process whose executable and command line match the catalog gateway on port 8766. It then checks the authenticated actual row count, first/next pages and denial of unauthenticated access. It prints a success marker only after these live local checks pass. A failed update retains backups and attempts to restore the original gateway source.

This uses the existing root and launcher. It does not expose port 8766, change Tailscale configuration, alter the separate GUI, read unrelated files, install scheduled tasks or stop unrelated processes. The gateway still requires the owner-controlled computer and existing tunnel to remain available.

The patcher preserves source encoding/line endings and existing local changes, verifies the known auth/route structure and refuses unexpected source shapes rather than overwriting the entire file. In this release the repository gateway also includes the already-proven Boolean exact-query correction; the additive local installer preserves whichever correct local implementation is already present.

## Verification

- 611 JavaScript tests passed, retaining the prior 595 and adding 16 inventory/upstream/shop-scope tests.
- 18 Python tests passed against disposable SQLite/FTS data, including full-page enumeration, pre-pagination filters, stale/replaced-index cursors, byte-for-byte no database writes, auth-denied and auth-accepted real HTTP-handler paths, source encoding, and separate embedded installer payloads.
- 13 synthetic browser workflows passed, including blank full-source browsing with zero saved products, all 65 fixture identities across cursor pages, category-only filtering, next/previous/reset, automatic cart price/freight, four responsive widths, narrow customer data and session expiry.
- No live Windows install, real supplier bulk transfer, authenticated live gateway browse, real TD API price call or public publication was performed during these tests.
- A bounded review's first finding treated deliberately summarized embedded payload text as the literal installer; direct embedded-payload tests disprove that concern. Its index-replacement concern led to stronger signature checks and a regression test for preserved modification time.
- Native Windows/PowerShell execution is pending the owner's one-time run. Python/static/source-hash checks do not establish a Windows runtime pass.
- Preview and production-mode builds are checked before committing. Production deployment, checkout, payments, supplier order submission and existing public content remain unchanged.

## Next action and success evidence

After the preview deployment is READY, run the pinned/checksummed standalone installer on the catalog Windows PC. Expected completion: `FULL CATALOG BROWSING VERIFIED`, followed by the actual measured source-record count. Retain the rollback backup. Reopen the shopping preview; no product-by-product action is required.

A successful completion establishes browsing the full currently installed snapshot, not that the snapshot was freshly pulled from TD. Periodic SFTP ingestion and a non-PC-dependent host can be planned after this path is verified, subject to source credentials, data rights and any infrastructure cost approval.
