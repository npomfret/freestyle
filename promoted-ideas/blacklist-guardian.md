# Blacklist Guardian

## Concept
A service that finds businesses with real email deliverability risks, alerts them with specific evidence, and sells a simple fix/monitoring package.

The practical wedge is not "monitor every blacklist and perfectly identify every IP owner." That becomes messy because the IP owner is often AWS, Microsoft, Cloudflare, a hosting provider, an ISP, or an agency rather than the affected business. The more achievable version is domain-first: collect business domains in a niche or region, check their email/DNS health, and only contact businesses when there are concrete findings.

This can work as an automated lead-generation engine because the outreach is based on a specific technical issue the recipient can verify.

## Target Audience
*   Small to Medium-sized Businesses (SMBs) reliant on email for invoices, bookings, quotes, ecommerce orders, or customer support.
*   Managed Service Providers (MSPs) that want a source of qualified local prospects.
*   Email marketing agencies and deliverability consultants managing client reputation.
*   Web hosting providers and web agencies that can resell monitoring/remediation.

Best first verticals:

*   Dentists, clinics, estate agents, accountants, recruiters, hotels, ecommerce shops, trades companies, and B2B service firms.
*   Businesses where missed emails have obvious revenue impact.
*   Incorporated businesses with public generic contact routes, avoiding sole traders where consent/compliance is less clear.

## Core Offering
1.  **Domain Email Health Scanner:** Check each business domain for deliverability and trust signals: MX records, SPF, DKIM hints, DMARC, DNS errors, RBL/blacklist signals for relevant mail hosts/IPs, and obvious misalignment.
2.  **Risk Scoring:** Score domains by severity and confidence. Avoid contacting low-confidence cases.
3.  **Evidence Report URL:** Generate a simple public report page showing what was found, why it matters, and what to fix.
4.  **Automated Outreach:** Send low-volume, specific alerts to generic business contacts such as `info@`, `hello@`, `contact@`, `postmaster@`, or published contact forms.
5.  **Guided Remediation Workflow:** LLM-assisted, context-specific instructions to help users fix the root cause: SPF syntax, DMARC setup, DNS provider steps, blacklist delisting links, and email provider-specific guidance.
6.  **Paid Monitoring:** Ongoing monitoring and alerts after the initial fix.

Use blacklists as one signal, not the whole product. Safer first findings include:

*   No DMARC record.
*   DMARC is present but only `p=none`.
*   SPF missing.
*   SPF syntax error or too many DNS lookups.
*   MX record missing or misconfigured.
*   Mail host or resolved sending IP appears on at least one public blacklist.
*   Domain has inconsistent website/email setup.
*   DNS records suggest common email provider configuration mistakes.

## Differentiation
Focus on automated discovery plus plain-English remediation.

Most blacklist tools are passive: users check themselves after they already suspect a problem. Blacklist Guardian becomes proactive: it finds affected businesses first, explains the issue in non-technical language, and offers a fixed-price repair or monitoring package.

The product should avoid scare language. Positioning should be:

> "We found a concrete email configuration issue that may affect deliverability. Here is the evidence and a simple path to fix it."

Not:

> "You have been hacked" or "your business is compromised."

## Monetization Strategy (Freemium)
*   **One-off Fix:** GBP 49-199 for a guided email/DNS health fix, depending on complexity.
*   **Monitoring Subscription:** GBP 10-30/month per domain for ongoing checks and alerts.
*   **MSP/Agency Lead Feed:** GBP 99-499/month for qualified local/domain leads with evidence reports.
*   **White-label Reports:** Agencies can send branded reports to prospects and clients.
*   **Free Public Report:** A limited report URL acts as the lead magnet and proof.

The most solo-dev-friendly model is an MSP/agency lead feed because one paying customer can consume many generated leads. Direct SMB sales can be automated, but support burden should be tightly controlled with fixed packages and clear scope.

## AI/LLM Angle
*   Use deterministic checks for the actual scoring. Do not let an LLM decide whether a domain is broken.
*   Use an LLM to translate findings into plain English and generate provider-specific remediation steps.
*   Use an LLM to draft outreach emails from structured findings, with strict templates and no unsupported claims.
*   Use an LLM to summarize the report for MSPs/agencies: "why this is a good prospect" and "what to say first."

## Dataset/API Integration
*   **Domain Sources:**
    *   Public business directories, search results, niche directories, local chamber/member lists, trade associations, ecommerce category pages, and Companies House enrichment where appropriate.
    *   Start with one niche and one region rather than broad web crawling.
*   **DNS and Email Checks:**
    *   Direct DNS lookups for MX, SPF, DMARC, DKIM selectors where inferable, CAA, and basic DNS health.
    *   Open-source libraries for SPF parsing and DNS validation.
