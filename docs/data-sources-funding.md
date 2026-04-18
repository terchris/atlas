# Data sources — funding

This document catalogs every funding-related data source we've discussed, what it brings, and what limitations come with it. It pairs with `data-sources.md` but zooms in on: money in, money out, grants, transparency, and financial context.

Each entry notes whether the data is **machine-readable** (usable directly in the app) or **documentary** (human-readable, usable only as a citation or through scraping/extraction).

---

## Primary — structured funding data

### 1. tilskudd.lottstift.no — state grants registry

- **URL**: https://tilskudd.lottstift.no/
- **Per-recipient URL**: `https://tilskudd.lottstift.no/mottaker/{organisasjonsnummer}/{year}/{slug}`
- **Red Cross page**: https://tilskudd.lottstift.no/mottaker/864139442/2024/norges-rode-kors
- **Operator**: Lotteri- og stiftelsestilsynet (Lottstift)
- **Auth**: None
- **Format**: HTML portal + downloadable CSV/XLSX (via the open-data page, see source 2)
- **Coverage**: All Norwegian state grants to NGOs across all ministries

**What it brings:**
- Per-organization view of every grant received, grant-by-grant, year-by-year
- For Røde Kors (organisasjonsnummer 864139442) in **2024**: 98 grants across 162 applications, totaling **NOK 530.2 million awarded** of NOK 564.6 million applied for
- Each grant lists: tilskuddsordning (grant scheme), amount, grantor, purpose
- **2024 top lines for Røde Kors:**
  - Tilskot til samfunnsnyttige og humanitære organisasjonar frå speleoverskotet til Norsk Tipping — **NOK 334.4m**
  - Momskompensasjon for frivillige organisasjonar — **NOK 45.7m**
  - Tilskudd til frivillige organisasjoner i redningstjenesten — **NOK 44.7m**
  - Aktivitetstilbud for personer med rusmiddelproblemer, psykiske helseproblemer — **NOK 12.8m**
  - Tilskudd til inkludering av barn og unge — **NOK 10.05m**
  - (plus ~93 more smaller grants)
- **Per-kommune view**: a national map showing grant distribution geographically
- **Recipient metadata from Einingsregisteret and Frivillighetsregisteret**: activity codes, sector, address

**Why it matters:** The single largest source of concrete, named, itemized public funding data. Covers every NGO in Norway, not just Red Cross — making *comparison* possible (Røde Kors vs. Folkehjelp vs. Redningsselskapet, etc.).

**Important nuance:** Geographic attribution uses the recipient's **postal address** from Einingsregisteret, not where the money is actually spent. National organizations with Oslo addresses will appear concentrated there, even though the activity is spread across Norway.

---

### 2. Lottstift open data — CSV/XLSX downloads

- **Landing page**: https://lottstift.no/nb/om-oss/apne-data/
- **Catalog entry**: https://data.norge.no/en/datasets/c56c33ae-3d48-407f-b2b1-41d593e83c4c
- **License**: Norwegian Licence for Open Government Data (NLOD 2.0)
- **Auth**: None
- **Formats**: CSV and XLSX

**What it brings:**
- Downloadable bulk data covering: bingo, lotteri, pengespill, **tilskudd** (grants), **mva-kompensasjon** (VAT compensation), hjelpelinjen, stiftelser
- This is the machine-readable substrate behind the tilskudd.no portal
- Annual updates

**Why it matters:** Makes the grants data usable programmatically. Any funding visualization in the app can be built on top of CSV imports, no scraping required.

**Caveat:** The data.norge.no catalog entry lists temporal scope 2010–2016, but the live portal clearly has current data through 2024/2025. The catalog metadata is stale; the actual data is fresh. Worth checking the Lottstift page directly for current file URLs.

---

## Primary — organizational financials

### 3. Røde Kors Annual Report 2024 (Årsrapport)

- **Norwegian PDF (78 pages)**: https://www.rodekors.no/globalassets/_rapporter/_arsrapporter-rode-kors/2024_arsrapport_rode-kors_web_uu.pdf
- **English PDF**: https://www.rodekors.no/globalassets/_rapporter/_arsrapporter-rode-kors/internasjonal-resultatrapport/2024_rk_arsrapport_eng.pdf
- **All reports**: https://www.rodekors.no/om/rapporter/
- **Format**: PDF
- **Auth**: None

