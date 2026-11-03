# Brand-page owner revisions - November 2, 2026

Owner requested live revisions to the published Wasabi and PTZOptics pages and homepage. Baseline/rollback production source: 8b72a24b2cabff551f9d0113be94157fcfdad53f, tree 26ae07b673fd15742b8697bd34417ac9005cf598. Previous production deployment: dpl_7qZTr1X8s8L3CcxaWwGef7JLds48.

## Changes
- Removed outgoing manufacturer product-information links from both rendered catalogs. Product detail and card actions now lead to Tri-Point's quote contact, retaining selected-product prefill. Source URLs remain in internal catalog evidence; they are not visitor-facing links.
- Replaced the shared public header image with the owner's exact TriPoint_Logo_Transparent.png, served as assets/tripoint-header-logo.png. File SHA-256 is 3a7dfe145100cc2b225add43283c9fafb8c585a23367814c779b0aca85c0bc5b; original 3280 x 664 RGBA bytes are unchanged. Existing legacy SVGs and footer artwork are retained.
- Added a dedicated Houses of worship PTZOptics application card and explicit introductory mention, covering services/sermons, congregation participation, camera placement, tracking, volunteer control and existing audio.
- Added three homepage brand-logo badges for Zoom, PTZOptics and Wasabi above the existing Lenovo/Fortinet sections. PTZOptics and Wasabi lead to Tri-Point's own solution pages. Zoom leads to Tri-Point's manual quote inquiry; its gated product page remains gated.
- Zoom uses the official 2025 wordmark from the Zoom media kit, not an invented Zoom Up tier badge. PTZOptics and Wasabi use the existing manufacturer artwork. No new authorization/certification claims were added.
- Corrected unreadable inactive category labels. The generic important button color was winning the cascade; an ID-scoped important rule now supplies readable foreground, text-fill and background colors for both selected and inactive tabs.

## Sources and validation
Owner supplied the Tri-Point image directly. Zoom's official media kit is https://www.zoom.com/en/about/media-kit/ ; the image loaded by that page is https://media.zoom.com/images/assets/zoom-logo-2025.png/Zz04ZjU1ODA4OGM5NjUxMWYwYWQ3NDIyZTYxNWM4NmY4Yg== . Native image bytes are self-hosted; no manufacturer site is loaded by homepage visitors.

All 244 tests and the clean production build passed. Six catalog browser scenarios (Wasabi/PTZOptics at 1440,768,390px) plus two homepage scenarios (1440,390px) passed. Checks cover image decoding, supplied header logo, independent worship heading, zero outbound catalog/manufacturer links, product quote prefill, category/search/reset, comparison, legacy visibility, keyboard close, no horizontal overflow and readable tab contrast of at least 4.5:1 using the actual text-fill color. Homepage badge images, internal destinations and Zoom manual email prefill were verified. No forms, email links or payments were submitted.

No payment/tax/supplier settings, background email automation, original marketing archives or marketplace launch state changed. Public publication is through a scoped PR based on current main; private checkout draft PR 23 remains separate. Hosted production status and public-domain checks must be independently verified after merge.
