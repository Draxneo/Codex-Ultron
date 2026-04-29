# Old Sales Studio Extraction

Source reviewed:
- `https://csultramode.lovable.app/sales-presentations`
- Deployed bundle: `https://csultramode.lovable.app/assets/index-tdsaIl9G.js`
- Public readable old Supabase tables: `brochure_blocks`, `comparison_blocks`, `addons`, `presentation_sections`
- Authenticated Firecrawl browser pass through the live Presentation Design Studio

Earlier extraction used direct bundle inspection and public Supabase reads. A later authenticated Firecrawl pass confirmed the live Studio tabs and revealed additional certificate, rebate, agreement, and comparison content.

## Studio Structure

The old Presentation Design Studio had these tabs:

- Sales
- Repair
- Maint.
- Agreement
- Invoice
- Rebate
- Intake
- Certificates
- Content

The old project also had public customer routes for:

- `/presentation/:token`
- `/agreement/:token`
- `/certificate/:token`
- `/invoice/:token`
- `/intake/:token`
- `/cart/:token`
- `/q/:token`

## Customer Quote Sections

The old quick quote/customer quote flow was organized as:

1. Hero
2. Payment Options
3. Equipment & Specs
4. What's Included
5. Your Protection
6. CPS Energy Rebate
7. Why Carnes & Sons
8. Contact

These are the right sections to port into the new quote/cart customer preview. The phone cart should use a shorter version, but the customer preview should show this whole proposal.

## Quick Quote Picker

The old Quick Quote flow matched the way technicians talk:

1. Brand
2. Tonnage
3. System type
4. Tier
5. Install location

Example authenticated path:

- Carrier
- 3 Ton
- Gas / AC
- Any tier
- Attic

That produced Good, Better, and Best options with:

- Matched condenser, coil, and furnace models
- AHRI number
- SEER2 / EER2
- Cooling BTU
- 10-year parts warranty
- Financed system price
- Three payment options: 0% 36 months, 9.99% 120 months, instant factory rebate
- CPS rebate tier, early replacement amount, and burnout amount
- Buttons for Copy Full Quote, Preview Full Quote, and View as Customer

Recommendation:

Jarvis and the phone cart should use this exact mental model: `brand -> tonnage -> type -> tier -> orientation/location`. The technician should not have to search by model number first.

## Sales Hero

Reusable structure:

- Eyebrow: `Your Custom Quote`
- Headline: `Your New {brand} {tonnage}-Ton {Gas System | Heat Pump}`
- Supporting copy: `Hi {firstName} — quote prepared {date}.`

Recommendation:

Use this as the top of the customer preview after a tech builds the cart. Add a short benefit subheadline from the selected equipment sales profile.

## Payment Options

The old flow gave customers three clear choices:

- `Option A — 0% APR · 36 Months`
- `Option B — 9.99% APR · 120 Months`
- `Option C — Instant Factory Rebate`

Reusable copy:

- `Choose one — tap to approve.`
- `0% APR · 36 Months`
- `9.99% APR · 120 Months`
- `Instant Factory Rebate`

Recommendation:

Keep these as the proposal decision buttons. On mobile, show one option per card with the monthly payment or one-time price as the dominant number.

## Equipment & Specs

Fields shown in the old customer quote:

- Outdoor unit / heat pump
- Furnace / air handler
- Coil
- Heat kit
- Orientation
- SEER2
- EER2
- HSPF2
- Cooling capacity
- AFUE
- AHRI number

Recommendation:

Keep this section collapsed or lower on the customer page. The sales card should lead with benefits, then specs provide proof.

## What's Included

Old copy:

`All-Inclusive Pricing — permits, taxes, materials, and labor. No surprises, no hidden fees.`

Outdoor unit checklist:

- New pre-formed composite pad
- Proper equipment leveling
- New high-voltage emergency disconnect
- New electrical whip(s)
- Properly sized refrigerant lines
- Re-insulated refrigerant lines
- Factory-recommended start-up
- EPA-compliant disposal

Indoor unit checklist:

- Safe removal of existing equipment
- Multi-positional furnace & evaporator coil
- Gas line connection & leak testing
- New primary drain pan
- Ceiling saver pan
- Float safety switch
- Secure mounting
- Re-sealed plenums
- Sealed duct connections
- Proper condensate drain piping
- New thermostat installation
- Homeowner orientation

Start-up and QC checklist:

- Refrigerant charge verified
- Electrical connections inspected
- Final system walkthrough
- Gas pressure tested
- Full system operational testing
- Complete jobsite cleanup

Recommendation:

This should become a reusable install-included block in the new customer cart preview and install proposal.