**What it brings:**
- Full activity-based financial statement (**aktivitetsregnskap**)
- Income broken down by source: public grants, Norsk Tipping, private donations, Pantelotteri, finance income
- Expenses by program area: "Redde liv", "Trygg oppvekst", "Fellesskap og livsmestring", international contributions
- Split between earmarked (bundne) and flexible (frie) funds
- Balance sheet including ubrukte statsmidler as liabilities
- Independent auditor's report
- Activity achievements (narrative)

**Key 2024 figures** (when verified from the report itself):
- Total funds raised for humanitarian purposes: NOK 3,364m (association) / NOK 3,566m (group)
- Positive cash flow: NOK 100m
- Financial portfolio (ethical investments): NOK 3,561m
- Percentage to purpose: 94% (per the Grok document; the current website says 93% — minor year-over-year variation)

**Why it matters:** The authoritative source. Every other funding claim about Red Cross Norway traces back here. Covers things the grants registry cannot: private donations, membership dues, webshop revenue, financial returns.

**Limitation:** PDF only. No machine-readable version. For app use we'd need to extract tables (e.g. via pdfplumber) or transcribe key numbers manually.

---

### 4. Røde Kors økonomi page

- **URL**: https://www.rodekors.no/om/rode-kors-okonomi/
- **Format**: HTML
- **Auth**: None