*   **Primary Reputation Monitoring:**
    *   HetrixTools: https://hetrixtools.com/ (Free tier: 32 IPs/domains, hourly checks)
    *   MXToolbox: https://mxtoolbox.com/ (Free tier: 1 IP monitor, weekly checks)
    *   AbuseIPDB: https://www.abuseipdb.com/ (Free tier: 1,000 lookups/day)
    *   GlockApps: https://glockapps.com/ (Free tier: checks dozens of lists daily)
    *   Public DNSBL/RBL queries where terms permit automated checking.
    *   Google Postmaster Tools: https://postmaster.google.com/ (Free, useful only after domain verification; not suitable for cold prospecting).
*   **Ownership/Contact Enrichment:**
    *   Website contact pages and generic contact emails.
    *   RDAP/WHOIS abuse contacts for infrastructure-level notification, but these often point to hosting providers rather than the affected business.
    *   Companies House for company status/enrichment, not as the sole contact source.
*   **Potential Paid APIs (for higher coverage):**
    *   IPQualityScore: https://www.ipqualityscore.com/ (Free tier: 1,000 lookups/day, paid plans start at $99/month)
*   **LLM:**
    *   Gemini CLI (via `gemini-cli` provider): Free tier.

## Automated Lead-Gen Workflow

1.  Choose a vertical and region, e.g. "estate agents in Manchester" or "dentists in Birmingham."
2.  Build a domain list from public sources.
3.  Run DNS/email health checks.
4.  Filter to domains with two or more concrete issues, or one high-severity issue.
5.  Generate a public report URL.
6.  Send a short, specific alert to generic business contacts.
7.  Suppress opt-outs permanently.
8.  Recheck after a fixed interval and avoid repeated nagging.
9.  Offer either:
    *   "Fix this for GBP 99."
    *   "Monitor this domain for GBP 15/month."
    *   "Book a 15-minute handoff to one of our MSP partners."

Example outreach angle:

> We found a likely email deliverability issue on `example.com`: no DMARC policy and an SPF configuration problem. This can cause customer emails, quotes, invoices, or booking confirmations to land in spam. We generated a free technical report here: [report URL].

Do not lead with blacklist claims unless the signal is strong and current.

## Compliance and Deliverability Guardrails

For UK B2B outreach:

*   Prefer incorporated businesses and generic role/business inboxes.
*   Avoid sole traders and unincorporated partnerships unless there is consent or a safer lawful route.
*   Include sender identity and a clear opt-out.
*   Maintain suppression lists forever.
*   Avoid tracking pixels in early campaigns.
*   Keep send volume low and reputation-safe.
*   Use factual wording tied to observable DNS/reputation findings.
*   Do not imply breach, compromise, negligence, or guaranteed loss.
*   If using named contacts or personal business emails, treat it as personal data and handle UK GDPR obligations properly.

This is not legal advice; it is an operating constraint for keeping the MVP low-risk.

## Cost Considerations
*   **Development Time:** Free (leveraging existing tools and LLM).
*   **Infrastructure:** Minimal VPS cost (~$10-20/month) for hosting open-source tools like AbuseBox.
*   **API Costs:** Primarily leverages free tiers. Paid tiers for premium monitoring services are within the $5000/year budget.
*   **Estimated Annual Cost (Initial):** ~$120 - $240 for infrastructure + potential API upgrades.

## Geographic Suitability
Global, with an initial focus on English-speaking markets (US, UK, Canada, Australia).

## Scaling
*   Expand monitoring capabilities and integrate more threat intelligence feeds.
*   Develop a white-label solution for Managed Service Providers (MSPs).
*   Integrate with SIEM tools.
*   Explore other types of IP abuse beyond email blacklisting.

## Recommended MVP

Build the smallest automated version:

*   One region.
*   One vertical.
*   Domain scanner for MX, SPF, DMARC, and basic blacklist checks.
*   Simple risk score.
*   Static/public report page per domain.
*   Automated but rate-limited outreach to generic inboxes only.
*   One fixed-price remediation offer.
*   Suppression list and resend limits from day one.

Avoid in v1:

*   Trying to monitor every IP on the internet.
*   Perfect owner attribution.
*   Automated delisting submissions.
*   Security breach language.
*   Phone outreach.
*   Deep integrations with Google Postmaster Tools before the customer verifies ownership.
*   Broad SMB positioning without a niche.

## Open Questions

*   Which vertical has the highest pain from missed email and the easiest public domain sourcing?
*   What issue threshold creates enough urgency without too many false positives?
*   Will SMBs buy a one-off fix, or is this better sold to MSPs as a recurring lead feed?
*   Which contact route gets the best response: generic email, contact form, postal letter, or MSP-branded outreach?
*   What blacklist/reputation sources allow automated commercial checking at the needed volume?
*   Can the product produce enough good reports without paid enrichment APIs?