## Protection

Old section title:

`Your Protection`

Cards:

- `10-Year Parts Warranty`
  `We register your new {brand} system with the manufacturer — no paperwork on your end.`

- `1-Year Labor`
  `Standard labor warranty included. Upgrade to 10-year labor coverage available.`

- `2 Years Comfort Club`
  `Annual maintenance & priority service included with every install.`

Recommendation:

Use this exactly as a protection block, but allow admin-editable labor warranty text because the included labor term may vary.

## CPS Energy Rebate

Old section title:

`CPS Energy Rebate`

Old supporting copy:

`We do the legwork — you just submit through your CPS Energy account.`

Qualification minimums:

- SEER2: 14.3
- EER2: 11.7
- HSPF2: 7.5

What we provide:

- AHRI certificate from the matched system
- Photos of the existing system for early replacement
- Permit information for City of San Antonio
- Itemized invoice from licensed contractor with model numbers, serial numbers, install date, address, and total paid

What customer provides:

- CPS Energy account
- About 10 minutes to upload the packet

Submission flow:

1. Customer creates rebate account using CPS Energy account info.
2. Carnes & Sons prepares the complete rebate packet and hands it off.
3. Customer uploads packet through the CPS rebate portal and submits.

Recommendation:

This should be a customer-visible block plus an office-side generated packet checklist. The customer-facing page should be careful to say the rebate is estimated and subject to CPS approval.

## Why Carnes & Sons

Old cards:

- `Family-Owned & Operated`
  `Three generations serving San Antonio.`

- `All-Inclusive Pricing`
  `No hidden fees, no surprises at the end.`

- `10-Year Parts Warranty`
  `Registered for you with the manufacturer.`

- `Comfort Club Included`
  `2 years of maintenance & priority service.`

- `Clean, Respectful Service`
  `We treat your home like our own.`

- `Licensed Texas HVAC Masters`
  `Certified, insured, and accountable.`

Recommendation:

Use this block in every install proposal. It sells trust, not equipment.

## Brochure Blocks

The old public `brochure_blocks` table had seven sales profiles:

- Goodman S4: Value
- Goodman S5: Value Plus
- Payne / Day & Night: Economy
- Carrier Comfort: Good
- Carrier Performance: Better
- Carrier Infinity: Best
- Carrier Greenspeed: Ultimate

Useful profile fields:

- `series`
- `brand`
- `label`
- `tagline`
- `compressor_type`
- `sound_level`
- `humidity_desc`
- `expected_lifespan`
- `features`

Recommendation:

Port this into the new app as equipment sales profiles. Do not rely only on model numbers inside `job_cart_items`.

## Comparison Blocks

The authenticated Studio comparison editor had these Good / Better / Best categories:

- Cooling Performance
- Comfort & Humidity
- Sound Levels
- Airflow & Fan
- Air Quality
- Reliability & Warranty
- Smart Features

### Cooling Performance

| Label | Good | Better | Best |
| --- | --- | --- | --- |
| Efficiency | 14 SEER | 17 SEER | 19+ SEER |
| Compressor type | Single-stage | Two-stage | Variable speed |
| Capacity range | 100% on or off | 65% / 100% | 25-100% continuous |
| Temperature consistency | +/-3-4°F swings | +/-2°F | +/-0.5-1°F |
| Hot/cold spots | Common | Reduced | Minimal |

### Comfort & Humidity

| Label | Good | Better | Best |
| --- | --- | --- | --- |
| Dehumidification | Basic | Better | Excellent |
| Humidity removal | Only when running | Longer cycles help | Runs low and slow, removes 2x more |
| Clammy feeling | Sometimes | Rarely | Never |
| Recommended for | Dry climates | Most homes | Humid climates, tight houses |

### Sound Levels

| Label | Good | Better | Best |
| --- | --- | --- | --- |
| Outdoor unit | 72-76 dB | 68-72 dB | 56-65 dB |
| Comparison | Vacuum cleaner | Normal conversation | Quiet library |
| Indoor blower | Noticeable | Softer | Near-silent |
| Startup sound | Hard start | Softer ramp | Smooth ramp, no jolt |

### Airflow & Fan

| Label | Good | Better | Best |
| --- | --- | --- | --- |
| Fan speeds | 1 speed | 2-3 speeds | Variable, unlimited |
| Airflow feel | Blast on/off | More even | Gentle, continuous |
| Short cycling | Common | Reduced | Rare |
| Run time | Short bursts | Longer cycles | Long, efficient cycles |

### Air Quality

