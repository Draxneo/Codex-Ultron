# Equipment Sales Presentation Guide

This guide is the working content model for turning equipment matchups into customer-facing proposals. The goal is to stop presenting systems as model numbers and start presenting them as clear comfort options.

## Core Principle

Customers do not buy `24SCA536 / CNPVP / 58SC`. They buy quieter rooms, better humidity control, lower operating cost, fewer surprise repairs, a warranty they understand, and confidence that the system was designed correctly.

Keep model numbers, AHRI, orientation, coil, furnace, and heat kit details available for the technician and paperwork, but do not make those the headline.

## Presentation Order

1. **Best fit headline**
   Example: `Carrier Performance 3 Ton Gas Heat System - Attic`

2. **Why this system**
   Three to five plain-language benefits tied to the home:
   - More even temperatures
   - Better humidity removal
   - Quieter outdoor operation
   - Lower operating cost potential
   - Strong parts/labor protection

3. **Comfort facts**
   Show the real numbers customers can understand:
   - SEER2 / EER2 / HSPF2 / AFUE
   - Compressor type: single-stage, two-stage, variable-speed
   - Indoor blower behavior: multi-speed, 25-speed, variable-speed
   - Outdoor sound rating when known
   - Thermostat/control package

4. **Money facts**
   - Installed price
   - Monthly payment
   - CPS estimated rebate
   - After-rebate estimate
   - Disclaimer that CPS decides final eligibility and amount

5. **What you will notice**
   Translate the specs into lived outcomes:
   - Fewer hot/cold swings
   - Less sticky air in summer
   - Quieter starts and stops
   - Better airflow and filtration options
   - More predictable ownership cost

6. **Technical details**
   Collapsed by default:
   - Condenser model
   - Furnace/air handler model
   - Coil model
   - AHRI number/certificate
   - Tonnage/cooling capacity
   - Orientation/application
   - Refrigerant
   - Warranty registration notes

## Good / Better / Best

### Good: Reliable Replacement

Use this when the customer mainly needs the lowest responsible installed price.

Typical story:
- Restores heating and cooling with proven equipment
- Standard comfort and standard noise profile
- Lowest upfront investment
- Good fit for rental homes, short-term ownership, or budget-first decisions

Typical equipment:
- Single-stage outdoor unit
- Standard or multi-speed indoor blower
- Standard thermostat
- Standard parts warranty

### Better: Best Balance

Use this as the main recommendation for most occupied homes.

Typical story:
- Better comfort than a basic system
- Lower operating cost potential
- Quieter and smoother operation
- Better humidity control
- Stronger warranty/protection story

Typical equipment:
- Two-stage outdoor unit or upgraded single-stage high-efficiency unit
- Multi-speed, 25-speed, or variable-speed indoor blower
- Smart thermostat
- CPS rebate eligibility shown clearly

### Best: Maximum Comfort

Use this when the customer cares about comfort, quiet, long ownership, humidity, energy use, or the best warranty story.

Typical story:
- Quietest and most even comfort
- Longer low-speed run times
- Best humidity control
- Highest efficiency potential
- Better diagnostics and premium controls

Typical equipment:
- Variable-speed or inverter outdoor unit
- Variable-speed/modulating furnace or fan coil
- Communicating thermostat/control
- Strongest rebate and warranty positioning where applicable

## Brand/Tier Positioning

### Carrier

Carrier central residential tiers should generally be positioned as:
- **Comfort**: value/reliable replacement, usually single-stage comfort
- **Performance**: better comfort and efficiency, often two-stage or upgraded airflow/diagnostics depending on model
- **Infinity**: premium comfort, communicating controls, variable-speed/Greenspeed on flagship models, best quiet/humidity story

Use exact claims only from the selected matchup or official model page. Tier copy can be used as fallback when model-specific data is missing.

Useful official sources:
- Carrier AC overview: https://www.carrier.com/us/en/residential/air-conditioners/
- Carrier heat pumps: https://www.carrier.com/us/en/residential/heat-pumps/
- Carrier Infinity system: https://www.carrier.com/us/en/residential/infinity-system/
- Carrier warranty: https://www.carrier.com/us/en/residential/homeowner-resources/warranty/

### Day & Night

Current Day & Night ducted tiers should generally be positioned as:
- **Performance**: budget-friendly reliable comfort
- **QuietComfort**: quieter mid-tier comfort and better protection, depending on model
- **Ion**: premium communicating comfort, humidity management, highest comfort story

`Deluxe` appears as a current ductless tier, not the main central ducted tier.

Useful official sources:
- Day & Night air conditioners: https://www.dayandnightcomfort.com/en/us/products/air-conditioners
- Day & Night heat pumps: https://www.dayandnightcomfort.com/en/us/products/heat-pumps
- Day & Night gas furnaces: https://www.dayandnightcomfort.com/en/us/products/gas-furnaces
- Day & Night warranty: https://www.dayandnightcomfort.com/en/us/product-registration-warranty

