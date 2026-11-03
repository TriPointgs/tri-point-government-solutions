# Wasabi product and asset coverage - November 2, 2026

## Delivered

`content/wasabi/catalog.json` contains 19 distinct entries with names, original descriptions, features, variants, manufacturer links, evidence notes and distinct images. There are 19 product/capability/solution illustrations, one 1000px hero illustration and the manufacturer Hot Cloud Storage logo lockup. The 21 optimized WebP assets total approximately 459 KB. Every entry has an existing image and explicit alt text.

The directory `assets/brands/wasabi/` is curated for website use only. PDF extraction sheets and scratch images were moved outside the repository to `../asset-review/wasabi-images/` and `../asset-review/wasabi-final-cards.jpg`. No raw source PDFs, partner-only scripts, dashboards, account records, customer lists or credentials are published.

## Product coverage

1. Wasabi Hot Cloud Storage, with four pricing-model variants named
2. Wasabi Fire, pricing/availability by inquiry
3. Wasabi Cloud NAS
4. Wasabi Surveillance Cloud
5. Covert Copy, explicitly identified as an included platform capability
6. Wasabi Object Replication, explicitly identified as a platform capability
7. Wasabi Cloud Sync Manager
8. Wasabi Ball Transfer Appliance
9. Wasabi Direct Connect, with Dedicated, Hosted and Interconnect variants
10. Wasabi Account Control Manager
11. Custom Cloud Console, explicitly a WACM capability
12. Wasabi Account Control API
13. Wasabi with Dell ObjectScale
14. Wasabi Surveillance Cloud with Dell ObjectScale
15. Wasabi Cloud NAS with Dell ObjectScale
16. Wasabi Explorer
17. Wasabi Premium Support
18. Wasabi MCP, explicitly beta
19. Wasabi AI Storage, explicitly an AI-workflow solution rather than a separately purchased SKU

These are manufacturer products, tools, services and named platform capabilities, not 19 separately purchased storage SKUs. Dell ObjectScale offerings are identified as available through Dell; the page must not imply Tri-Point can independently transact them. The dataset does not assert that all offerings are available in every region, or that Tri-Point has an approved resale route for every offering.

## Native imagery and brand review

Original imagery was extracted from the supplied `Brand_Guidelines_2024_Draft_10.pdf`. Page 11 (PDF index 10) supplies the correct full-color Hot Cloud Storage lockup. Page 12 states that this tagline lockup is for partners selling/bundling Hot Cloud Storage; the Storing the World's Data lockup is Wasabi-only and was not used. Clear space should be at least the width of the logo's s. The page recommends a white background; artwork was preserved without recoloring or distortion.

The security hero comes from PDF page 17 (index 16). Card visuals are distinct original manufacturer isometric illustrations from PDF page 22 (index 21), mapped to relevant concepts. Alt text calls them illustrations, never photographs or literal screenshots of the product. These visuals were supplied in the marketing materials; the task authorizes using them in the design. This review does not invent a separate manufacturer authorization or reseller badge.

The PDF source includes JPEG2000 masks that pypdf reports as mismatched for some icon entries. The chosen visual outputs were inspected in a contact sheet for geometry, color, readability and white backgrounds. No black-mask artifact was retained in final assets. The logo and security hero were directly re-extracted with white alpha compositing and visually inspected separately.

## Primary sources checked live

- [Wasabi products and services](https://wasabi.com/product-terms): core product and Dell-delivered variants; used primarily for names, sales route and terms qualifications.
- [Hot Cloud Storage](https://wasabi.com/cloud-object-storage)
- [Wasabi Fire](https://wasabi.com/cloud-object-storage/wasabi-fire)
- [Cloud NAS](https://wasabi.com/cloud-object-storage/cloud-nas)
- [Surveillance Cloud](https://wasabi.com/cloud-object-storage/surveillance-cloud)
- [Storage management tools](https://wasabi.com/cloud-object-storage/tools)
- [Object Replication](https://wasabi.com/cloud-object-storage/object-replication)
- [Cloud Sync Manager](https://docs.wasabi.com/wcsm-wasabi-cloud-sync-manager)
- [Ball Transfer Appliance](https://wasabi.com/cloud-object-storage/tools/data-transfer-appliance)
- [Direct Connect](https://wasabi.com/cloud-object-storage/tools/direct-connect)
- [Account Control Manager](https://wasabi.com/cloud-object-storage/tools/account-control-manager)
- [Custom Cloud Console](https://docs.wasabi.com/docs/custom-cloud-console-getting-started)
- [Explorer](https://docs.wasabi.com/docs/Wasabi-Explorer)
- [Support plans](https://wasabi.com/support)
- [Covert Copy explanation](https://wasabi.com/blog/data-protection/covert-copy-the-strongest-air-gap-you-ll-never-notice)
- [AI Storage / MCP beta](https://wasabi.com/solutions/ai)

Supplied evidence also includes Cloud Nas Data Sheet.pdf, Covert-Copy-One-Pager.pdf, Wasabi Account Control Manager Data Sheet.pdf, Wasabi_Style_Guide.pdf and the surveillance presentation. Case-study customers were not presented as Tri-Point customers.

## Qualifications and open coverage notes

The earlier Wasabi AiR URL redirects to the current AI Storage solution page. AiR therefore is not advertised here as a currently purchasable standalone SKU. A distinct Wasabi AI Storage solution card links to the current destination and describes datasets, checkpoints and model artifacts without asserting a separate SKU or claiming that the manufacturer officially renamed AiR. Wasabi Fire's current page requires inquiry for pricing and availability.

The primary Hot Cloud Storage page also lists the Wasabi App for Acronis, Wasabi Panel for Adobe and Wasabi for ConnectWise PSA. These are third-party ecosystem integrations rather than separate core storage products; the catalog links to manufacturer documentation rather than implying these are included with every storage subscription. Wasabi Compute appears in WACM utilization documentation as an IBM-powered integration; general retail availability and a Tri-Point sales route were not established, so it is not presented as a separate saleable product.

Per-entry `offeringType` and `inquiryLabel` distinguish storage products, platform capabilities, Dell-delivered offerings, services, management tools, the AI solution and the MCP beta. Non-product tools are discussed rather than automatically quoted as separately sold products.

No numeric storage price, percentage savings, trial promise, FedRAMP authorization, government-cloud certification, universal compatibility, guaranteed ransomware prevention or universal free-egress claim is asserted. Product terms vary by offering: capacity minima and minimum storage duration apply, and the published pay-as-you-go egress policy qualifies the no-egress-fee claim. Quotes must confirm these details; the catalog's concise pricing note points to the governing terms.
