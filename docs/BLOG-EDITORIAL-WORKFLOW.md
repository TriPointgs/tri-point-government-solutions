# Tri-Point Procurement Insights — editorial controls

## Routes and direction of RSS
- Public blog: `https://tripointgs.com/blog`
- Tri-Point's **outgoing** RSS 2.0 feed: `https://tripointgs.com/blog/feed.xml`
- TD SYNNEX Marketing Portal's **outgoing** RSS network is a separate feed. Its screen says "Make the messages and media you post available to others through an RSS feed" and instructs saving, then editing, to get its generated URL. It does not directly import Tri-Point's RSS URL, nor does that give TD SYNNEX write access to this site.
- Automatic ContentMX publishing is permitted only as minimal, attributed *link previews* with a link back to the originating source. Do not republish third-party full articles, media or extended excerpts without reuse rights. Original Tri-Point articles still require manual editorial approval.

## Publishing a Tri-Point article
- Original editorial manuscripts are JSON in `content/blog/`. Current samples are **drafts**, and are absent from public pages and feed.
- Editor reviews factual statements, buyer applicability, product rights and any third-party sources; update the approved text and required exact approval record.
- An article can be published ONLY with `status: approved`, nonempty `approvedBy`, valid UTC `approvedAt` and `publishedAt` at/after approval.
- Submit the change through reviewed GitHub PR and validated preview, then merge. Build regenerates the blog index, article page, schema.org BlogPosting metadata, sitemap and RSS feed from approved articles only.
- Never paste confidential customer requirements, internal margins, contractor contacts, supplier credentials, or third-party copyrighted assets into the public blog content repository.
- Editorial approvals are file-reviewed, not a claim of named in-app identity authentication. A separate gated CMS/editor can be considered after the initial launch.

## TD SYNNEX RSS network configuration
The portal offers a network with a generated RSS URL after Save/Edit. Suggested name: `Tri-Point TD SYNNEX Content RSS`; Microsite display No; automated posting No; no tags; leave Contact Synchronization Key blank unless a support specialist documents a requirement. UTM suggestions: source `tdsynnex`, medium `rss`, campaign `partner_content`. The user-supplied ContentMX RSS URL is configured as the repository Actions secret CONTENTMX_RSS_URL; do not hardcode it in public code. RSS is an external input for the scheduled link-preview importer, not a direct publishing API. The original-host URL must resolve and return RSS before a scheduled run can publish. A failed feed or zero eligible entries fails closed without changing published content.

## Quality gates
Generated pages use the existing Tri-Point branding and business address. The standalone Lenovo page is preserved; public Zoom marketing remains gated. RSS contains absolute item links, unique GUIDs and valid RFC-822 UTC publication dates when any posts are approved. Empty feeds are valid until the first article has been reviewed and approved.

## Automated ContentMX link-preview publishing
- GitHub Actions runs at 00:17, 06:17, 12:17 and 18:17 UTC, and can be manually dispatched.
- It fetches the user-configured `CONTENTMX_RSS_URL`, parses at most 50 feed items, and creates no more than 12 new, dated link previews per run from the last 90 days.
- Deduplicates on feed GUID or canonical source URL and retains source link attribution. Original articles remain under the named approval workflow.
- No third-party full text, images, or HTML is copied. Restricted product marketing claims are filtered and content is escaped at render time.
- `npm run build` must pass before the workflow commits generated posts to `main`; Vercel builds the blog, article pages and `/blog/feed.xml` on that commit.
- A malformed feed, missing secret, non-XML response or a feed without eligible items fails the run without publishing anything. Check Actions job logs for operational errors.