## CPS Rebate Rules

The app should calculate and display CPS rebates as estimates only.

Current posted CPS Energy HVAC replacement rebate tiers:

| SEER2 range | Early replacement | Replace on burnout |
| --- | ---: | ---: |
| 13.8-15.1 | $115/ton | $90/ton |
| 15.2-16.1 | $130/ton | $120/ton |
| 16.2-17.0 | $175/ton | $150/ton |
| 17.1-19.9 | $250/ton | $225/ton |
| 20.0+ | $310/ton | $275/ton |

Customer-safe wording:

> Based on CPS Energy's current posted rebate information, this system may qualify for an estimated rebate of up to `$___`, subject to CPS Energy approval, AHRI verification, documentation, funding availability, and final program rules.

Useful official sources:
- CPS HVAC rebates: https://resi-savenow.cpsenergy.com/cps-energy/en/savings/hvac-rebates
- CPS rebate specifications: https://resi-savenow.cpsenergy.com/cps-energy/savings/hvac-rebates-specifications/
- CPS SaveNow / STEP rebates: https://www.cpsenergy.com/en/my-home/savenow.html

## Data Needed Per Equipment Matchup

The app already has many of these fields in `equipment_matchups`. Missing or underused fields should be added to either the matchup record or a dedicated sales profile attached to the matchup.

Required:
- `brand`
- `tier`
- `system_type`
- `tonnage`
- `application`
- `condenser_model`
- `furnace_model`
- `coil_model`
- `ahri_number`
- `seer2`
- `eer2`
- `hspf2`
- `afue`
- `cooling_cap`
- `cps_tonnage`
- `early_rebate`
- `burnout_rebate`
- `factory_rebate_price`
- `monthly_payment`
- `image_url`
- `features_benefits`

Recommended additions:
- `compressor_type`
- `compressor_stages`
- `capacity_range`
- `outdoor_sound_db`
- `indoor_blower_type`
- `thermostat_control`
- `warranty_summary`
- `labor_warranty_summary`
- `energy_star`
- `refrigerant`
- `customer_headline`
- `customer_subheadline`
- `comfort_bullets`
- `quiet_bullets`
- `savings_bullets`
- `warranty_bullets`
- `rebate_disclaimer`
- `source_urls`

## Desktop Presentation Card

Recommended layout:

### Header

`Best Comfort`

`Carrier Infinity 3 Ton Gas Heat System`

`Premium comfort, quiet operation, and stronger humidity control for this home.`

### Proof Strip

Four compact facts:
- `21 SEER2`
- `12 EER2`
- `As low as 55 dB`
- `Estimated CPS rebate: $930`

### Why Customers Pick This

Cards with icons:
- Quieter outdoor operation
- Better summer humidity removal
- More even temperatures
- Smart diagnostics/control
- Strong warranty story

### Investment

Show:
- Installed price
- Monthly payment
- Estimated CPS rebate
- Estimated after-rebate price

### Technician Details

Collapsed:
- Models
- AHRI
- Orientation
- Heat kit
- Notes

## Phone Cart Direction

The phone version should stay simple:

1. Job view: photos, notes, customer info, Jarvis.
2. Add to cart: separate screen with guided system picker.
3. Cart review: big cards, one system per card, no tiny tables.
4. Preview customer view: exactly what the customer will see.

Phone cart cards should show:
- Headline
- Main comfort promise
- 3 benefit chips
- Price/monthly/rebate
- `View details`
- `Preview customer view`

Do not show dense model data unless the technician taps into details.

## Jarvis Behavior

Jarvis should think like the tech:

`Brand -> tonnage -> type -> tier -> orientation`

Example:

`Carrier -> 3 ton -> gas heat -> Performance -> attic`

Jarvis should answer in this language:
- "I found the Carrier 3 ton Performance gas heat attic matchup."
- "This is the better comfort option: two-stage style sales story, stronger humidity control, and eligible CPS rebate estimate."
- "Want me to add it to the cart as Better, or compare it against Good and Best?"

Jarvis should not invent specs. If model-specific sales fields are missing, it should use tier-level fallback copy and say "model-specific sound/warranty details need confirmation."

## Implementation Plan

1. Enrich `equipment_matchups` or add `equipment_sales_profiles`.
2. Update the desktop quote/presentation view first.
3. Store selected sales profile data on cart items when adding equipment.
4. Update customer cart preview to render benefit cards, rebate details, comfort facts, and hidden tech specs.
5. Update the mobile tech cart to use the same enriched presentation cards.
6. Update Jarvis context so it can explain and compare options using the same sales profile fields.

## Media Viewer Note

The media viewer issue should be handled separately from the proposal work:
- Use one shared URL resolver for storage paths.
- Prefer signed URLs for protected job photos.
- Add image loading, error, retry, and expired URL states.
- Avoid mixing public URL and signed URL assumptions across different gallery components.
