# Cold Email B2B Best Practices Guide

Reference guide for AI template generation and campaign configuration in ProspectAI.
Compiled: 2026-04-02 | Target market: Spain / EU

---

## Table of Contents

1. [Email Deliverability Factors](#1-email-deliverability-factors)
2. [Spam Trigger Words to Avoid](#2-spam-trigger-words-to-avoid)
3. [Subject Line Best Practices](#3-subject-line-best-practices)
4. [Email Body Structure and Formatting](#4-email-body-structure-and-formatting)
5. [Personalization Strategies](#5-personalization-strategies)
6. [Legal Requirements (GDPR + Spain LSSI)](#6-legal-requirements)
7. [Sending Frequency and Warm-Up](#7-sending-frequency-and-warm-up)
8. [Technical Best Practices (SPF, DKIM, DMARC)](#8-technical-best-practices)
9. [Follow-Up Sequence Best Practices](#9-follow-up-sequence-best-practices)
10. [Unsubscribe Requirements](#10-unsubscribe-requirements)
11. [Template Structure Recommendations](#11-template-structure-recommendations)
12. [2026 Performance Benchmarks](#12-performance-benchmarks)

---

## 1. Email Deliverability Factors

### Critical Metrics to Maintain
- **Bounce rate**: Below 2% (warning), below 5% (critical/pause)
- **Spam complaint rate**: Below 0.1% (Google/Yahoo enforce at 0.3%)
- **Inbox placement**: Target 85%+ across Gmail, Outlook, Yahoo before scaling

### What Spam Filters Evaluate in 2026
Modern AI-powered spam filters have shifted from simple keyword detection to **system-level pattern recognition**. They evaluate:

1. **Sender reputation** - Domain age, sending history, complaint rates
2. **Authentication** - SPF, DKIM, DMARC alignment
3. **Engagement signals** - Open rates, reply rates, deletions without reading
4. **Content patterns** - Templated language detected with near-perfect accuracy
5. **Sending behavior** - Volume spikes, identical messages, timing patterns
6. **List quality** - Bounce rates, invalid addresses, role-based addresses

### Domain Strategy
- **Never** use the primary corporate domain for cold outreach
- Use dedicated subdomains (e.g., `outreach.domain.com`, `mail.domain.com`)
- Each subdomain needs its own SPF/DKIM/DMARC configuration
- A deliverability mistake costs outbound capacity, not the entire brand

---

## 2. Spam Trigger Words to Avoid

### Financial Words (AVOID)
Beneficiary, Billion, Cash, Cheap, Claims, Credit, Debt, Discount, Earn, Extra income, Fast cash, Finance, Financial freedom, Free grant, Free investment, Free money, Get paid, Hidden charges, Income, Insurance, Investment, Loan, Money, Money back, No cost, Opportunity, Prize, Profit, Rates, Refund, Save, Withdrawal

### Urgency and Scarcity Words (AVOID)
Act now, Apply now, Call now, Click now, Deal ending, Don't delete, Don't hesitate, Exclusive deal, Expire, Expires today, Final, Get it now, Hurry, Immediately, Important information, Instant, Last chance, Limited time, Now only, Offer expires, Once in a lifetime, One time, Only, Order now, Please read, Special promotion, Supplies are limited, Take action, Time limited, Today, Urgent, While stocks last, Won't last, You have been selected

### Exaggeration and Hype Words (AVOID)
100% free, 100% satisfied, Guaranteed results, Zero risk, Fail proof, All new, Amazing, Best price, Bonus, Congratulations, Exclusive, Fantastic, For instant access, Free, Greatest, Guarantee, Guaranteed, Incredible, Join millions, Life changing, Miracle, Never, No catch, No fees, No gimmick, No strings, Promise, Revolutionary, Risk free, Satisfaction guaranteed, Success, Trial, Ultimate, Unbelievable, Unlimited, Winner

### Promotional Words (AVOID)
Ad, Advertise, Buy, Buy direct, Call free, Click here, Clearance, Deal, Free access, Free consultation, Free preview, Free quote, Free trial, Gift, Marketing, Offer, Order, Order today, Subscribe, Visit our website, Work from home

### Formatting Red Flags (AVOID)
- ALL CAPS in subject lines or body (exception: standard acronyms like CEO, ROI, SaaS)
- Multiple exclamation marks (!!!) or repeated question marks (???)
- Multiple emojis in subject lines
- Dollar signs ($$) or percentage symbols used promotionally
- Excessive bold or colored text in HTML emails
- Large images or image-heavy layouts

### Safe Alternatives for Common Trigger Words
| Avoid | Use Instead |
|-------|-------------|
| Free | Complimentary, no-cost pilot, included |
| Buy now | Learn more, explore, see how |
| Guaranteed | Proven, documented, demonstrated |
| Exclusive offer | Tailored approach, custom recommendation |
| Click here | [Contextual link text describing destination] |
| Don't miss | Worth considering, relevant to |
| Urgent | Timely, relevant now because... |
| Discount | Adjusted pricing, pilot terms |

---

## 3. Subject Line Best Practices

### Length and Format
- **Optimal length**: 4-7 words (under 50 characters)
- **Case**: Lowercase or sentence case (never Title Case or ALL CAPS)
- **Format**: Questions create a "curiosity gap" and perform well
- **Mobile**: Most clients show 30-40 characters; front-load the key info

### What Works
- Personalized with recipient's company name or a specific signal (+15-25% open rate lift)
- "Hi {{first_name}}" as subject earns ~45% open rate
- Reference something specific to the prospect's situation
- Create curiosity without being clickbait
- Short and direct: reads like a colleague's email, not marketing

### What to Avoid
- Spam trigger words (see Section 2)
- Emojis (one sparingly placed at end is tolerable; multiple are spam signals)
- RE: or FW: prefixes (deceptive, damages trust)
- Vague or generic subjects ("Quick question", "Opportunity")
- Overpromising or sensational claims
- In Spain: emails identified as commercial must include "Publicidad" identifier (see Section 6)

### Subject Line Formulas That Work in B2B
```
{{first_name}}, quick thought on {{company_pain_point}}
idea for {{company_name}}'s {{specific_initiative}}
{{company_name}} + {{your_company}} - {{specific_benefit}}
question about {{company_name}}'s {{department/process}}
saw {{company_name}}'s {{recent_news/change}}
{{mutual_connection}} suggested I reach out
```

---

## 4. Email Body Structure and Formatting

### Format: Plain Text Wins for Cold Outreach
- Plain text emails achieve **23% higher open rates** in B2B
- Plain text generates **21-42% more clicks**
- HTML with images causes a **23-37% drop** in open rates
- HTML cold emails bounce **674% more** than plain text
- Plain text looks like a personal 1:1 message, not marketing

### If HTML Is Necessary
- Use minimal HTML (no header images, background colors, or multiple fonts)
- Maintain **95/5 text-to-image ratio**
- Send multipart MIME (both plain text and HTML versions)
- Avoid tracking pixels if possible (they add HTML weight)

### Optimal Length
- **Initial email**: 75-125 words (under 150 words absolute max)
- **Follow-ups**: 50-75 words
- Emails over 150 words show measurable reply rate decline
- Principle: "Say one thing, say it well, and ask one question"

### The Four-Part Body Framework
```
1. HOOK (1-2 sentences)
   Acknowledge something specific about the prospect or their company.
   Demonstrates you researched them.

2. SIGNAL REFERENCE (1-2 sentences)
   Connect a buying signal to a business challenge.
   Explains what a recent change means for them.

3. VALUE PROPOSITION (2-3 sentences)
   Be specific and quantified. Avoid generic claims.
   Reference a similar company or result.

4. SOFT CTA (1 sentence)
   Ask for low-commitment engagement.
   One question only.
```

### CTA Best Practices
- **Never** request 30+ minutes in initial outreach
- Use minimal asks: "Interested?" or "Worth a 15-minute chat?"
- Avoid: "Let me know if you'd like to schedule a demo"
- One CTA per email, always
- Frame as a question, not a command
- Examples that work:
  - "Worth exploring?"
  - "Would a quick 15-minute call make sense this week?"
  - "Open to a brief conversation about this?"
  - "Interested in seeing how this would work for {{company_name}}?"

---

## 5. Personalization Strategies

### Hierarchy of Personalization (by effectiveness)
1. **Signal-based** (3-5x higher reply rates): Funding rounds, leadership changes, tech adoption, hiring patterns, competitive moves, SEC filings
2. **Content-based**: References to the prospect's LinkedIn posts, blog articles, podcast appearances, conference talks
3. **Pain-point-based**: Specific challenges relevant to their role/industry
4. **Firmographic**: Company size, industry, growth stage (baseline, least effective alone)

### What to Personalize
- **Subject line**: Company name or specific signal reference (+15-25% open rate)
- **Opening hook**: Something specific about the prospect (not generic flattery)
- **Value prop**: Tailored to their specific situation, not a generic pitch
- **CTA**: Relevant to their context

### Personalization Data Points to Collect
- Recent company news (funding, expansion, product launches)
- Job postings (indicate priorities and pain points)
- Technology stack changes
- Leadership transitions
- Regulatory changes affecting their industry
- Competitive landscape shifts
- Prospect's own content (LinkedIn posts, articles)

### What NOT to Do
- Generic "I love what {{company_name}} is doing" without specifics
- Over-personalization that feels creepy or stalker-like
- Fake personalization (inserting first name only)
- Using personal information (family, health, non-professional data)

### Reply Rate Benchmarks by Personalization Level
- Generic templates: 1-3% reply rate
- Basic personalization (name + company): 3-5%
- Advanced personalization (pain points, signals): 8-18%
- Hyper-personalized + multi-channel: 12-20%

---

## 6. Legal Requirements

### GDPR (EU-Wide)

#### Legal Basis for B2B Cold Email
- **Legitimate interest** (Article 6(1)(f)) can serve as the legal basis
- You must demonstrate: genuine business connection, minimum necessary data, reasonable expectation of contact, and documented balancing test

#### Required Documentation
- How each prospect's contact data was acquired
- Legitimate Interest Assessment (LIA) for each campaign type
- Purpose of outreach and why it is relevant to the recipient
- Opt-out processing procedures and response times
- Data retention policies
- Data security measures

#### Data Subject Rights
- **Right to object**: Must be honored immediately
- **Right to deletion**: Must respond within 1 month; requires removal from all systems (email lists, CRM, marketing automation, backups when feasible)
- **Right to access**: Must provide all data held about the individual upon request
- **Data minimization**: Collect only professional data necessary for outreach (name, email, job title, company)

#### Data Retention
- Remove non-responsive contacts after **30-60 days**
- Engaged contacts may be retained longer with documented justification
- Apply retention policies consistently and document them

### Spain-Specific: LSSI (Law 34/2002)

#### CRITICAL: Spain Is Stricter Than General GDPR

The LSSI is "lex specialis" (special law) that **takes precedence over GDPR** for electronic marketing in Spain. The Spanish Data Protection Authority (AEPD) has confirmed this.

#### Core Rule: Prior Consent Required
Article 21 of the LSSI **prohibits** sending commercial communications via email without the recipient's **prior express consent**. This applies to BOTH B2B and B2C.

#### Exception: Prior Contractual Relationship
Cold email is permitted WITHOUT consent only when ALL three conditions are met:
1. A prior contractual relationship exists between sender and recipient
2. Contact data was lawfully obtained during that relationship
3. The commercial communication is about products/services **similar** to those originally contracted

#### B2B Nuances in Spain
- Generic corporate emails (info@company.es, ventas@company.es) are generally treated as non-personal data
- Named business emails (nombre@company.es) are personal data and subject to full LSSI rules
- Professional contact data used in a B2B context has some recognition of lawfulness, but consent is still the default requirement

#### Identification Requirements
- Commercial emails must be clearly identifiable as advertising
- Best practice: include "Publicidad" identifier (though enforcement varies)
- Sender must be clearly identified
- Free and simple unsubscribe mechanism required in every message

#### Robinson List
- Spain maintains the "Lista Robinson" (national opt-out registry)
- Senders should consult this list unless the recipient previously consented
- Register at: https://www.listarobinson.es/

#### Penalties
| Severity | Fine Range |
|----------|-----------|
| Minor (single unsolicited email) | Up to EUR 30,000 |
| Serious (3+ emails/year to same person, mass sending) | EUR 150,001 - EUR 600,000 |

The AEPD actively enforces these rules (10,600+ complaints and EUR 22.4M in penalties in a single year).

### Practical Compliance Strategy for Spain Market

1. **Safest approach**: Only email prospects who have given prior consent (opt-in forms, event registrations, content downloads)
2. **B2B outreach approach** (higher risk): Target generic corporate addresses (info@, ventas@) with clear commercial identification, easy unsubscribe, and documented legitimate business purpose
3. **Always**: Include unsubscribe mechanism, identify sender clearly, respect opt-out immediately, consult Lista Robinson
4. **Never**: Send to personal email addresses without consent, continue emailing after opt-out, send more than 2 unsolicited emails to same recipient per year without response

---

## 7. Sending Frequency and Warm-Up

### Domain and Mailbox Warm-Up Schedule

#### Week-by-Week Ramp
| Week | Warm-Up Emails/Day | Cold Emails/Day | Notes |
|------|-------------------|-----------------|-------|
| 1 | 3-5 | 0 | Warm-up only, build reputation |
| 2 | 10-15 | 0 | Continue warm-up, monitor reputation |
| 3 (Day 15+) | 15-20 | 5-10 | Begin light cold outreach |
| 4 | 20-30 | 15-25 | Scale gradually |
| 5+ | 30-40 | 30-50 | Approaching safe daily limit |
| Steady state | Ongoing | 50-100 max | Per mailbox per day |

#### Warm-Up Requirements
- Use real interactions (replies, forwards) not just automated opens
- Warm-up emails should receive genuine engagement
- Continue warm-up activity even after cold sending begins
- Mix warm-up with cold sends throughout the day

### Sending Volume Limits
- **Per mailbox**: 50-100 emails/day maximum
- **Per SDR**: 200-375 emails/day across 3-5 mailboxes
- **Mailbox rotation**: Use 3-5 mailboxes per SDR
- **Never**: Sudden volume spikes from new or inactive domains

### Sending Patterns
- Mimic human behavior: variable gaps between emails
- No identical messages at the exact same timestamp
- Mix replies and engagement into sending activity
- Send during business hours (8 AM - 6 PM recipient's timezone)
- **Peak performance**: Tuesday-Thursday, 9-11 AM local time
- **Best single time slot**: Thursday mornings 9-11 AM (44% open rate)

### Sending Cadence Per Prospect
- **Maximum touches**: 4-6 per sequence over 2-3 weeks
- **Spacing**: 3-5 business days between emails
- **After no response**: Stop after sequence completion
- **Cool-down**: Wait 30-60 days before re-engaging non-responders

---

## 8. Technical Best Practices

### SPF (Sender Policy Framework)
- DNS TXT record listing authorized sending IPs
- Include your email service provider (e.g., `include:amazonses.com`)
- Setup time: 30-60 minutes + 24-48 hours DNS propagation
- Verify with MXToolbox or similar tools

### DKIM (DomainKeys Identified Mail)
- Public/private key pair for cryptographic email signing
- Proves email was sent from your domain and not altered
- Setup: Generate keys, add DNS CNAME/TXT record
- Setup time: 60-90 minutes + propagation

### DMARC (Domain-based Message Authentication)
- Policy telling receivers what to do with unauthenticated email
- Progressive enforcement recommended:
  1. Start: `p=none` (monitor only, collect reports)
  2. After 2-4 weeks: `p=quarantine` (suspicious emails to spam)
  3. After confidence: `p=reject` (block unauthenticated emails)
- Include `rua=mailto:dmarc@yourdomain.com` for aggregate reports

### Domain Alignment
- **SPF alignment**: Return-Path domain must match or be subdomain of From: address
- **DKIM alignment**: DKIM signing domain (d=) must match or be subdomain of From: address
- Misalignment causes DMARC failure even if SPF and DKIM both pass

### Additional Technical Setup
- **Reverse DNS (PTR record)**: Ensure sending IP has valid reverse DNS
- **Custom tracking domain**: Use your own domain for link tracking (not the ESP's default)
- **MX record**: Configure on sending subdomain if you want to receive replies
- **List-Unsubscribe header**: RFC 8058 compliant one-click unsubscribe (see Section 10)

### Monitoring Cadence
- Review DMARC reports weekly during setup, monthly at steady state
- Monitor spam complaints daily
- Check inbox placement weekly across Gmail, Outlook, Yahoo
- Track bounce rates per domain per campaign

---

## 9. Follow-Up Sequence Best Practices

### Optimal Sequence Structure

#### 5-Touch, 14-Day Sequence (Recommended)
| Day | Touch | Channel | Purpose |
|-----|-------|---------|---------|
| 1 | Email 1 | Email | Signal-based initial outreach |
| 3 | Email 2 | Email | Follow-up with new value/insight |
| 5-6 | Touch 3 | LinkedIn | Connection request + brief reference |
| 9-10 | Email 3 | Email | Social proof or case study |
| 12-14 | Email 4 | Email | Breakup email ("Last note from me") |

#### Alternative: 3-Email Sequence (Simpler)
| Day | Email | Purpose |
|-----|-------|---------|
| 1 | Initial | Problem identification + value prop |
| 4 | Follow-up 1 | New value angle + social proof |
| 10-11 | Follow-up 2 | Final outreach + graceful exit |

### Follow-Up Content Rules

#### DO: Add New Value in Every Touch
Each follow-up must "pay for the prospect's attention" with:
- A relevant case study
- An industry insight or data point
- A new angle on their specific challenge
- Social proof from a similar company
- A useful resource (article, tool, framework)

#### DON'T: Send "Bump" Emails
"Just bumping this to the top of your inbox" is a liability in 2026:
- Generates highest rate of manual spam reports
- Provides zero value to the recipient
- Signals low-effort outreach
- Damages sender reputation

### Follow-Up Email Guidelines
- **Length**: 50-75 words (shorter than initial email)
- **Tone**: Conversational, not pushy
- **Thread**: Reply to original email (same thread) for context
- **Each email**: Must have a different angle/value add
- **Final email**: Offer a graceful exit, no guilt-tripping

### Spintax / Syntax Variation
In 2026, sending identical blocks to many recipients is a spam signal. Use variation logic:
- Rotate opening phrases
- Vary sentence structures
- Use multiple versions of value props
- Randomize CTA phrasing
- This prevents pattern detection by AI spam filters

### When to Stop
- After completing the sequence (4-6 touches maximum)
- Immediately upon opt-out request
- After a clear "not interested" response
- When you have nothing new to add

---

## 10. Unsubscribe Requirements

### Technical Requirements (Gmail/Yahoo/Microsoft)

#### RFC 8058 One-Click Unsubscribe (Mandatory for bulk senders)
Required headers in every commercial email:
```
List-Unsubscribe: <https://yourdomain.com/unsubscribe?id=UNIQUE_ID>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

- Must use HTTPS URI (MAILTO alone is insufficient)
- Can include MAILTO alongside HTTPS for backward compatibility
- Must process unsubscribe within **48 hours**
- Required for senders of 5,000+ emails/day to Gmail/Yahoo users

### Legal Requirements

#### GDPR
- Unsubscribe link in every email footer
- Removal must be immediate upon request
- Must remove from ALL systems (email lists, CRM, automation, backups when feasible)
- Response to deletion requests within 1 month

#### Spain LSSI
- Free and simple opt-out mechanism in every communication
- Must include an email address for opt-out when publicity was delivered by email
- Opt-out must be available at all times
- Process must be simple and free of charge

### Implementation Checklist
- [ ] `List-Unsubscribe` header with HTTPS URL in every email
- [ ] `List-Unsubscribe-Post` header for one-click compliance
- [ ] Visible unsubscribe link in email footer (text and HTML versions)
- [ ] Unsubscribe page that works with one click (no login, no survey required)
- [ ] Automated suppression list management
- [ ] 48-hour maximum processing time
- [ ] Sync suppression across all sending domains and mailboxes
- [ ] Regular suppression list audits

---

## 11. Template Structure Recommendations

### Framework: PAS (Problem-Agitation-Solution)
Best for: Prospects aware of their problem but not your solution.
```
Subject: {{company_name}}'s {{specific_challenge}}

Hi {{first_name}},

[PROBLEM] I noticed {{company_name}} is {{specific observation that implies a challenge}}.

[AGITATION] For most {{industry}} companies, this typically means {{consequence or pain point}}.

[SOLUTION] We helped {{similar_company}} {{specific quantified result}} by {{brief method}}.

[CTA] Worth a quick 15-minute chat to see if something similar could work for {{company_name}}?

{{sender_name}}
{{sender_title}}, {{sender_company}}
```

### Framework: Signal-Based
Best for: Leveraging a specific buying trigger.
```
Subject: saw {{company_name}}'s {{signal}}

Hi {{first_name}},

[HOOK] Noticed {{specific signal - hiring, funding, expansion, etc.}}.

[SIGNAL REFERENCE] When {{similar companies}} go through this, they usually face {{related challenge}}.

[VALUE PROP] We helped {{reference company}} navigate this by {{method}}, resulting in {{quantified outcome}}.

[CTA] Would it make sense to explore if we could help {{company_name}} with this transition?

{{sender_name}}
```

### Framework: Social Proof Lead
Best for: Industries where peer validation matters.
```
Subject: how {{similar_company}} solved {{challenge}}

Hi {{first_name}},

[SOCIAL PROOF] {{similar_company}} was dealing with {{challenge}} -- they {{quantified result}} in {{timeframe}}.

[BRIDGE] Given {{company_name}}'s {{relevant similarity}}, I thought this might be relevant.

[CTA] Interested in a quick walkthrough of how they did it?

{{sender_name}}
```

### Framework: Mutual Connection / Referral
Best for: When you have a shared connection or context.
```
Subject: {{mutual_connection}} mentioned I should reach out

Hi {{first_name}},

[CONTEXT] {{mutual_connection}} and I were discussing {{topic}}, and your name came up in the context of {{specific reason}}.

[VALUE] We've been helping companies like {{reference}} with {{specific outcome}}.

[CTA] Would you be open to a brief conversation?

{{sender_name}}
```

### Follow-Up Templates

#### Follow-Up 1: New Value (Day 3-4)
```
Subject: RE: [original subject]

Hi {{first_name}},

Quick follow-up -- thought this might be useful:

[NEW INSIGHT] {{relevant data point, case study, or industry insight that adds value}}

[SOFT CTA] Worth discussing?

{{sender_name}}
```

#### Follow-Up 2: Social Proof (Day 7-9)
```
Subject: RE: [original subject]

Hi {{first_name}},

One more thought -- {{similar_company_in_their_industry}} recently {{achieved specific result}} using our approach.

[RELEVANCE] Given {{company_name}}'s focus on {{relevant area}}, I think you'd find the approach interesting.

[CTA] Happy to share the details in a quick call if useful.

{{sender_name}}
```

#### Breakup Email (Day 12-14)
```
Subject: RE: [original subject]

Hi {{first_name}},

Last note from me on this. I understand timing may not be right.

If {{specific_challenge}} becomes a priority for {{company_name}}, happy to pick this up anytime.

All the best,
{{sender_name}}
```

### Template Rules for AI Generation

When generating cold email templates, the AI MUST:

1. **Keep total word count between 75-125 words** (follow-ups: 50-75)
2. **Use plain text format** -- no HTML, no images, no formatting
3. **Include exactly one CTA** -- framed as a question, low commitment
4. **Avoid ALL spam trigger words** from Section 2
5. **Use lowercase or sentence case** in subject lines
6. **Reference at least one specific signal** about the prospect
7. **Never use generic flattery** ("I love what you're doing")
8. **Include proper closing** with name, title, company
9. **Vary language** across templates (use spintax/rotation)
10. **Never promise or guarantee outcomes** -- use "helped" / "achieved" language
11. **For Spain**: Include sender identification and unsubscribe mechanism
12. **One value proposition per email** -- never pitch multiple services

---

## 12. Performance Benchmarks

### 2026 B2B Cold Email Benchmarks

| Metric | Poor | Average | Good | Excellent |
|--------|------|---------|------|-----------|
| Open rate | <25% | 27-40% | 40-60% | 65%+ |
| Reply rate | <2% | 2-5% | 5-12% | 12-18% |
| Positive reply rate | <1% | 1-3% | 3-8% | 8%+ |
| Meeting booked rate | <0.5% | 0.5-1% | 1-3% | 3%+ |
| Bounce rate | >5% | 3-5% | 1-3% | <1% |
| Spam complaint rate | >0.3% | 0.1-0.3% | <0.1% | ~0% |
| Unsubscribe rate | >2% | 1-2% | 0.5-1% | <0.5% |

### Diagnostic Guide
- **Low open rates**: Deliverability issue (check authentication, warm-up, sender reputation)
- **Good opens, low replies**: Content issue (check personalization, relevance, CTA)
- **Good replies, low meetings**: Qualification issue (check targeting, ICP alignment)
- **High bounces**: List quality issue (verify emails before sending)
- **High spam complaints**: Content or targeting issue (improve relevance, check frequency)

### Optimal Sending Windows (Spain Timezone CET/CEST)
- **Best days**: Tuesday, Wednesday, Thursday
- **Best times**: 9:00-11:00 AM local time
- **Peak**: Thursday morning 9-11 AM
- **Avoid**: Monday morning (inbox overload), Friday afternoon (weekend mode)

---

## Quick Reference: The Non-Negotiables

For every cold email sent from ProspectAI:

- [ ] SPF, DKIM, DMARC properly configured on sending domain
- [ ] Sending from a subdomain (not primary corporate domain)
- [ ] Domain properly warmed up (minimum 2 weeks before cold sending)
- [ ] Email verified/validated before sending (reduce bounces)
- [ ] Plain text format (or minimal HTML with multipart MIME)
- [ ] 75-125 words for initial email
- [ ] Subject line: 4-7 words, lowercase/sentence case, no spam triggers
- [ ] At least one specific personalization element
- [ ] Single, soft CTA framed as a question
- [ ] No spam trigger words in subject or body
- [ ] List-Unsubscribe + List-Unsubscribe-Post headers (RFC 8058)
- [ ] Visible unsubscribe link in footer
- [ ] Sender clearly identified (name, title, company)
- [ ] For Spain: Comply with LSSI Article 21 (consent or prior relationship)
- [ ] Daily volume: 50-100 per mailbox maximum
- [ ] Spam complaint rate monitored and below 0.1%
- [ ] Syntax variation / spintax to avoid identical messages

---

## Sources

- [Autobound - Cold Email Best Practices 2026](https://www.autobound.ai/blog/cold-email-best-practices-2026)
- [Martal - B2B Cold Email Statistics 2026](https://martal.ca/b2b-cold-email-statistics-lb/)
- [MailReach - Cold Email Deliverability Guide 2026](https://www.mailreach.co/blog/cold-email-deliverability-sending-strategy)
- [Mailshake - 2026 Cold Email Deliverability Checklist](https://mailshake.com/blog/the-ultimate-2026-cold-email-deliverability-checklist/)
- [Aerosend - 140+ Spam Trigger Words 2026](https://www.aerosend.io/cold-email/spam-trigger/)
- [Instantly - Cold Email Benchmark Report 2026](https://instantly.ai/cold-email-benchmark-report-2026)
- [Sparkle - Cold Email Sequence Guide 2026](https://sparkle.io/blog/cold-email-sequence/)
- [GrowthList - GDPR Cold Email Guide 2026](https://growthlist.co/gdpr-cold-email/)
- [DLA Piper - Electronic Marketing in Spain](https://www.dlapiperdataprotection.com/index.html?t=electronic-marketing&c=ES)
- [Lawants - E-commerce Law in Spain (LSSI)](https://www.lawants.com/en/e-commerce-law-spain/)
- [Mariscal Abogados - Sanctions for Unsolicited Communications in Spain](https://www.mariscal-abogados.com/sanctions-in-spain-for-unsolicited-electronic-commercial-communications/)
- [Mailpool - The Role of Warm-Up in Cold Email 2026](https://www.mailpool.ai/blog/the-role-of-warm-up-in-cold-email-success-2026-update)
- [Mailivery - Email Warmup Schedule 2026](https://mailivery.io/blog/email-warmup-schedule)
- [SalesHive - DKIM DMARC SPF Best Practices](https://saleshive.com/blog/dkim-dmarc-spf-best-practices-email-security-deliverability/)
- [Mailgun - RFC 8058 One-Click Unsubscribe](https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/)
- [WarmForge - Plain Text vs HTML Cold Emails](https://www.warmforge.ai/blog/plain-text-vs-html-in-cold-emails)
- [Hypergen - 10 Best Cold Email Strategies 2026](https://www.hypergen.io/blog/the-10-best-cold-email-strategies-that-actually-get-responses)
