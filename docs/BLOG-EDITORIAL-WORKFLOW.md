# Tri-Point Procurement Insights — editorial controls

## Routes and direction of RSS
- Public blog: `https://tripointgs.com/blog`
- Tri-Point's **outgoing** RSS 2.0 feed: `https://tripointgs.com/blog/feed.xml`
- TD SYNNEX Marketing Portal's **outgoing** RSS network is a separate feed. Its screen says "Make the messages and media you post available to others through an RSS feed" and instructs saving, then editing, to get its generated URL. It does not directly import Tri-Point's RSS URL, nor does that give TD SYNNEX write access to this site.
- Do NOT automatically import/repost TD SYNNEX or vendor materials without explicit content reuse rights, authorization review and editorial approval.

## Publishing a Tri-Point article
- Original editorial manuscripts are JSON in `content/blog/`. Current samples are **drafts**, and are absent from public pages and feed.
- Editor reviews factual statements, buyer applicability, product rights and any third-party sources; update the approved text and required exact approval record.
- An article can be published ONLY with `status: approved`, nonempty `approvedBy`, valid UTC `approvedAt` and `publishedAt` at/after approval.
- Submit the change through reviewed GitHub PR and validated preview, then merge. Build regenerates the blog index, article page, schema.org BlogPosting metadata, sitemap and RSS feed from approved articles only.
- Never paste confidential customer requirements, internal margins, contractor contacts, supplier credentials, or third-party copyrighted assets into the public blog content repository.
- Editorial approvals are file-reviewed, not a claim of named in-app identity authentication. A separate gated CMS/editor can be considered after the initial launch.

## TD SYNNEX RSS network configuration
The portal offers a network with a generated RSS URL after Save/Edit. Suggested name: `Tri-Point TD SYNNEX Content RSS`; Microsite display No; automated posting No; no tags; leave Contact Synchronization Key blank unless a support specialist documents a requirement. UTM suggestions: source `tdsynnex`, medium `rss`, campaign `partner_content`. The portal's RSS URL is **not known yet** and must be copied from its saved network settings. Treat it as an optional third-party input for staff curation, never a live publish-to-website API.

## Quality gates
Generated pages use the existing Tri-Point branding and business address. The standalone Lenovo page is preserved; public Zoom marketing remains gated. RSS contains absolute item links, unique GUIDs and valid RFC-822 UTC publication dates when any posts are approved. Empty feeds are valid until the first article has been reviewed and approved.