**What it brings:**
- Plain-language explanation of Red Cross's funding model
- Current headline stats (updated by Red Cross): **93% to formål, 5% fundraising, 2% administration**
- **~35% national / ~65% international** split of income to humanitarian activity
- **~70% bundne midler / ~30% frie midler** split
- Context on the investment portfolio (origins: slot-machine compensation 2001-2007; NOK 2 billion saved, never touched with donated money; annual real-return withdrawal NOK 75-80m)
- Key operational numbers: **372 lokalforeninger, ~42,000 volunteers, ~160,000 members** (this corrects the Grok document's 354 / 39,000)
- Link to finansforvaltning policy (PDF)

**Why it matters:** The "current truth" source — always reflects the latest figures Red Cross publicly stands behind.

**Note on correction:** Grok's document said 354 branches and 39,000 volunteers. The current økonomi page says 372 and ~42,000. We should use the latter.

---

### 5. Brønnøysundregistrene (Brreg) — registered financial data

- **Enhetsregisteret**: https://data.brreg.no/enhetsregisteret/
- **Regnskapsregisteret** (accounts registry) via Brreg
- **Auth**: None
- **Format**: JSON

**What it brings (funding angle):**
- Per-chapter organization numbers — already available via the Red Cross API
- Registered annual accounts where chapters file them (some do, some don't)
- Board members, signing authorities
- Ideell vs. næringsdrivende status
- ICNPO category (International Classification of Nonprofit Organizations)

**Why it matters:** Lets us verify chapter-level financial transparency. Chapters that file accounts can have their totals compared; chapters that don't are flagged.

**Limitation:** Local chapters vary hugely in what they publish. Some file full accounts, some only basic.

---

## Donation and revenue channels

### 6. Norsk Tipping — Grasrotandelen

- **Lookup URL pattern**: `https://www.norsk-tipping.no/grasrotandelen/#search={organisasjonsnummer}`
- **Auth**: None for public lookup
- **Format**: HTML (no official API confirmed)

**What it brings:**
- Per-chapter Grasrotandelen standing where publicly displayed: number of givers, total amount
- Deep-link into Grasrotandelen setup with a specific chapter's org number pre-filled

**Why it matters:** The only donation mechanism that's inherently chapter-local. Every chapter can be supported individually via its org number. This is the bridge between the "donate" experience and the local community.

---

### 7. Spleis — active crowdfunding campaigns

- **Red Cross org page**: https://www.spleis.no/org/1785
- **Auth**: None (for public pages)
- **Format**: HTML (no confirmed API)

**What it brings:**
- Live crowdfunding campaigns affiliated with Røde Kors
- Real-time amounts raised, supporter counts, campaign narratives, photos
- Can be scraped for live status

**Why it matters:** Only live-updating fundraising data source. Gives the app a "what's happening right now" pulse across the organization.

---

### 8. Webshop revenue flow

- **URL**: https://nettbutikk.rodekors.no/
- **Platform**: WooCommerce
- **Auth**: None for product browsing

**What it brings (funding angle):**
- Product prices and inventory as signals of commercial revenue stream
- Surplus from webshop sales flows to humanitarian work (part of the ~2b NOK budget)

**Why it matters:** The commerce dimension of giving. Buying a første­hjelps­skrin is both preparedness and donation.

**Limitation:** No public API for actual sales or revenue; we only see the shop front.

---

### 9. Pantelotteriet

- **Operator**: Norsk Tipping in partnership with Røde Kors
- **Format**: Human-readable context only

**What it brings:**
- Revenue stream from bottle-deposit micro-lottery
- Not directly queryable, but mentioned as a flexible-funds source on the økonomi page

---

## External / contextual

### 10. Innsamlingskontrollen

- **URL**: https://www.innsamlingskontrollen.no/organisasjoner/norges-rode-kors/
- **Format**: HTML

**What it brings:**
- Third-party oversight confirmation
- Fundraising transparency certification
- Cross-check on efficiency ratios claimed by Red Cross

**Why it matters:** Provides independent legitimacy to the "over 90% to purpose" claim.

---

### 11. SSB — economic and social context

Covered in the main `data-sources.md`. Funding-relevant tables worth flagging:

- KOSTRA data on kommune-level public spending on social services, culture, beredskap
- National public finance statistics (kan brukes for context: "Red Cross state funding as share of national humanitarian spending")
- Low-income household statistics per kommune (context for why certain activities are funded)

**Why it matters:** Contextualizes Red Cross's grants against what the kommuner themselves are spending.

---

### 12. Statsbudsjettet — relevant chapters

- **Chapters referenced in the grants data**: kap. 455 (rednings­tjeneste), others
- **Auth**: None; published on regjeringen.no
- **Format**: PDFs, statsbudsjett.no

**What it brings:**
- The legislative basis for each tilskuddsordning
- Annual allocation amounts at the national budget level
- Political debate context (Stortinget innstillinger)

**Why it matters:** Lets us trace individual grants back to the budget item that authorized them. Adds a political/legislative layer for anyone interested in where the money comes from.

---

## Quick-reference: 2024 public funding headlines

Sourced from tilskudd.lottstift.no for organisasjonsnummer 864139442:

| Metric | Value |
|---|---|
| Total applications in 2024 | 162 |
| Total tildelinger in 2024 | 98 |
| Total omsøkt (applied for) | NOK 564.65m |
| Total tildelt (awarded) | NOK 530.22m |
| Success rate (by NOK) | ~94% |
| Largest grant | Norsk Tipping speleoverskot — NOK 334.4m |
| Redningstjenesten grant | NOK 44.7m |
| Momskompensasjon | NOK 45.7m |

For broader context, the Red Cross økonomi page cites:
- Annual humanitarian budget ~2 billion NOK
- 93% to formål / 5% fundraising / 2% admin
- 35% national / 65% international humanitarian activity
- 70% bundne / 30% frie midler
- Investment portfolio ~3.56 billion NOK (from pre-2007 slot machine operations, generates ~75-80m/year in real returns)

---

## Machine-readability at a glance

| Source | Format | Usable in app? |
|---|---|---|
| tilskudd.lottstift.no portal | HTML | Scrape-feasible; stable URLs |
| Lottstift open data | CSV / XLSX | **Yes — direct** |
| Annual Report PDF | PDF | Extract tables via pdfplumber or transcribe |
| Økonomi page | HTML | Scrape for headline stats |
| Brreg | JSON API | **Yes — direct** |
| Grasrotandelen | HTML | Scrape per chapter, or deep-link only |
| Spleis | HTML | Scrape live campaigns |
| Webshop | HTML (WooCommerce) | Products scrapable; revenue not exposed |
| Innsamlingskontrollen | HTML | Citation only |
| Statsbudsjett | PDF | Citation only |

---

## Corrections to the compiled Grok document

For the record, checked against primary sources:

- **Number of chapters**: Grok said 354. Official current number is **372** (per økonomi page on rodekors.no).
- **Number of volunteers**: Grok said "over 39,000". Current figure is **~42,000**.
- **tilskudd.lottstift.no framing**: Grok called it "Norsk Tipping / Lottstiftelsen allocations". It's broader — all state grants across all ministries, not just Norsk Tipping.
- **Percentage to formål**: Grok said 94% for 2024. Website currently says 93%. Both plausible; 93% is the long-running average.
- **Machine-readability**: Grok didn't mention the Lottstift open data CSV/XLSX releases, which are the most actionable artifact for our purposes.

All other specific numbers Grok cited (334.4m Norsk Tipping, 44.7m redningstjenesten, 45.7m momskompensasjon, 530.2m total awarded) match the primary source exactly.
