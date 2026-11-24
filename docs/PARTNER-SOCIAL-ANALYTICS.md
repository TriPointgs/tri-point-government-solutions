# Partner social analytics checkpoint

## Scope and decisions — November 23, 2026 (Eastern)

The owner requested integrating the existing partner social links into Tri-Point's analytics. Preserve the existing five landing pages, fifteen links, production-only tracking and explicit analytics opt-in. Do not introduce advertising tags or send inquiry contents to analytics.

- Site: https://tripointgs.com
- Repository: TriPointgs/tri-point-government-solutions
- Vercel project: prj_UjpRL2l0GA6wo5J0aiNS60jF822Y; team: team_nCKyxtfiIemEXruHDc6rpsaj
- Verified pre-change production commit: 78e300d6808d953dee84f89ad6441a0a870a5c95
- Rollback deployment: dpl_7Wi1nTtbFMhyXryruXjgnw8GxgWe
- Active GA4 property: 565556525, account 417239763, stream measurement ID G-J4BCEYLBCZ.

## Implementation

The prior script sent clean page addresses but omitted manual campaign attribution. The new script keeps clean addresses and separately passes Google's campaign_source, campaign_medium and campaign_name fields after opt-in. It accepts only one complete supported triplet; unknown, duplicated or incomplete campaign fields are ignored.

| Field | Accepted values |
| --- | --- |
| utm_source | linkedin, x, facebook |
| utm_medium | social |
| utm_campaign | partner_lenovo, partner_fortinet, partner_wasabi, partner_ptzoptics, partner_arctic_wolf |

Do not put internal UTMs on contact links: GA maintains session attribution after arrival. Future platforms, paid campaigns or per-post identifiers require an intentional extension to the allowlist and tests. The current links distinguish partner and platform, not individual posts.

A fixed generate_lead event fires after a confirmed production quote receipt, including a successful retry after an uncertain response. Failed submissions, preview receipts, unconsented visits and private routes do not emit this event. Form data and receipt IDs never enter its payload. A page's successful receipt is counted once. Analytics remains an opt-in sample, not a complete count of all inquiries or social clicks.

## Verified GA4 configuration

Using the signed-in info account, created generate_lead as a code-based key event with no monetary value and once-per-event counting. The Events table showed its star enabled and no stream data yet. No no-code pageview/form-submit rule was created.

Saved a separate report, **Tri-Point Partner Social Campaigns**, report ID 16401530712. Default dimension: Session campaign. Filter: Session campaign begins with partner_. Session source / medium is an available platform comparison. Key events and session key event rate are included; select generate_lead when available for confirmed quote reporting. Original Traffic acquisition report was preserved.

Report: https://analytics.google.com/analytics/web/?authuser=1#/a417239763p565556525/reports/explorer?params=_u.dateOption%3Dlast28Days%26_r.explorerCard..seldim%3D%5B%22sessionCampaignName%22,%22sessionSourceMedium%22%5D%26_r.explorerCard..columnFilters%3D%7B%22conversionEvent%22:%22generate_lead%22,%22sessionConversionRate%22:%22generate_lead%22%7D&r=16401530712

## Verified release and remaining observation

- Production build passed all 320 tests and existing public/private release checks.
- New behavioral tests cover all fifteen link combinations, unsupported/duplicate fields, URL/referrer sanitization, consent withdrawal/reallow, off-production/settings-only exclusion, receipt failure/test exclusion and confirmed retry deduplication.
- Build inspection confirmed the tag on all five partner pages and contact, settings-only on privacy, and no tag on login or the private contractor admin page.
- Production commit 2ddb9fca63cd3fe0757a01e5ed72fdfb09b4a28f deployed READY as dpl_5VUpstgVYFu5Sbh8ZZSQv6c5q99w and was assigned to tripointgs.com. Public analytics and contact script bytes matched the tested source.
- Google Analytics Realtime received the live Lenovo test page_view. Drilling into its parameters verified campaign=partner_lenovo, source=linkedin, medium=social. This was an internal verification visit, not evidence of a new prospect.
- The saved report is open with Session campaign plus Session source / medium, last 28 days, and generate_lead selected for Key events and Session key event rate. Last 28 days excludes today in this GA4 UI; use Today or a custom date through today when checking fresh traffic.
- No production quote was submitted for testing and no quote key event has been verified in Google yet. Its code path passed simulated production success, failure, preview and retry tests. The next real consenting submission is the remaining live confirmation.
- Historical visits whose tags were discarded cannot be repaired from this change. Standard reports need processing time after new consenting traffic arrives.

## Sources

- https://developers.google.com/analytics/devguides/collection/ga4/reference/config
- https://developers.google.com/analytics/devguides/collection/ga4/reference/events#generate_lead