| Label | Good | Better | Best |
| --- | --- | --- | --- |
| Filtration compatibility | Standard 1 inch filter | Standard 1 inch filter | High-capacity 4 inch+ media filter |
| Air circulation | Intermittent | Better | Continuous option |
| Dust/allergen control | Basic | Good | Excellent |
| UV / purifier ready | Add-on | Add-on | Integrated options |

### Reliability & Warranty

| Label | Good | Better | Best |
| --- | --- | --- | --- |
| Compressor stress | High, on/off cycling | Medium | Low, soft start, variable |
| Expected lifespan | 12-15 years | 15-18 years | 18-22 years |
| Parts warranty | 10 years | 10 years | 10 years |
| Labor warranty | 1 year | 1 year | Extended available |
| Smart diagnostics | No | No | Alerts before failure |

### Smart Features

| Label | Good | Better | Best |
| --- | --- | --- | --- |
| Wi-Fi thermostat | Compatible | Compatible | Included, Infinity |
| Phone alerts | No | No | Yes |
| Dealer diagnostics | Manual | Manual | Remote monitoring |
| Energy tracking | No | No | Yes |

Recommendation:

Use these comparison blocks on desktop proposal pages. On the phone, summarize the comparison into three benefit chips.

## Add-Ons

Old active add-ons:

- UV Air Purifier
  `Kills mold, bacteria & viruses in your ductwork and in the air`

- Smart Thermostat Upgrade
  `Wi-Fi thermostat with phone control & scheduling`

Recommendation:

Use add-ons as optional proposal cards after the main system is chosen, not mixed into the equipment picker.

## Repair Presentation

Old repair flow:

- Photo Evidence
- What We Found
- Your Repair Options
- Choose Your Payment Option

Repair tiers:

- Necessary
- Recommended
- Deluxe

Reusable explanation:

`The "Necessary" tier gets your system running again. "Recommended" addresses the items that could cause another breakdown soon. "Deluxe" takes care of everything — think of it as a full tune-up and repair in one visit, at the best value per item. Pick what's right for your budget and comfort — there's no wrong choice.`

Recommendation:

Keep repair separate from replacement system sales. The technician phone view can share the cart shell but should not overload replacement system picking with repair tier logic.

## Intake

Reusable fields:

- First Name
- Last Name
- Service Address
- Phone
- Email
- What's going on?
- Alternative contact name
- Alternative contact phone

Reusable copy:

`Please fill out your information below so we can get you set up quickly.`

Success:

`Thank You! Your information has been received. We'll be in touch shortly to schedule your service.`

## Certificates

Certificate template model:

- `display_name`
- `subtitle_template`
- `body_template`
- `warranty_years`
- `fields_schema`

Variables:

- `customerName`
- `brand`
- `model`
- `serialNumber`
- `installDate`
- `warrantyYears`
- `expirationDate`
- `equipmentDescription`
- `confirmationNumber`

Certificate types:

- Manufacturer warranty
- Labor warranty
- 10-year labor warranty
- No lemon
- Price match
- Comfort Club

Authenticated Studio template notes:

- Manufacturer Warranty Certificate: 10-year parts warranty, registration completed with the manufacturer, fields for brand, model, serial, install date, expiration, and confirmation.
- Labor Warranty Certificate: 2-year labor coverage for original installation labor, with equipment, install date, coverage expiration, and serial fields.
- Price Match Guarantee: match any licensed Texas contractor's written quote for identical equipment and scope, valid for 30 days.
- No-Lemon Guarantee: 5-year compressor-focused guarantee; if the compressor fails more than once during the first five years, replace the outdoor unit.
- 10-Year Labor Warranty: extended labor coverage certificate for upgraded warranty purchases.
- Comfort Club Membership: member-since certificate with plan, annual rate, and membership ID.

Recommendation:

Certificates should be generated after install completion and attached to the invoice/customer record. They can also be previewed from the customer proposal if the user buys extended labor coverage.

Status in UltraOffice 2.0:

- `certificate_templates` was empty in the beta database during the authenticated pass.
- Added migration `20260428191759_seed_certificate_templates_from_sales_studio.sql` to seed the six live Studio certificate templates.

## Build Direction

Use the old studio as the content foundation, but not as a separate destination the tech has to understand.

New flow:

1. Desktop proposal builder owns the rich presentation.
2. Tech phone picker only selects the right system.
3. Cart item stores the selected matchup plus sales profile snapshot.
4. Customer preview renders the full proposal sections.
5. Office can still export rebate/warranty/service documents from the same data.

The old project already proves the content model works. The new app needs to wire that content into cart and quote snapshots instead of making the tech manually navigate a design studio.
